"""Programmable mock LLM provider for tests.

Lets each test wire deterministic responses without hitting any real API.
Usage:
    mock = MockProvider()
    mock.queue_parse(strategy=some_schema, explanation="built it")
    mock.queue_critique("Sharpe held up out-of-sample. Consider X?")
    # then call the system under test, which uses mock as its provider
"""

from collections import deque

from stratlab_schema import StrategySchema

from stratlab_api.llm.protocol import ParseResult, ParseTurn


class MockProvider:
    name = "mock"

    def __init__(self) -> None:
        self._parse_queue: deque[ParseResult] = deque()
        self._critique_queue: deque[str] = deque()
        self.parse_calls: list[tuple[str, list[ParseTurn], StrategySchema | None]] = []
        self.critique_calls: list[str] = []

    # ---- queueing ----------------------------------------------------------

    def queue_parse_strategy(
        self,
        strategy: StrategySchema,
        explanation: str = "",
    ) -> None:
        self._parse_queue.append(ParseResult(
            mode="strategy", strategy=strategy, explanation=explanation,
        ))

    def queue_parse_clarification(
        self,
        question: str,
        missing_fields: list[str] | None = None,
    ) -> None:
        self._parse_queue.append(ParseResult(
            mode="clarification",
            clarification_question=question,
            missing_fields=missing_fields or [],
        ))

    def queue_critique(self, text: str) -> None:
        self._critique_queue.append(text)

    # ---- protocol ----------------------------------------------------------

    async def parse_strategy(
        self,
        user_message: str,
        history: list[ParseTurn],
        prior_schema: StrategySchema | None,
    ) -> ParseResult:
        self.parse_calls.append((user_message, history, prior_schema))
        if not self._parse_queue:
            raise AssertionError(
                "MockProvider.parse_strategy called but no response queued"
            )
        return self._parse_queue.popleft()

    async def generate_critique(self, critique_input: str) -> str:
        self.critique_calls.append(critique_input)
        if not self._critique_queue:
            raise AssertionError(
                "MockProvider.generate_critique called but no response queued"
            )
        return self._critique_queue.popleft()
