"""CLI: `python -m stratlab_engine.runner <example_module>`

Loads a STRATEGY from one of the example modules, fetches OHLCV from the
local parquet store, runs the backtest, and prints headline metrics.
"""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path

import pandas as pd
from stratlab_schema import StrategySchema

from stratlab_engine.backtester import run_backtest
from stratlab_engine.data import default_store
from stratlab_engine.results import BacktestResult


def load_strategy(spec: str) -> StrategySchema:
    """`spec` may be a module path (`examples.ma_crossover`) or a file path."""
    if spec.endswith(".py"):
        # File path — import by location.
        path = Path(spec).resolve()
        sys.path.insert(0, str(path.parent.parent))  # .../packages/schema
        mod_name = f"examples.{path.stem}"
        mod = importlib.import_module(mod_name)
    else:
        # Make the schema package's examples importable.
        schema_pkg = Path(__file__).resolve().parents[3] / "schema"
        sys.path.insert(0, str(schema_pkg))
        mod = importlib.import_module(spec)
    if not hasattr(mod, "STRATEGY"):
        raise AttributeError(f"{spec}: no STRATEGY constant defined")
    return mod.STRATEGY


def load_ohlcv(strategy: StrategySchema) -> pd.DataFrame:
    store = default_store()
    return store.read(
        strategy.data.asset,
        strategy.data.timeframe,
        start=pd.Timestamp(strategy.data.start, tz="UTC"),
        end=pd.Timestamp(strategy.data.end, tz="UTC") + pd.Timedelta(days=1),
    )


def run(spec: str) -> BacktestResult:
    strategy = load_strategy(spec)
    df = load_ohlcv(strategy)
    return run_backtest(strategy, df)


def _print_summary(result: BacktestResult) -> None:
    print(f"\n=== {result.schema_name}  (hash {result.schema_hash}) ===")
    print(f"data: {result.bars} bars, {result.data_start.date()} → {result.data_end.date()}")
    print()
    header = (
        f"{'split':<9} {'bars':>6} {'trades':>7} {'ret':>9} {'CAGR':>8} "
        f"{'Sharpe':>8} {'MaxDD':>8} {'WinRt':>7} {'PF':>7}"
    )
    print(header)
    for label, m in [
        ("full", result.metrics_full),
        ("train", result.metrics_train),
        ("val", result.metrics_val),
        ("test", result.metrics_test),
        ("bench", result.metrics_benchmark_full),
    ]:
        if m is None:
            continue
        print(f"{label:<9} {m.bars:>6} {m.num_trades:>7} "
              f"{m.total_return:>+8.2%} {m.cagr:>+7.2%} "
              f"{m.sharpe:>8.2f} {m.max_drawdown:>+7.2%} "
              f"{m.win_rate:>6.1%} {m.profit_factor:>7.2f}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="StratLab backtest runner")
    p.add_argument("strategy", help="module path (e.g. examples.ma_crossover) or .py file")
    args = p.parse_args(argv)
    result = run(args.strategy)
    _print_summary(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
