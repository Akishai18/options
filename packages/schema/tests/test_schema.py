"""M0 acceptance test: schema correctness + the 10 hand-coded reference strategies.

Per the implementation plan, every target archetype must be expressible in the
DSL without redesigning the schema. If any of these fail to construct, validate,
or round-trip, that's a signal the DSL needs work BEFORE we move on to the
engine.
"""

import importlib
import pkgutil
from datetime import date

import examples
import pytest
from pydantic import ValidationError
from stratlab_schema import (
    Asset,
    Comparison,
    Constant,
    DataSpec,
    IndicatorRef,
    Logical,
    RiskRules,
    Side,
    Sizing,
    Splits,
    StrategySchema,
    Timeframe,
)
from stratlab_schema.sanity import check, has_blocking


def _all_example_strategies() -> list[tuple[str, StrategySchema]]:
    """Discover every example strategy module and load its STRATEGY constant."""
    out = []
    for info in pkgutil.iter_modules(examples.__path__):
        mod = importlib.import_module(f"examples.{info.name}")
        if not hasattr(mod, "STRATEGY"):
            raise AssertionError(f"examples.{info.name} has no STRATEGY constant")
        out.append((info.name, mod.STRATEGY))
    return sorted(out)


EXAMPLES = _all_example_strategies()


# ---- M0 acceptance: every example builds, round-trips, and passes sanity ----


@pytest.mark.parametrize("name,strategy", EXAMPLES)
def test_example_constructs(name, strategy):
    """A successful import means Pydantic validated the construction."""
    assert isinstance(strategy, StrategySchema), f"{name}: not a StrategySchema"


@pytest.mark.parametrize("name,strategy", EXAMPLES)
def test_example_json_roundtrip(name, strategy):
    """Serialize → deserialize → must equal original (the LLM/network path)."""
    raw = strategy.model_dump_json()
    rebuilt = StrategySchema.model_validate_json(raw)
    assert rebuilt.model_dump() == strategy.model_dump(), f"{name}: round-trip mismatch"


@pytest.mark.parametrize("name,strategy", EXAMPLES)
def test_example_sanity(name, strategy):
    """Static sanity (perturbable paths exist, etc.) must not block."""
    issues = check(strategy)
    blocking = [i for i in issues if i.severity == "block"]
    assert not blocking, f"{name}: blocking sanity issues: {blocking}"


def test_example_count_meets_m0_threshold():
    """Plan: ≥10 hand-coded strategies before moving on."""
    assert len(EXAMPLES) >= 10, f"need ≥10 examples for M0; have {len(EXAMPLES)}"


def test_examples_cover_all_archetypes():
    """The six archetypes from plan §3 should each appear by example name."""
    names = {name for name, _ in EXAMPLES}
    expected = {
        "ma_crossover",
        "rsi_mean_reversion",
        "bollinger_mean_reversion",
        "donchian_breakout",
        "momentum_with_rsi",
        "vol_filtered_trend",
    }
    missing = expected - names
    assert not missing, f"missing archetype examples: {missing}"


def test_examples_cover_all_assets_and_timeframes():
    assets = {s.data.asset for _, s in EXAMPLES}
    timeframes = {s.data.timeframe for _, s in EXAMPLES}
    assert assets == set(Asset), f"missing assets: {set(Asset) - assets}"
    assert timeframes == set(Timeframe), f"missing timeframes: {set(Timeframe) - timeframes}"


def test_at_least_one_short_side_example():
    sides = {s.side for _, s in EXAMPLES}
    assert Side.SHORT in sides, "no example exercises SHORT side"


def test_at_least_one_logical_not():
    assert any(_contains_logical(s.entry, "not") for _, s in EXAMPLES), \
        "no example uses logical 'not'"


def test_at_least_one_logical_or():
    assert any(_contains_logical(s.entry, "or") for _, s in EXAMPLES), \
        "no example uses logical 'or'"


def test_at_least_one_risk_driven_exit():
    """Strategies where exit=None and exits are stop/TP-driven."""
    assert any(s.exit is None for _, s in EXAMPLES), \
        "no example tests the risk-driven (exit=None) path"


# ---- Schema constraint tests (negative cases) ------------------------------


def test_logical_not_must_have_one_operand():
    with pytest.raises(ValidationError):
        Logical(op="not", operands=[
            Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
            Comparison(op="lt", left=IndicatorRef(name="close"), right=Constant(value=1)),
        ])


def test_logical_and_needs_at_least_two_operands():
    with pytest.raises(ValidationError):
        Logical(op="and", operands=[
            Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
        ])


def test_logical_or_needs_at_least_two_operands():
    with pytest.raises(ValidationError):
        Logical(op="or", operands=[
            Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
        ])


def test_splits_must_sum_to_one():
    with pytest.raises(ValidationError):
        Splits(train=0.5, val=0.2, test=0.2)  # sums to 0.9


def test_data_spec_rejects_reversed_dates():
    with pytest.raises(ValidationError):
        DataSpec(
            asset=Asset.BTC,
            timeframe=Timeframe.D1,
            start=date(2024, 1, 1),
            end=date(2023, 1, 1),
        )


def test_strategy_with_no_exit_and_no_risk_rejected():
    """exit=None AND no stop_loss AND no take_profit → positions never close."""
    with pytest.raises(ValidationError):
        StrategySchema(
            name="never closes",
            data=DataSpec(
                asset=Asset.BTC, timeframe=Timeframe.D1,
                start=date(2020, 1, 1), end=date(2024, 1, 1),
            ),
            entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
            exit=None,
            risk=RiskRules(),
        )


def test_strategy_with_no_exit_but_stop_loss_ok():
    s = StrategySchema(
        name="risk-driven exit",
        data=DataSpec(
            asset=Asset.BTC, timeframe=Timeframe.D1,
            start=date(2020, 1, 1), end=date(2024, 1, 1),
        ),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
        exit=None,
        risk=RiskRules(stop_loss_pct=0.05),
    )
    assert s.exit is None and s.risk.stop_loss_pct == 0.05


def test_sizing_vol_target_requires_target():
    with pytest.raises(ValidationError):
        Sizing(mode="vol_target", fraction=0.5)


def test_sizing_fixed_notional_requires_notional():
    with pytest.raises(ValidationError):
        Sizing(mode="fixed_notional")


def test_unknown_indicator_rejected():
    with pytest.raises(ValidationError):
        IndicatorRef(name="magic_indicator")  # type: ignore[arg-type]


def test_unknown_comparison_op_rejected():
    with pytest.raises(ValidationError):
        Comparison(
            op="approximately_equal",  # type: ignore[arg-type]
            left=IndicatorRef(name="close"),
            right=Constant(value=0),
        )


# ---- Sanity layer tests ----------------------------------------------------


def _minimal(**overrides) -> StrategySchema:
    base = dict(
        name="minimal",
        data=DataSpec(
            asset=Asset.BTC, timeframe=Timeframe.D1,
            start=date(2020, 1, 1), end=date(2024, 1, 1),
        ),
        entry=Comparison(op="gt", left=IndicatorRef(name="close"), right=Constant(value=0)),
        exit=Comparison(op="lt", left=IndicatorRef(name="close"), right=Constant(value=10**12)),
    )
    base.update(overrides)
    return StrategySchema(**base)


def test_sanity_perturbable_path_missing_blocks():
    s = _minimal(perturbable_params=["entry.does.not.exist"])
    issues = check(s)
    assert any(i.code == "perturbable_path_missing" for i in issues)
    assert has_blocking(issues)


def test_sanity_perturbable_path_not_numeric_blocks():
    # entry.left.name is a string, not numeric
    s = _minimal(perturbable_params=["entry.left.name"])
    issues = check(s)
    assert any(i.code == "perturbable_path_not_numeric" for i in issues)
    assert has_blocking(issues)


def test_sanity_perturbable_path_valid():
    s = _minimal(perturbable_params=["entry.right.value"])
    issues = check(s)
    assert not has_blocking(issues)


def test_sanity_stop_loss_too_large_warns():
    s = _minimal(risk=RiskRules(stop_loss_pct=0.6))
    issues = check(s)
    warnings = [i for i in issues if i.code == "stop_loss_very_large"]
    assert warnings and warnings[0].severity == "warn"
    assert not has_blocking(issues)


def test_sanity_small_test_split_warns():
    s = _minimal(splits=Splits(train=0.85, val=0.10, test=0.05))
    issues = check(s)
    assert any(i.code == "test_split_small" and i.severity == "warn" for i in issues)


# ---- JSON Schema (used as Anthropic tool-use input_schema in M3) -----------


def test_json_schema_generates_for_anthropic_tool_use():
    """Anthropic tool-use needs the Pydantic JSON Schema. Spot-check the shape."""
    js = StrategySchema.model_json_schema()
    assert js["title"] == "StrategySchema"
    assert "$defs" in js
    defs = js["$defs"]
    for cls in ("IndicatorRef", "Constant", "Comparison", "Logical"):
        assert cls in defs, f"{cls} missing from JSON Schema $defs"
    # Required top-level fields
    required = set(js.get("required", []))
    assert {"name", "data", "entry"} <= required


# ---- Helpers ---------------------------------------------------------------


def _contains_logical(node, op: str) -> bool:
    if isinstance(node, Logical):
        if node.op == op:
            return True
        return any(_contains_logical(o, op) for o in node.operands)
    if isinstance(node, Comparison):
        return _contains_logical(node.left, op) or _contains_logical(node.right, op)
    return False
