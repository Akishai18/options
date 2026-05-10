"""StratLab strategy DSL — Pydantic v2 schema.

The schema is the contract between the LLM and the engine: the LLM emits
structured JSON via Anthropic tool-use; this module validates it; the engine
consumes the validated object. The LLM never executes code.

Design rules:
  - Declarative only. Indicators/operators/etc. come from closed Literal sets.
  - Composable boolean tree for entry/exit signals — collapses all 6 archetypes
    into one schema (see plan §3).
  - Discriminated unions on the node `type` field.
  - Schema is itself versioned (`schema_version`); future versions migrate.
"""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from stratlab_schema.enums import Asset, Side, Timeframe

# Closed vocabularies. Mirrored as Literal types on the models below; tuples
# here are exported for use by the LLM prompt layer (M3) so the prompt and the
# validator never drift.
INDICATOR_NAMES: tuple[str, ...] = (
    "sma", "ema", "rsi",
    "bbands_upper", "bbands_lower", "bbands_mid",
    "atr", "stdev", "adx", "slope",
    "close", "high", "low", "open", "volume",
    "realized_vol",
    "rolling_max", "rolling_min",
)

COMPARISON_OPS: tuple[str, ...] = (
    "gt", "lt", "gte", "lte", "cross_above", "cross_below", "eq",
)

LOGICAL_OPS: tuple[str, ...] = ("and", "or", "not")

PRICE_FIELDS: tuple[str, ...] = ("close", "high", "low", "open", "volume")


# ---- Expression tree nodes (discriminated union on `type`) -----------------


class IndicatorRef(BaseModel):
    """A reference to a named indicator with parameters.

    Example: `sma(period=20)` on close → IndicatorRef(name="sma", params={"period":20}, on="close").
    Some indicators ignore `on` (e.g. `volume` is always volume).
    """

    type: Literal["indicator"] = "indicator"
    name: Literal[
        "sma", "ema", "rsi",
        "bbands_upper", "bbands_lower", "bbands_mid",
        "atr", "stdev", "adx", "slope",
        "close", "high", "low", "open", "volume",
        "realized_vol",
        "rolling_max", "rolling_min",
    ]
    params: dict[str, float | int] = Field(default_factory=dict)
    on: Literal["close", "high", "low", "open", "volume"] = "close"


class Constant(BaseModel):
    """A literal numeric value used in comparisons (e.g. RSI < 30 → right=Constant(30))."""

    type: Literal["constant"] = "constant"
    value: float


class Comparison(BaseModel):
    """A binary comparison between two ExprNodes producing a boolean series.

    Cross_above/cross_below model the canonical "X just crossed Y" event.
    """

    type: Literal["comparison"] = "comparison"
    op: Literal["gt", "lt", "gte", "lte", "cross_above", "cross_below", "eq"]
    left: "ExprNode"
    right: "ExprNode"


class Logical(BaseModel):
    """A logical combinator over boolean ExprNodes.

    `and`/`or` require ≥2 operands. `not` requires exactly 1.
    """

    type: Literal["logical"] = "logical"
    op: Literal["and", "or", "not"]
    operands: list["ExprNode"]

    @model_validator(mode="after")
    def _arity(self) -> "Logical":
        n = len(self.operands)
        if self.op == "not" and n != 1:
            raise ValueError(f"logical 'not' requires exactly 1 operand, got {n}")
        if self.op in ("and", "or") and n < 2:
            raise ValueError(f"logical '{self.op}' requires at least 2 operands, got {n}")
        return self


# Discriminated union. Pydantic uses the `type` field to pick the right model.
ExprNode = Annotated[
    IndicatorRef | Constant | Comparison | Logical,
    Field(discriminator="type"),
]

# Resolve forward references after the union is defined.
Comparison.model_rebuild()
Logical.model_rebuild()


# ---- Strategy components ---------------------------------------------------


class DataSpec(BaseModel):
    asset: Asset
    timeframe: Timeframe
    start: date
    end: date

    @model_validator(mode="after")
    def _date_order(self) -> "DataSpec":
        if self.start >= self.end:
            raise ValueError(f"start ({self.start}) must be before end ({self.end})")
        return self


class Sizing(BaseModel):
    """Position sizing.

    - fixed_fraction: position = `fraction` of equity per trade (default 10%)
    - fixed_notional: position = `notional` USD per trade
    - vol_target:    target annualized vol = `vol_target_annual` (e.g. 0.20 = 20%)
    """

    mode: Literal["fixed_fraction", "fixed_notional", "vol_target"] = "fixed_fraction"
    fraction: float = Field(0.1, gt=0, le=1.0)
    notional: float | None = Field(None, gt=0)
    vol_target_annual: float | None = Field(None, gt=0, le=2.0)

    @model_validator(mode="after")
    def _required_for_mode(self) -> "Sizing":
        if self.mode == "fixed_notional" and self.notional is None:
            raise ValueError("sizing.mode='fixed_notional' requires `notional`")
        if self.mode == "vol_target" and self.vol_target_annual is None:
            raise ValueError("sizing.mode='vol_target' requires `vol_target_annual`")
        return self


class RiskRules(BaseModel):
    stop_loss_pct: float | None = Field(None, gt=0, le=1.0)
    take_profit_pct: float | None = Field(None, gt=0, le=10.0)
    max_position_pct: float = Field(1.0, gt=0, le=1.0)
    max_concurrent_positions: int = Field(1, ge=1, le=10)


class Costs(BaseModel):
    """Transaction costs in basis points (1 bps = 0.01%)."""

    fee_bps: float = Field(10.0, ge=0, le=500)
    slippage_bps: float = Field(5.0, ge=0, le=500)


class Splits(BaseModel):
    """Train/val/test split. Must sum to 1.0."""

    train: float = Field(0.6, ge=0, le=1.0)
    val: float = Field(0.2, ge=0, le=1.0)
    test: float = Field(0.2, ge=0, le=1.0)

    @model_validator(mode="after")
    def _sum_to_one(self) -> "Splits":
        total = self.train + self.val + self.test
        if not (0.999 <= total <= 1.001):
            raise ValueError(f"train+val+test must sum to 1.0, got {total}")
        return self


# ---- Top-level strategy ----------------------------------------------------


class StrategySchema(BaseModel):
    """A complete StratLab strategy definition.

    The LLM emits this; the engine consumes it. If `exit` is None, exits are
    risk-driven (require stop_loss or take_profit on `risk`).
    """

    schema_version: Literal["1.0.0"] = "1.0.0"
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    side: Side = Side.LONG
    data: DataSpec
    entry: ExprNode
    exit: ExprNode | None = None
    sizing: Sizing = Field(default_factory=Sizing)
    risk: RiskRules = Field(default_factory=RiskRules)
    costs: Costs = Field(default_factory=Costs)
    splits: Splits = Field(default_factory=Splits)
    perturbable_params: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _exit_requires_signal_or_risk(self) -> "StrategySchema":
        # If there's no exit signal, risk rules must provide a way out.
        if (
            self.exit is None
            and self.risk.stop_loss_pct is None
            and self.risk.take_profit_pct is None
        ):
            raise ValueError(
                "strategy has no `exit` signal AND no stop_loss_pct/take_profit_pct "
                "on `risk` — positions would never close. Set one."
            )
        return self
