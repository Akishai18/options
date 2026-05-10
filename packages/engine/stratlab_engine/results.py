"""Canonical result types from a backtest run.

Pydantic models so they round-trip to JSON for the M3 LLM critique step.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TradeRecord(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    entry_ts: datetime
    exit_ts: datetime
    side: Literal["long", "short", "both"]
    entry_price: float
    exit_price: float
    size: float                # units of asset
    pnl: float                 # in account currency
    return_pct: float          # pnl / cost-basis
    bars_held: int
    exit_reason: Literal["signal", "stop_loss", "take_profit", "end_of_data"]


class MetricsBlock(BaseModel):
    """Summary stats for a span of equity (full / train / val / test)."""

    label: str                 # "full" | "train" | "val" | "test"
    bars: int
    num_trades: int
    total_return: float        # final/initial - 1
    cagr: float                # annualized return
    sharpe: float              # annualized
    sortino: float             # annualized
    max_drawdown: float        # negative number, e.g. -0.22
    win_rate: float            # 0..1
    profit_factor: float       # gross_win / |gross_loss|
    avg_trade_pnl: float
    exposure: float            # 0..1, fraction of bars in position


class BacktestResult(BaseModel):
    """Top-level container the engine produces for one backtest run."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    schema_name: str
    schema_hash: str
    ran_at: datetime

    # Time series — kept as lists of (ts, value) tuples for JSON friendliness.
    equity_curve: list[tuple[datetime, float]]
    benchmark_curve: list[tuple[datetime, float]]   # buy & hold
    drawdown_curve: list[tuple[datetime, float]]

    trades: list[TradeRecord]

    # Metrics on the full period and per split.
    metrics_full: MetricsBlock
    metrics_train: MetricsBlock | None = None
    metrics_val: MetricsBlock | None = None
    metrics_test: MetricsBlock | None = None
    metrics_benchmark_full: MetricsBlock

    # Provenance + reproducibility.
    data_start: datetime
    data_end: datetime
    bars: int
