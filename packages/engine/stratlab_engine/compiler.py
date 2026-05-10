"""Compile a StrategySchema's expression tree into pandas Series.

The single most important invariant: every entry/exit boolean signal is
.shift(1)'d before being handed to the backtester. This lives in ONE place
(this module) — that's our defense against look-ahead bias. Indicator code
must ALSO be causal (rolling/ewm/diff only, never .shift(-N)).
"""

from dataclasses import dataclass

import pandas as pd
from stratlab_schema import (
    Comparison,
    Constant,
    IndicatorRef,
    Logical,
    StrategySchema,
)
from stratlab_schema.strategy import ExprNode

from stratlab_engine.indicators import compute_indicator


@dataclass
class SignalSpec:
    """Output of the compiler: ready-to-execute signal arrays.

    `entries` and `exits` are bool Series aligned to df.index, ALREADY shifted
    by 1 — i.e. signal[t] means "act on bar t". The backtester does no further
    shifting.
    """

    entries: pd.Series
    exits: pd.Series | None
    price: pd.Series  # close, used for marking equity
    df: pd.DataFrame  # the OHLCV slice these signals were compiled against


def compile_strategy(schema: StrategySchema, df: pd.DataFrame) -> SignalSpec:
    """Compile a strategy against an OHLCV DataFrame.

    `df` must be indexed by tz-aware UTC timestamps with columns
    [open, high, low, close, volume].
    """
    raw_entries = _eval(schema.entry, df)
    entries = _to_bool_series(raw_entries, df.index).shift(1).fillna(False).astype(bool)

    if schema.exit is not None:
        raw_exits = _eval(schema.exit, df)
        exits = _to_bool_series(raw_exits, df.index).shift(1).fillna(False).astype(bool)
    else:
        exits = None

    return SignalSpec(entries=entries, exits=exits, price=df["close"], df=df)


# ---- internal --------------------------------------------------------------


def _eval(node: ExprNode, df: pd.DataFrame):
    """Recursively evaluate an ExprNode. Returns a Series OR a scalar (Constant)."""
    if isinstance(node, IndicatorRef):
        return compute_indicator(node.name, df, dict(node.params), node.on)
    if isinstance(node, Constant):
        return float(node.value)
    if isinstance(node, Comparison):
        return _eval_comparison(node, df)
    if isinstance(node, Logical):
        return _eval_logical(node, df)
    raise TypeError(f"unknown expression node: {type(node).__name__}")


def _eval_comparison(node: Comparison, df: pd.DataFrame) -> pd.Series:
    left = _eval(node.left, df)
    right = _eval(node.right, df)

    # Coerce to a pandas-friendly form for crosses (which need .shift(1)).
    if node.op == "cross_above":
        diff = _to_series(left, df.index) - _to_series(right, df.index)
        return (diff > 0) & (diff.shift(1) <= 0)
    if node.op == "cross_below":
        diff = _to_series(left, df.index) - _to_series(right, df.index)
        return (diff < 0) & (diff.shift(1) >= 0)

    # Plain comparisons broadcast naturally between Series and scalars.
    if node.op == "gt":
        return left > right
    if node.op == "lt":
        return left < right
    if node.op == "gte":
        return left >= right
    if node.op == "lte":
        return left <= right
    if node.op == "eq":
        return left == right
    raise ValueError(f"unknown comparison op: {node.op}")


def _eval_logical(node: Logical, df: pd.DataFrame) -> pd.Series:
    operands = [_to_bool_series(_eval(o, df), df.index) for o in node.operands]
    if node.op == "and":
        out = operands[0]
        for o in operands[1:]:
            out = out & o
        return out
    if node.op == "or":
        out = operands[0]
        for o in operands[1:]:
            out = out | o
        return out
    if node.op == "not":
        return ~operands[0]
    raise ValueError(f"unknown logical op: {node.op}")


def _to_series(value, index: pd.Index) -> pd.Series:
    if isinstance(value, pd.Series):
        return value
    return pd.Series(value, index=index, dtype="float64")


def _to_bool_series(value, index: pd.Index) -> pd.Series:
    if isinstance(value, pd.Series):
        return value.fillna(False).astype(bool)
    # scalar boolean — broadcast across the index
    return pd.Series(bool(value), index=index)
