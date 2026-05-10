"""LLM provider protocol + the typed values that flow through the chat layer.

The protocol exists so providers (Gemini today, Anthropic later, mock for tests)
share one calling surface. Adding a new provider = one new file in providers/.
"""

from typing import Literal, Protocol

from pydantic import BaseModel
from stratlab_schema import StrategySchema


class ParseTurn(BaseModel):
    """One conversation turn fed to the LLM."""

    role: Literal["user", "assistant"]
    content: str


class ParseResult(BaseModel):
    """Output of `LLMProvider.parse_strategy`.

    Either `strategy` is set (model produced a valid spec) or
    `clarification_question` is set (input was too ambiguous), never both.
    `explanation` is the model's natural-language rationale shown to the user.
    """

    mode: Literal["strategy", "clarification"]
    strategy: StrategySchema | None = None
    clarification_question: str | None = None
    missing_fields: list[str] = []
    explanation: str = ""
    repair_attempts: int = 0


class LLMProvider(Protocol):
    """Protocol every LLM provider implements.

    Async because the Gemini SDK exposes async methods natively, and async
    keeps FastAPI from blocking the event loop on slow LLM calls.
    """

    name: str

    async def parse_strategy(
        self,
        user_message: str,
        history: list[ParseTurn],
        prior_schema: StrategySchema | None,
    ) -> ParseResult:
        """Convert a natural-language strategy description into a validated
        StrategySchema, or return a clarification request if the input is
        too ambiguous to commit to a spec.

        Implementations must run their own validation+repair loop so the
        returned ParseResult is always either a clean schema or a clarification.
        """
        ...

    async def generate_critique(self, critique_input: str) -> str:
        """Produce a plain-text critique of a backtest result. The
        `critique_input` is a structured-stats summary string (see
        `critique.format_critique_input`). Output: 4-8 sentences, grounded
        in the numbers, ending with one suggested next iteration as a question.
        """
        ...
