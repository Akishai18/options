"""Build the input string the critique LLM consumes.

Deterministic, structured, numbers-only. The whole point of the project's
"critique is grounded in computed metrics" rule depends on this stage being
boring and reproducible.
"""

from stratlab_engine.results import BacktestResult, MetricsBlock


def format_critique_input(
    result: BacktestResult,
    asset: str,
    timeframe: str,
    prior_test_metrics: MetricsBlock | None = None,
) -> str:
    lines: list[str] = []
    lines.append(f"Strategy: {result.schema_name}")
    lines.append(f"Asset: {asset}, Timeframe: {timeframe}")
    lines.append(
        f"Period: {result.data_start.date()} to {result.data_end.date()} "
        f"({result.bars} bars)"
    )
    lines.append("")
    lines.append("Metrics by split:")

    splits: list[tuple[str, MetricsBlock | None]] = [
        ("full     ", result.metrics_full),
        ("train    ", result.metrics_train),
        ("val      ", result.metrics_val),
        ("test     ", result.metrics_test),
        ("benchmark", result.metrics_benchmark_full),
    ]
    for label, m in splits:
        if m is None:
            continue
        lines.append(
            f"  {label}  Sharpe={m.sharpe:+.2f}  MaxDD={m.max_drawdown:+.2%}  "
            f"Return={m.total_return:+.2%}  Trades={m.num_trades}  "
            f"WinRt={m.win_rate:.1%}  PF={m.profit_factor:.2f}  "
            f"Exposure={m.exposure:.1%}"
        )

    if prior_test_metrics is not None:
        lines.append("")
        lines.append(
            f"Prior version test Sharpe: {prior_test_metrics.sharpe:+.2f}, "
            f"Return: {prior_test_metrics.total_return:+.2%}"
        )

    lines.append("")
    lines.append(
        "Note: sensitivity halo, regime breakdown, and cost-stress views are "
        "not yet computed (M4 work). Critique only on what's above."
    )
    return "\n".join(lines)
