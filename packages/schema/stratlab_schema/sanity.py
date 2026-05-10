"""Static sanity checks on a validated StrategySchema.

These run AFTER Pydantic validation. They catch semantic problems Pydantic
can't express (e.g., a perturbable_params path that doesn't exist in the
strategy's expression tree).

The runtime/data-dependent checks from plan §3 ("entry true on >50% of bars",
etc.) require OHLCV and live in the engine package — not here.
"""

from dataclasses import dataclass
from typing import Any

from stratlab_schema.strategy import StrategySchema


@dataclass(frozen=True)
class SanityIssue:
    severity: str  # "warn" | "block"
    code: str
    message: str
    path: str | None = None


def check(schema: StrategySchema) -> list[SanityIssue]:
    """Run all static sanity checks. Returns a list of issues (empty if clean)."""
    issues: list[SanityIssue] = []
    issues.extend(_check_perturbable_paths(schema))
    issues.extend(_check_risk_warnings(schema))
    issues.extend(_check_test_split_size(schema))
    return issues


def has_blocking(issues: list[SanityIssue]) -> bool:
    return any(i.severity == "block" for i in issues)


# ---- Individual checks -----------------------------------------------------


def _check_perturbable_paths(schema: StrategySchema) -> list[SanityIssue]:
    """Every entry in `perturbable_params` must point to a numeric leaf in the schema."""
    out: list[SanityIssue] = []
    if not schema.perturbable_params:
        return out
    payload = schema.model_dump(mode="python")
    for path in schema.perturbable_params:
        try:
            value = _resolve_json_path(payload, path)
        except KeyError as e:
            out.append(SanityIssue(
                severity="block",
                code="perturbable_path_missing",
                message=f"perturbable_params path '{path}' does not exist in the schema ({e})",
                path=path,
            ))
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            kind = type(value).__name__
            out.append(SanityIssue(
                severity="block",
                code="perturbable_path_not_numeric",
                message=f"perturbable_params path '{path}' resolves to {kind}, not a number",
                path=path,
            ))
    return out


def _check_risk_warnings(schema: StrategySchema) -> list[SanityIssue]:
    out: list[SanityIssue] = []
    sl = schema.risk.stop_loss_pct
    if sl is not None and sl > 0.5:
        out.append(SanityIssue(
            severity="warn",
            code="stop_loss_very_large",
            message=f"stop_loss_pct={sl} is very large (>50%); a stop that wide rarely fires.",
            path="risk.stop_loss_pct",
        ))
    return out


def _check_test_split_size(schema: StrategySchema) -> list[SanityIssue]:
    out: list[SanityIssue] = []
    if schema.splits.test < 0.1:
        out.append(SanityIssue(
            severity="warn",
            code="test_split_small",
            message=f"splits.test={schema.splits.test} is small; OOS metrics will be noisy.",
            path="splits.test",
        ))
    return out


# ---- Helpers ---------------------------------------------------------------


def _resolve_json_path(obj: Any, path: str) -> Any:
    """Resolve a dot-separated path into a nested dict/list. Lists indexed by integer.

    Example: "entry.operands.0.left.params.period" walks
        obj["entry"]["operands"][0]["left"]["params"]["period"].
    """
    parts = path.split(".")
    cur = obj
    for i, part in enumerate(parts):
        if isinstance(cur, list):
            try:
                idx = int(part)
            except ValueError as e:
                raise KeyError(f"expected int index at part {i} ('{part}'), got {part!r}") from e
            if idx < 0 or idx >= len(cur):
                raise KeyError(f"list index {idx} out of range at part {i}")
            cur = cur[idx]
        elif isinstance(cur, dict):
            if part not in cur:
                raise KeyError(f"key '{part}' missing at part {i}")
            cur = cur[part]
        else:
            raise KeyError(f"cannot descend into {type(cur).__name__} at part {i} ('{part}')")
    return cur
