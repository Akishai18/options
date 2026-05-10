"""HTTP request/response models. NOT the strategy DSL — that's in stratlab_schema.

We use `strategy` as the field name for the embedded StrategySchema (avoiding
the `schema` field name, which collides with Pydantic v1 conventions still in
some tooling).
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator
from stratlab_engine.results import BacktestResult
from stratlab_schema import StrategySchema

# ---- strategies ------------------------------------------------------------


class CreateStrategyRequest(BaseModel):
    strategy: StrategySchema


class CreateStrategyResponse(BaseModel):
    strategy_id: str
    version_id: str
    name: str
    strategy: StrategySchema


class StrategyVersionInfo(BaseModel):
    id: str
    created_at: datetime
    strategy: StrategySchema


class StrategySummary(BaseModel):
    id: str
    name: str
    num_versions: int
    latest_version_id: str
    created_at: datetime


class StrategyDetail(BaseModel):
    id: str
    name: str
    created_at: datetime
    versions: list[StrategyVersionInfo]


# ---- backtests -------------------------------------------------------------


class CreateBacktestRequest(BaseModel):
    """Provide either an existing version_id OR an inline strategy (not both)."""

    version_id: str | None = None
    strategy: StrategySchema | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "CreateBacktestRequest":
        if (self.version_id is None) == (self.strategy is None):
            raise ValueError("provide exactly one of `version_id` or `strategy`")
        return self


class BacktestStatusResponse(BaseModel):
    backtest_id: str
    strategy_id: str
    version_id: str
    status: str
    result: BacktestResult | None = None
    error: str | None = None


# ---- universe / metadata ---------------------------------------------------


class DataRange(BaseModel):
    start: datetime
    end: datetime
    bars: int


class UniverseResponse(BaseModel):
    assets: list[str]
    timeframes: list[str]
    data_ranges: dict[str, DataRange] = Field(
        default_factory=dict,
        description="Keyed by '<ASSET>_<timeframe>', e.g. 'BTC_1d'",
    )


class IndicatorListResponse(BaseModel):
    indicators: list[str]


# ---- health ----------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str


# ---- chat -----------------------------------------------------------------


class ChatTurnRequest(BaseModel):
    """Send a chat message. If `strategy_id` is set, continue that thread;
    otherwise start a fresh strategy."""

    message: str
    strategy_id: str | None = None


class ChatMessageInfo(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    created_at: datetime


class ParseStrategyResponse(BaseModel):
    """Result of /chat/parse — schema (or clarification) only, no backtest."""

    mode: str  # "strategy" | "clarification"
    strategy_id: str | None = None
    version_id: str | None = None
    strategy: StrategySchema | None = None
    explanation: str = ""
    clarification_question: str | None = None
    missing_fields: list[str] = []


class ChatTurnResponse(BaseModel):
    """Result of /chat/turn — combined parse + backtest in one call."""

    mode: str  # "strategy" | "clarification"
    strategy_id: str | None = None
    version_id: str | None = None
    backtest_id: str | None = None
    strategy: StrategySchema | None = None
    explanation: str = ""
    clarification_question: str | None = None
    missing_fields: list[str] = []
    backtest: BacktestStatusResponse | None = None


# ---- critique --------------------------------------------------------------


class CritiqueResponse(BaseModel):
    backtest_id: str
    text: str
