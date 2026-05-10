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

    if result.cost_stress:
        lines.append("")
        lines.append("Cost stress (test split, fee multiplier × baseline fee_bps):")
        for p in result.cost_stress:
            lines.append(
                f"  {p.multiplier:.1f}x ({p.fee_bps:.1f} bps)  "
                f"Sharpe={p.sharpe:+.2f}  Return={p.total_return:+.2%}  "
                f"Trades={p.num_trades}"
            )

    if result.regime_breakdown is not None:
        rb = result.regime_breakdown
        lines.append("")
        lines.append("Regime decomposition (test window, Sharpe per regime):")
        for cell in (rb.low_vol, rb.high_vol, rb.trending, rb.sideways):
            lines.append(
                f"  {cell.label:<10}  Sharpe={cell.sharpe:+.2f}  "
                f"bars={cell.bars}  share={cell.fraction:.1%}"
            )
        if rb.note:
            lines.append(f"  note: {rb.note}")

    if result.sensitivity_halo is not None:
        halo = result.sensitivity_halo
        lines.append("")
        lines.append(
            f"Sensitivity halo (each perturbable param ±{halo.delta:.0%}, "
            f"median test-window envelope width: {halo.median_width:.1%}):"
        )
        for p in halo.perturbations:
            lines.append(
                f"  {p.path}  base={p.base_value:g} → low={p.low_value:g}, high={p.high_value:g}  "
                f"sharpe range={p.sharpe_range:+.2f}  "
                f"(base={p.base_sharpe:+.2f} low={p.low_sharpe:+.2f} high={p.high_sharpe:+.2f})"
            )
        if halo.skipped_paths:
            lines.append(
                f"  skipped: {', '.join(halo.skipped_paths)} (non-numeric or over cap)"
            )

    if prior_test_metrics is not None:
        lines.append("")
        lines.append(
            f"Prior version test Sharpe: {prior_test_metrics.sharpe:+.2f}, "
            f"Return: {prior_test_metrics.total_return:+.2%}"
        )

    return "\n".join(lines)
