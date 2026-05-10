"""Sensitivity halo: how much do small parameter changes move the equity curve?

For each path in `schema.perturbable_params`, we run two extra backtests with
that one param scaled to (1 - DELTA) and (1 + DELTA) of its baseline value.
Across the resulting 2N+1 equity curves, the per-bar min and max form an
ENVELOPE (the "halo") around the baseline.

A wide halo means the strategy is fragile — small parameter changes move the
curve a lot. A narrow halo means the strategy is robust to the exact
parameter choices.

Cost note: the plan calls out one-at-a-time perturbation (not full grid) on
purpose — the full grid is 3^N. We cap N at MAX_PARAMS to keep wall-clock
predictable. With the default cap (6), worst case is 13 backtest reruns.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np
import pandas as pd
from pydantic import BaseModel
from stratlab_schema import StrategySchema

if TYPE_CHECKING:
    from stratlab_engine.results import MetricsBlock

DELTA = 0.20            # ±20% perturbation per the plan
MAX_PARAMS = 6          # cap N to keep cost predictable
MIN_PERTURBED_VALUE = 1e-9   # avoid sending zero/negative into integer params


class PerturbationStat(BaseModel):
    """Per-parameter sensitivity stat — how the test-split sharpe moved at ±delta."""

    path: str
    base_value: float
    low_value: float
    high_value: float
    base_sharpe: float
    low_sharpe: float
    high_sharpe: float
    sharpe_range: float    # max(sharpe) - min(sharpe) across the three runs


class SensitivityHalo(BaseModel):
    """Envelope around the baseline equity, plus per-parameter sharpe spread."""

    delta: float                        # the perturbation magnitude (e.g., 0.20)
    perturbed_paths: list[str]          # paths actually perturbed (after cap)
    skipped_paths: list[str] = []       # paths skipped due to non-numeric / cap
    envelope_lo: list[tuple[Any, float]]   # per-bar floor across all runs
    envelope_hi: list[tuple[Any, float]]   # per-bar ceiling across all runs
    median_width: float                 # median of (hi - lo) / baseline across bars
    perturbations: list[PerturbationStat]


def run_sensitivity(
    schema: StrategySchema,
    df: pd.DataFrame,
    baseline_equity: pd.Series,
    baseline_metrics_test: MetricsBlock | None,
    test_slice: slice,
) -> SensitivityHalo | None:
    """Run sensitivity analysis. Returns None if there are no perturbable params.

    `baseline_equity` is the curve from the just-completed main backtest —
    we don't recompute it here.
    """
    paths = list(schema.perturbable_params)
    skipped: list[str] = []
    if len(paths) > MAX_PARAMS:
        skipped = paths[MAX_PARAMS:]
        paths = paths[:MAX_PARAMS]

    if not paths:
        return None

    base_payload = schema.model_dump(mode="python")

    base_sharpe = baseline_metrics_test.sharpe if baseline_metrics_test else 0.0

    all_curves: list[np.ndarray] = [baseline_equity.to_numpy()]
    perturbations: list[PerturbationStat] = []

    for path in paths:
        try:
            base_value = _resolve(base_payload, path)
        except KeyError:
            skipped.append(path)
            continue
        if not isinstance(base_value, (int, float)) or isinstance(base_value, bool):
            skipped.append(path)
            continue

        # Decide low/high values — preserve int-ness for integer params.
        is_int = isinstance(base_value, int) and not isinstance(base_value, bool)
        low_raw = base_value * (1 - DELTA)
        high_raw = base_value * (1 + DELTA)
        if is_int:
            low_val: float = max(1, int(round(low_raw)))
            high_val: float = max(low_val + 1, int(round(high_raw)))
        else:
            low_val = max(MIN_PERTURBED_VALUE, low_raw)
            high_val = max(MIN_PERTURBED_VALUE, high_raw)

        try:
            low_eq, low_m = _run_perturbed(schema, df, path, low_val)
            high_eq, high_m = _run_perturbed(schema, df, path, high_val)
        except (ValueError, KeyError, TypeError):
            # If a perturbation produces an invalid schema (e.g., negative period
            # after rounding) we just skip it rather than failing the whole halo.
            skipped.append(path)
            continue

        all_curves.append(low_eq.to_numpy())
        all_curves.append(high_eq.to_numpy())

        perturbations.append(PerturbationStat(
            path=path,
            base_value=float(base_value),
            low_value=float(low_val),
            high_value=float(high_val),
            base_sharpe=base_sharpe,
            low_sharpe=low_m.sharpe if low_m else 0.0,
            high_sharpe=high_m.sharpe if high_m else 0.0,
            sharpe_range=float(
                max(base_sharpe, low_m.sharpe if low_m else 0.0, high_m.sharpe if high_m else 0.0)
                - min(base_sharpe, low_m.sharpe if low_m else 0.0, high_m.sharpe if high_m else 0.0)
            ),
        ))
        # local function for clarity above; defined at module level for run_backtest reuse
        del low_eq, high_eq, low_m, high_m

    if not perturbations:
        return None

    stack = np.vstack(all_curves)
    lo = stack.min(axis=0)
    hi = stack.max(axis=0)

    # Median width of the test-window envelope, normalized by baseline equity.
    base_arr = baseline_equity.to_numpy()
    test_lo = lo[test_slice]
    test_hi = hi[test_slice]
    test_base = base_arr[test_slice]
    safe_base = np.where(test_base == 0, 1.0, test_base)
    width_per_bar = (test_hi - test_lo) / np.abs(safe_base)
    median_width = float(np.nanmedian(width_per_bar)) if len(width_per_bar) else 0.0

    idx = baseline_equity.index.to_pydatetime()
    envelope_lo = list(zip(idx, lo.tolist(), strict=True))
    envelope_hi = list(zip(idx, hi.tolist(), strict=True))

    return SensitivityHalo(
        delta=DELTA,
        perturbed_paths=[p.path for p in perturbations],
        skipped_paths=skipped,
        envelope_lo=envelope_lo,
        envelope_hi=envelope_hi,
        median_width=median_width,
        perturbations=perturbations,
    )


def _run_perturbed(
    schema: StrategySchema,
    df: pd.DataFrame,
    path: str,
    new_value: float,
) -> tuple[pd.Series, MetricsBlock | None]:
    """Run one perturbed backtest; return (equity_series, test_metrics)."""
    from stratlab_engine.backtester import run_backtest  # local to avoid cycle

    payload = schema.model_dump(mode="python")
    _set(payload, path, new_value)
    perturbed = type(schema).model_validate(payload)
    result = run_backtest(perturbed, df, _skip_overfitting=True)
    eq = pd.Series(
        [v for _, v in result.equity_curve],
        index=pd.DatetimeIndex([t for t, _ in result.equity_curve]),
        dtype="float64",
    )
    return eq, result.metrics_test


# ---- path helpers (mirror sanity._resolve_json_path; add a setter) --------


def _resolve(obj: Any, path: str) -> Any:
    cur = obj
    for part in path.split("."):
        if isinstance(cur, list):
            cur = cur[int(part)]
        elif isinstance(cur, dict):
            cur = cur[part]
        else:
            raise KeyError(f"cannot descend into {type(cur).__name__} at '{part}'")
    return cur


def _set(obj: Any, path: str, value: Any) -> None:
    parts = path.split(".")
    cur = obj
    for part in parts[:-1]:
        if isinstance(cur, list):
            cur = cur[int(part)]
        elif isinstance(cur, dict):
            cur = cur[part]
        else:
            raise KeyError(f"cannot descend into {type(cur).__name__} at '{part}'")
    last = parts[-1]
    if isinstance(cur, list):
        cur[int(last)] = value
    elif isinstance(cur, dict):
        cur[last] = value
    else:
        raise KeyError(f"cannot set on {type(cur).__name__} at '{last}'")
