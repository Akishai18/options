"""M1 acceptance tests for the backtest engine.

Coverage:
  - Compiler: indicators, comparisons, logical ops, the load-bearing
    look-ahead shift (signal at bar t reflects info up to bar t-1).
  - Engine: end-to-end runs on synthetic data, stop-loss / take-profit fire,
    short side profits in a downtrend, equity at bar t is independent of
    future bars (no peeking).
  - BacktestResult JSON round-trip (the M5 critique pipeline depends on this).
  - Optional integration: every M0 example can be backtested against the
    real backfilled OHLCV (skipped automatically if backfill hasn't run).
"""

from __future__ import annotations

import importlib
import pkgutil

import examples
import numpy as np
import pandas as pd
import pytest
from stratlab_engine.backtester import run_backtest
from stratlab_engine.compiler import compile_strategy
from stratlab_engine.data import default_store
from stratlab_engine.indicators import compute_indicator
from stratlab_engine.results import BacktestResult
from stratlab_schema import (
    Asset,
    Comparison,
    Constant,
    Costs,
    DataSpec,
    IndicatorRef,
    Logical,
    RiskRules,
    Side,
    Sizing,
    StrategySchema,
    Timeframe,
)

# ---- fixtures --------------------------------------------------------------


@pytest.fixture
def synthetic_uptrend() -> pd.DataFrame:
    n = 600
    idx = pd.date_range("2022-01-01", periods=n, freq="1D", tz="UTC")
    rng = np.random.default_rng(42)
    log_drift = 0.001
    noise = rng.normal(0, 0.012, n)
    log_price = np.cumsum(log_drift + noise)
    close = 100 * np.exp(log_price)
    high = close * (1 + np.abs(rng.normal(0, 0.005, n)))
    low = close * (1 - np.abs(rng.normal(0, 0.005, n)))
    open_ = close * (1 + rng.normal(0, 0.002, n))
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": np.full(n, 1000.0)},
        index=idx,
    )


def _flat_ohlcv(closes: np.ndarray, freq: str = "1D") -> pd.DataFrame:
    """High/low equal to close — useful for controlling stop logic precisely."""
    n = len(closes)
    idx = pd.date_range("2024-01-01", periods=n, freq=freq, tz="UTC")
    return pd.DataFrame(
        {"open": closes, "high": closes, "low": closes, "close": closes, "volume": np.full(n, 1.0)},
        index=idx,
    )


def _trivial_schema(df: pd.DataFrame, **overrides) -> StrategySchema:
    base = dict(
        name="trivial",
        data=DataSpec(
            asset=Asset.BTC, timeframe=Timeframe.D1,
            start=df.index[0].date(), end=df.index[-1].date(),
        ),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
        exit=Comparison(op="lt", left=IndicatorRef(name="close"), right=Constant(value=-1)),
        sizing=Sizing(mode="fixed_fraction", fraction=0.99),
        costs=Costs(fee_bps=0, slippage_bps=0),
    )
    base.update(overrides)
    return StrategySchema(**base)


# ---- look-ahead defense (the load-bearing test) ---------------------------


def test_compiler_shifts_signals_by_one_bar():
    """A signal computable at bar t's close should fire at bar t+1, not bar t."""
    closes = np.array([100.0] * 5 + [200.0] * 5)
    df = _flat_ohlcv(closes)
    schema = StrategySchema(
        name="threshold",
        data=DataSpec(
            asset=Asset.BTC, timeframe=Timeframe.D1,
            start=df.index[0].date(), end=df.index[-1].date(),
        ),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=150)),
        exit=Comparison(op="lt", left=IndicatorRef(name="close"), right=Constant(value=50)),
    )
    spec = compile_strategy(schema, df)
    # close > 150 first becomes True at bar 5.
    # After .shift(1) the entry first reads True at bar 6.
    assert not bool(spec.entries.iloc[5]), "without shift the engine would peek"
    assert bool(spec.entries.iloc[6]), "with shift the entry fires the next bar"


def test_engine_equity_at_bar_t_independent_of_future():
    """Mark-to-market at bar 19 must not depend on data at bar 20+."""
    # Two scenarios that diverge only after bar 20:
    closes_a = np.full(30, 100.0)
    closes_a[20:] = 200.0
    closes_b = np.full(30, 100.0)
    closes_b[20:] = 50.0
    df_a = _flat_ohlcv(closes_a)
    df_b = _flat_ohlcv(closes_b)
    schema = _trivial_schema(df_a, exit=None, risk=RiskRules(stop_loss_pct=0.99))
    res_a = run_backtest(schema, df_a)
    # Re-stamp data dates on schema_b so DataSpec doesn't reject.
    schema_b = _trivial_schema(df_b, exit=None, risk=RiskRules(stop_loss_pct=0.99))
    res_b = run_backtest(schema_b, df_b)
    eq_a_19 = res_a.equity_curve[19][1]
    eq_b_19 = res_b.equity_curve[19][1]
    assert abs(eq_a_19 - eq_b_19) < 1e-9, \
        f"equity at bar 19 differs ({eq_a_19} vs {eq_b_19}) — engine peeked at bar 20"


# ---- indicator spot-checks -------------------------------------------------


def test_sma_correctness():
    closes = pd.Series([1, 2, 3, 4, 5], dtype="float64",
                       index=pd.date_range("2024-01-01", periods=5, tz="UTC"))
    df = pd.DataFrame({"close": closes, "open": closes, "high": closes, "low": closes,
                       "volume": closes})
    out = compute_indicator("sma", df, {"period": 3}, "close")
    assert pd.isna(out.iloc[0]) and pd.isna(out.iloc[1])
    assert out.iloc[2] == 2.0
    assert out.iloc[3] == 3.0
    assert out.iloc[4] == 4.0


def test_rsi_in_bounds(synthetic_uptrend):
    out = compute_indicator("rsi", synthetic_uptrend, {"period": 14}, "close")
    valid = out.dropna()
    assert (valid >= 0).all() and (valid <= 100).all()
    assert len(valid) > 100  # some computation actually happened


def test_rolling_max_uses_prior_bars_only():
    """rolling_max returns max of the PRIOR `period` bars — Donchian convention.
    Without this, `close > rolling_max(high)` would never fire (close ≤ high)."""
    closes = pd.Series(np.arange(10, dtype=float),
                       index=pd.date_range("2024-01-01", periods=10, tz="UTC"))
    df = pd.DataFrame({
        "close": closes, "open": closes,
        "high": closes + 5, "low": closes - 5,
        "volume": closes,
    })
    out = compute_indicator("rolling_max", df, {"period": 3}, "high")
    # high values: 5,6,7,8,9,10,11,12,13,14
    # prior-3-bar max for bar 3 = max(high[0..2]) = max(5,6,7) = 7
    assert pd.isna(out.iloc[2]), "first valid bar is bar 3 (needs 3 prior)"
    assert out.iloc[3] == 7.0
    assert out.iloc[9] == 13.0  # max(high[6..8]) = max(11,12,13)


def test_rolling_max_breakout_can_actually_fire():
    """Sanity: close > rolling_max(high) must be possible. Was a real bug."""
    n = 30
    closes = np.full(n, 100.0)
    closes[10:] = 110.0  # step up after bar 10
    df = _flat_ohlcv(closes)
    schema = StrategySchema(
        name="step breakout",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="gt",
                         left=IndicatorRef(name="close"),
                         right=IndicatorRef(name="rolling_max", params={"period": 5}, on="high")),
        exit=None,
        risk=RiskRules(stop_loss_pct=0.5),
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
        costs=Costs(fee_bps=0, slippage_bps=0),
    )
    result = run_backtest(schema, df)
    assert result.metrics_full.num_trades >= 1, "breakout signal should fire at least once"


def test_cross_above_fires_on_correct_bar():
    """cross_above(left, right): True iff diff>0 and prev diff <= 0."""
    closes = np.array([100.0, 100.0, 100.0, 200.0, 200.0])
    df = _flat_ohlcv(closes)
    schema = StrategySchema(
        name="cross",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(
            op="cross_above",
            left=IndicatorRef(name="close"),
            right=Constant(value=150),
        ),
        exit=None,
        risk=RiskRules(stop_loss_pct=0.99),
    )
    spec = compile_strategy(schema, df)
    # Cross above 150 first happens at bar 3; after shift(1), signal is True at bar 4.
    assert not bool(spec.entries.iloc[3])
    assert bool(spec.entries.iloc[4])


# ---- engine end-to-end ----------------------------------------------------


def test_buy_and_hold_tracks_benchmark():
    n = 100
    closes = np.linspace(100, 200, n)  # +100% over 100 bars
    df = _flat_ohlcv(closes)
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99, take_profit_pct=9.99),
                             sizing=Sizing(mode="fixed_fraction", fraction=0.99),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    # Should be ~99% return (slightly off because we close out at end-of-data).
    assert 0.93 < result.metrics_full.total_return < 1.05
    assert result.metrics_full.num_trades == 1
    assert result.metrics_benchmark_full.total_return == pytest.approx(0.99, abs=0.02)


def test_short_strategy_profits_in_downtrend():
    n = 50
    closes = np.linspace(200, 100, n)  # -50%
    df = _flat_ohlcv(closes)
    schema = StrategySchema(
        name="hold short",
        side=Side.SHORT,
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
        exit=None,
        risk=RiskRules(stop_loss_pct=0.99),
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
        costs=Costs(fee_bps=0, slippage_bps=0),
    )
    result = run_backtest(schema, df)
    assert result.metrics_full.total_return > 0
    assert result.trades and result.trades[0].side == "short"


def test_stop_loss_fires_intra_bar():
    n = 30
    closes = np.full(n, 100.0)
    closes[10:] = 90.0  # 10% drop after entry
    df = _flat_ohlcv(closes)
    df.iloc[10, df.columns.get_loc("low")] = 89.0  # low dips below close
    schema = StrategySchema(
        name="tight stop",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=50)),
        exit=None,
        risk=RiskRules(stop_loss_pct=0.05),  # 5% stop
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
        costs=Costs(fee_bps=0, slippage_bps=0),
    )
    result = run_backtest(schema, df)
    assert result.trades
    sl_trades = [t for t in result.trades if t.exit_reason == "stop_loss"]
    assert sl_trades, "stop loss should have fired on the drop"


def test_take_profit_fires_intra_bar():
    n = 30
    closes = np.full(n, 100.0)
    df = _flat_ohlcv(closes)
    df.iloc[10, df.columns.get_loc("high")] = 115.0  # high crosses above 110 trigger
    schema = StrategySchema(
        name="tp",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=50)),
        exit=None,
        risk=RiskRules(stop_loss_pct=0.99, take_profit_pct=0.10),
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
        costs=Costs(fee_bps=0, slippage_bps=0),
    )
    result = run_backtest(schema, df)
    tp_trades = [t for t in result.trades if t.exit_reason == "take_profit"]
    assert tp_trades, "take profit should have fired on the spike"


def test_logical_and_combines_correctly(synthetic_uptrend):
    df = synthetic_uptrend
    schema = StrategySchema(
        name="trend + RSI",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Logical(op="and", operands=[
            Comparison(op="gt",
                       left=IndicatorRef(name="ema", params={"period": 20}),
                       right=IndicatorRef(name="ema", params={"period": 50})),
            Comparison(op="gt",
                       left=IndicatorRef(name="rsi", params={"period": 14}),
                       right=Constant(value=50)),
        ]),
        exit=Comparison(op="lt",
                        left=IndicatorRef(name="ema", params={"period": 20}),
                        right=IndicatorRef(name="ema", params={"period": 50})),
        risk=RiskRules(stop_loss_pct=0.10),
        costs=Costs(fee_bps=0, slippage_bps=0),
    )
    result = run_backtest(schema, df)
    assert result.bars == len(df)
    # Strategy should produce at least one trade on a 600-day random uptrend.
    assert result.metrics_full.num_trades >= 1


def test_vol_target_sizing_scales_inversely_with_vol():
    """Higher realized vol → smaller position. Compares two synthetic series:
    one quiet (vol ~ 1%/bar), one loud (vol ~ 5%/bar). vol_target sizing
    should result in smaller positions for the loud one."""
    n = 100
    rng = np.random.default_rng(0)
    quiet_returns = rng.normal(0.001, 0.005, n)
    loud_returns = rng.normal(0.001, 0.05, n)
    quiet_close = 100 * np.exp(np.cumsum(quiet_returns))
    loud_close = 100 * np.exp(np.cumsum(loud_returns))
    df_quiet = _flat_ohlcv(quiet_close)
    df_loud = _flat_ohlcv(loud_close)

    def _make_schema(df):
        return StrategySchema(
            name="vol target",
            data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                          start=df.index[0].date(), end=df.index[-1].date()),
            entry=Comparison(op="gt", left=IndicatorRef(name="close"),
                             right=Constant(value=0)),
            exit=None,
            risk=RiskRules(stop_loss_pct=0.99),
            sizing=Sizing(mode="vol_target", fraction=1.0, vol_target_annual=0.20),
            costs=Costs(fee_bps=0, slippage_bps=0),
        )

    res_quiet = run_backtest(_make_schema(df_quiet), df_quiet)
    res_loud = run_backtest(_make_schema(df_loud), df_loud)
    # First trade in each: compare entry size relative to entry price * starting equity (1.0).
    quiet_entry = res_quiet.trades[0]
    loud_entry = res_loud.trades[0]
    quiet_position_pct = quiet_entry.size * quiet_entry.entry_price
    loud_position_pct = loud_entry.size * loud_entry.entry_price
    assert loud_position_pct < quiet_position_pct, \
        f"loud market position ({loud_position_pct:.3f}) should be smaller than " \
        f"quiet market position ({quiet_position_pct:.3f})"


def test_side_both_emits_warning():
    """side=BOTH falls back to long-only with a warning (not silent)."""
    df = _flat_ohlcv(np.linspace(100, 110, 30))
    schema = StrategySchema(
        name="both",
        side=Side.BOTH,
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"),
                         right=Constant(value=0)),
        exit=None,
        risk=RiskRules(stop_loss_pct=0.5),
        costs=Costs(fee_bps=0, slippage_bps=0),
    )
    with pytest.warns(UserWarning, match="not supported"):
        run_backtest(schema, df)


def test_metrics_split_into_train_val_test(synthetic_uptrend):
    df = synthetic_uptrend
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             sizing=Sizing(mode="fixed_fraction", fraction=0.5),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    assert result.metrics_train and result.metrics_val and result.metrics_test
    assert result.metrics_train.bars + result.metrics_val.bars + result.metrics_test.bars == len(df)


def test_backtest_result_json_roundtrip(synthetic_uptrend):
    df = synthetic_uptrend
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    raw = result.model_dump_json()
    rebuilt = BacktestResult.model_validate_json(raw)
    assert rebuilt.schema_hash == result.schema_hash
    assert rebuilt.bars == result.bars
    assert len(rebuilt.equity_curve) == len(result.equity_curve)


# ---- anti-overfit analyses ------------------------------------------------


def test_cost_stress_runs_at_each_multiplier(synthetic_uptrend):
    df = synthetic_uptrend
    schema = StrategySchema(
        name="ema cross — fee sensitive",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="cross_above",
                         left=IndicatorRef(name="ema", params={"period": 10}),
                         right=IndicatorRef(name="ema", params={"period": 30})),
        exit=Comparison(op="cross_below",
                        left=IndicatorRef(name="ema", params={"period": 10}),
                        right=IndicatorRef(name="ema", params={"period": 30})),
        risk=RiskRules(stop_loss_pct=0.10),
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
        costs=Costs(fee_bps=10, slippage_bps=0),
    )
    result = run_backtest(schema, df)
    assert len(result.cost_stress) == 3
    mults = [p.multiplier for p in result.cost_stress]
    assert mults == [1.0, 1.5, 2.0]
    fee_at_1 = result.cost_stress[0].fee_bps
    fee_at_2 = result.cost_stress[2].fee_bps
    assert fee_at_2 == pytest.approx(2 * fee_at_1)


def test_cost_stress_higher_fees_dont_improve_sharpe(synthetic_uptrend):
    """At higher fees, a strategy that actually trades cannot do BETTER on
    sharpe. (It can be flat if there are zero trades.)"""
    df = synthetic_uptrend
    schema = StrategySchema(
        name="frequent EMA — high fee burden",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="cross_above",
                         left=IndicatorRef(name="ema", params={"period": 5}),
                         right=IndicatorRef(name="ema", params={"period": 15})),
        exit=Comparison(op="cross_below",
                        left=IndicatorRef(name="ema", params={"period": 5}),
                        right=IndicatorRef(name="ema", params={"period": 15})),
        risk=RiskRules(stop_loss_pct=0.10),
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
        costs=Costs(fee_bps=20, slippage_bps=0),
    )
    result = run_backtest(schema, df)
    assert result.cost_stress
    base_sharpe = result.cost_stress[0].sharpe
    high_sharpe = result.cost_stress[-1].sharpe
    # Higher costs strictly cannot increase sharpe (within fp noise).
    assert high_sharpe <= base_sharpe + 1e-9, (
        f"cost stress should not raise Sharpe ({base_sharpe:.3f} → {high_sharpe:.3f})"
    )


def test_regime_breakdown_returns_four_cells(synthetic_uptrend):
    df = synthetic_uptrend
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             sizing=Sizing(mode="fixed_fraction", fraction=0.5),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    rb = result.regime_breakdown
    assert rb is not None
    # All four labels populated, fractions sum to ~2 (since the two splits
    # are independent partitions, each summing to ~1).
    assert rb.low_vol.label == "low_vol"
    assert rb.high_vol.label == "high_vol"
    assert rb.trending.label == "trending"
    assert rb.sideways.label == "sideways"
    vol_sum = rb.low_vol.fraction + rb.high_vol.fraction
    trend_sum = rb.trending.fraction + rb.sideways.fraction
    assert 0.95 < vol_sum < 1.05
    assert 0.95 < trend_sum < 1.05


def test_sensitivity_halo_envelope_brackets_baseline(synthetic_uptrend):
    """halo lo[t] ≤ baseline[t] ≤ hi[t] at every bar — by construction."""
    df = synthetic_uptrend
    schema = StrategySchema(
        name="ema cross sensitive",
        data=DataSpec(asset=Asset.BTC, timeframe=Timeframe.D1,
                      start=df.index[0].date(), end=df.index[-1].date()),
        entry=Comparison(op="cross_above",
                         left=IndicatorRef(name="ema", params={"period": 20}),
                         right=IndicatorRef(name="ema", params={"period": 50})),
        exit=Comparison(op="cross_below",
                        left=IndicatorRef(name="ema", params={"period": 20}),
                        right=IndicatorRef(name="ema", params={"period": 50})),
        risk=RiskRules(stop_loss_pct=0.10),
        sizing=Sizing(mode="fixed_fraction", fraction=0.5),
        costs=Costs(fee_bps=0, slippage_bps=0),
        perturbable_params=[
            "entry.left.params.period",
            "entry.right.params.period",
        ],
    )
    result = run_backtest(schema, df)
    halo = result.sensitivity_halo
    assert halo is not None
    assert halo.delta == pytest.approx(0.20)
    assert len(halo.envelope_lo) == result.bars
    assert len(halo.envelope_hi) == result.bars
    base_eq = [v for _, v in result.equity_curve]
    for i, ((_, lo), (_, hi)) in enumerate(
        zip(halo.envelope_lo, halo.envelope_hi, strict=True)
    ):
        assert lo <= base_eq[i] + 1e-9, f"bar {i}: lo {lo} > base {base_eq[i]}"
        assert hi >= base_eq[i] - 1e-9, f"bar {i}: hi {hi} < base {base_eq[i]}"
    assert len(halo.perturbations) == 2


def test_sensitivity_halo_skipped_when_no_perturbable_params(synthetic_uptrend):
    """No perturbable_params → no halo (saves 2N+1 reruns when nothing to do)."""
    df = synthetic_uptrend
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    assert result.sensitivity_halo is None


def test_sensitivity_halo_caps_at_max_params(synthetic_uptrend):
    """More than MAX_PARAMS perturbable paths → cap enforced; excess in skipped_paths."""
    from stratlab_engine.overfitting.sensitivity import MAX_PARAMS
    df = synthetic_uptrend
    # Use a schema with multiple integer params; reuse the same path many times
    # to exceed the cap (the cap is enforced on path count, not uniqueness).
    paths = ["risk.stop_loss_pct"] * (MAX_PARAMS + 2)
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.10),
                             costs=Costs(fee_bps=0, slippage_bps=0),
                             perturbable_params=paths)
    result = run_backtest(schema, df)
    halo = result.sensitivity_halo
    assert halo is not None
    assert len(halo.perturbed_paths) == MAX_PARAMS
    assert len(halo.skipped_paths) >= 2


def test_walk_forward_produces_n_folds_with_disjoint_test_windows(synthetic_uptrend):
    df = synthetic_uptrend
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             sizing=Sizing(mode="fixed_fraction", fraction=0.5),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    wf = result.walk_forward
    assert wf is not None
    assert wf.n_folds == 5
    assert len(wf.folds) == 5
    # Test windows must be strictly forward-rolling and disjoint.
    for prev, cur in zip(wf.folds[:-1], wf.folds[1:], strict=True):
        assert cur.test_start >= prev.test_end, (
            f"fold {cur.index} test starts at {cur.test_start} before "
            f"fold {prev.index} test ends at {prev.test_end}"
        )
    # Aggregate stats are well-formed.
    assert -10 < wf.mean_sharpe < 10
    assert 0.0 <= wf.pct_positive_sharpe <= 1.0
    assert wf.sharpe_stdev >= 0


def test_walk_forward_skipped_for_too_few_bars():
    """A 50-bar dataset is too short to fit 5 meaningful folds → None."""
    df = _flat_ohlcv(np.linspace(100, 110, 50))
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    assert result.walk_forward is None


def test_walk_forward_pct_positive_high_for_monotone_uptrend():
    """Buy-and-hold on a monotone uptrend should be positive in every fold."""
    n = 600
    closes = np.linspace(100, 300, n)
    df = _flat_ohlcv(closes)
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             sizing=Sizing(mode="fixed_fraction", fraction=0.99),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    wf = result.walk_forward
    assert wf is not None
    assert wf.pct_positive_sharpe >= 0.6, (
        f"buy-and-hold on a steady uptrend should win most folds; got "
        f"{wf.pct_positive_sharpe:.0%}"
    )


def test_regime_breakdown_skipped_for_short_test_window():
    """A 50-bar dataset → test split too small → regime_breakdown is None."""
    df = _flat_ohlcv(np.linspace(100, 110, 50))
    schema = _trivial_schema(df, exit=None,
                             risk=RiskRules(stop_loss_pct=0.99),
                             costs=Costs(fee_bps=0, slippage_bps=0))
    result = run_backtest(schema, df)
    assert result.regime_breakdown is None


# ---- integration: run every M0 example on real backfilled data -----------


def _all_examples() -> list[tuple[str, StrategySchema]]:
    out = []
    for info in pkgutil.iter_modules(examples.__path__):
        mod = importlib.import_module(f"examples.{info.name}")
        out.append((info.name, mod.STRATEGY))
    return sorted(out)


@pytest.mark.parametrize("name,strategy", _all_examples())
def test_example_runs_end_to_end_on_real_data(name, strategy):
    store = default_store()
    if not store.has(strategy.data.asset, strategy.data.timeframe):
        pytest.skip(f"backfill missing for ({strategy.data.asset.value}, "
                    f"{strategy.data.timeframe.value}); run scripts/backfill.py")
    df = store.read(
        strategy.data.asset, strategy.data.timeframe,
        start=pd.Timestamp(strategy.data.start, tz="UTC"),
        end=pd.Timestamp(strategy.data.end, tz="UTC") + pd.Timedelta(days=1),
    )
    if len(df) < 100:
        pytest.skip(f"{name}: only {len(df)} bars available; need ≥100")
    result = run_backtest(strategy, df)
    assert result.bars == len(df)
    # Sanity: metrics should be finite.
    assert np.isfinite(result.metrics_full.sharpe)
    assert np.isfinite(result.metrics_full.max_drawdown)
    # Equity curve is the same length as the data.
    assert len(result.equity_curve) == len(df)
