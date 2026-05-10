"""Gemini provider — google-genai SDK against AI Studio (free tier).

Schema parsing strategy: ask the model for raw JSON via `response_mime_type`,
parse the result, validate with Pydantic. We do NOT use Gemini's
`response_schema` because StrategySchema's discriminated unions don't translate
cleanly to Gemini's protobuf-derived schema format.

Repair loop: on validation failure, send the validation error back as a
follow-up user turn (one retry). Two strikes → return clarification.
"""

from __future__ import annotations

import json

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError
from stratlab_schema import StrategySchema

from stratlab_api.llm.prompts import (
    CRITIQUE_SYSTEM_PROMPT,
    PARSE_SYSTEM_PROMPT,
    few_shot_pairs,
)
from stratlab_api.llm.protocol import ParseResult, ParseTurn

MAX_REPAIR_ATTEMPTS = 1  # one retry on validation failure, then bail to clarification


class _RawParseEnvelope(BaseModel):
    """Wire format the model is asked to produce."""

    mode: str
    explanation: str = ""
    strategy: dict | None = None
    clarification_question: str | None = None
    missing_fields: list[str] = []


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model_parse: str, model_critique: str):
        self._client = genai.Client(api_key=api_key)
        self._model_parse = model_parse
        self._model_critique = model_critique

    # ---- parse_strategy ----------------------------------------------------

    async def parse_strategy(
        self,
        user_message: str,
        history: list[ParseTurn],
        prior_schema: StrategySchema | None,
    ) -> ParseResult:
        contents = self._build_parse_contents(user_message, history, prior_schema)
        config = types.GenerateContentConfig(
            system_instruction=PARSE_SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.0,
        )

        attempt = 0
        last_error: str | None = None

        while attempt <= MAX_REPAIR_ATTEMPTS:
            response = await self._client.aio.models.generate_content(
                model=self._model_parse,
                contents=contents,
                config=config,
            )
            raw_text = (response.text or "").strip()
            try:
                envelope = _decode_envelope(raw_text)
                result = _envelope_to_result(envelope, repair_attempts=attempt)
                return result
            except _ParseValidationError as e:
                last_error = str(e)
                attempt += 1
                if attempt > MAX_REPAIR_ATTEMPTS:
                    break
                # Repair turn: ask the model to fix what failed validation.
                contents = contents + [
                    _user_part(
                        f"The previous JSON failed validation: {last_error}\n"
                        f"Re-emit the same response object with the error fixed. "
                        f"Do not explain — just the corrected JSON."
                    )
                ]

        # Two strikes — surface as a clarification so the user gets a path forward.
        return ParseResult(
            mode="clarification",
            clarification_question=(
                "I couldn't translate that into a valid strategy spec. "
                "Could you rephrase with the asset, timeframe, and the entry/exit "
                "rule you want? "
                f"(parser error: {last_error})"
            ),
            missing_fields=["asset", "timeframe", "entry_rule"],
            repair_attempts=attempt,
        )

    # ---- generate_critique -------------------------------------------------

    async def generate_critique(self, critique_input: str) -> str:
        config = types.GenerateContentConfig(
            system_instruction=CRITIQUE_SYSTEM_PROMPT,
            temperature=0.3,
        )
        response = await self._client.aio.models.generate_content(
            model=self._model_critique,
            contents=[_user_part(critique_input)],
            config=config,
        )
        return (response.text or "").strip()

    async def stream_critique(self, critique_input: str):
        """Yield critique text chunks as Gemini emits them."""
        config = types.GenerateContentConfig(
            system_instruction=CRITIQUE_SYSTEM_PROMPT,
            temperature=0.3,
        )
        stream = await self._client.aio.models.generate_content_stream(
            model=self._model_critique,
            contents=[_user_part(critique_input)],
            config=config,
        )
        async for chunk in stream:
            text = chunk.text or ""
            if text:
                yield text

    # ---- helpers -----------------------------------------------------------

    def _build_parse_contents(
        self,
        user_message: str,
        history: list[ParseTurn],
        prior_schema: StrategySchema | None,
    ) -> list[types.Content]:
        contents: list[types.Content] = []

        # Few-shots as alternating user/model turns at the start.
        for u_text, a_text in few_shot_pairs():
            contents.append(_user_part(u_text))
            contents.append(_model_part(a_text))

        # Conversation history, if any.
        for turn in history:
            role = "user" if turn.role == "user" else "model"
            contents.append(_text_part(role, turn.content))

        # If there's a prior schema, drop it as context just before the user message.
        if prior_schema is not None:
            contents.append(_user_part(
                "Modifying this existing strategy:\n"
                + prior_schema.model_dump_json()
            ))

        contents.append(_user_part(user_message))
        return contents


# ---- envelope decoding -----------------------------------------------------


class _ParseValidationError(Exception):
    """Raised when the model's response can't be turned into a ParseResult."""


def _decode_envelope(raw_text: str) -> _RawParseEnvelope:
    if not raw_text:
        raise _ParseValidationError("empty response from model")
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise _ParseValidationError(f"response was not valid JSON: {e}") from e
    try:
        return _RawParseEnvelope.model_validate(payload)
    except ValidationError as e:
        raise _ParseValidationError(f"response envelope failed validation: {e}") from e


def _envelope_to_result(envelope: _RawParseEnvelope, repair_attempts: int) -> ParseResult:
    if envelope.mode == "strategy":
        if envelope.strategy is None:
            raise _ParseValidationError("mode=strategy but no `strategy` field")
        try:
            schema = StrategySchema.model_validate(envelope.strategy)
        except ValidationError as e:
            raise _ParseValidationError(f"strategy schema invalid: {e}") from e
        return ParseResult(
            mode="strategy",
            strategy=schema,
            explanation=envelope.explanation,
            repair_attempts=repair_attempts,
        )
    if envelope.mode == "clarification":
        if not envelope.clarification_question:
            raise _ParseValidationError(
                "mode=clarification but no `clarification_question`"
            )
        return ParseResult(
            mode="clarification",
            clarification_question=envelope.clarification_question,
            missing_fields=envelope.missing_fields,
            explanation=envelope.explanation,
            repair_attempts=repair_attempts,
        )
    raise _ParseValidationError(f"unknown mode: {envelope.mode!r}")


# ---- Content/Part helpers --------------------------------------------------


def _user_part(text: str) -> types.Content:
    return types.Content(role="user", parts=[types.Part.from_text(text=text)])


def _model_part(text: str) -> types.Content:
    return types.Content(role="model", parts=[types.Part.from_text(text=text)])


def _text_part(role: str, text: str) -> types.Content:
    return types.Content(role=role, parts=[types.Part.from_text(text=text)])
