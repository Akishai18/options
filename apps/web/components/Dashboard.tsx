"use client";

import { motion } from "motion/react";
import { MetricsStrip } from "./MetricsStrip";
import { EquityChart } from "./EquityChart";
import { DrawdownChart } from "./DrawdownChart";
import { CritiqueCard } from "./CritiqueCard";
import { CostStressChart } from "./CostStressChart";
import { RegimeBreakdownGrid } from "./RegimeBreakdownGrid";
import { SectionLabel } from "./SectionLabel";
import { SensitivityHaloChart } from "./SensitivityHaloChart";
import { EmptyDashboard } from "./EmptyDashboard";
import { TradesTable } from "./TradesTable";
import type { BacktestResult } from "@/lib/types";

type Props = {
  result: BacktestResult | null;
  asset: string | null;
  timeframe: string | null;
  critique: string | null;
  critiqueLoading?: boolean;
  loading?: boolean;
};

export function Dashboard({
  result,
  asset,
  timeframe,
  critique,
  critiqueLoading,
  loading,
}: Props) {
  if (loading) return <DashboardLoading />;
  if (!result) return <EmptyDashboard />;

  // Default 60/20/20 split — match the backend's StrategySchema.Splits default.
  const trainFrac = 0.6;
  const valFrac = 0.2;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] space-y-7 px-7 py-6">
        {/* header strip — strategy meta */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-4"
        >
          <div>
            <p className="eyebrow mb-1.5">backtest result</p>
            <h2 className="text-[20px] font-medium tracking-[-0.01em] text-[var(--color-fg)]">
              {result.schema_name}
              <span className="serif-italic ml-2 text-[var(--color-fg-muted)]">— v1</span>
            </h2>
          </div>
          <div className="text-right font-mono text-[11px] text-[var(--color-fg-muted)]">
            {asset && timeframe && (
              <div>
                <span className="text-[var(--color-fg)]">{asset}</span>
                <span className="text-[var(--color-fg-faint)]"> · {timeframe}</span>
              </div>
            )}
            <div className="text-[var(--color-fg-faint)]">
              {result.bars} bars · {result.data_start.slice(0, 10)} → {result.data_end.slice(0, 10)}
            </div>
          </div>
        </motion.div>

        {/* metrics — IS/OOS hero */}
        <MetricsStrip
          full={result.metrics_full}
          train={result.metrics_train}
          test={result.metrics_test}
          benchmark={result.metrics_benchmark_full}
        />

        {/* equity curve */}
        <section className="space-y-3">
          <SectionLabel rule>equity curve · strategy vs buy-and-hold</SectionLabel>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <EquityChart
              equity={result.equity_curve}
              benchmark={result.benchmark_curve}
              trainFraction={trainFrac}
              valFraction={valFrac}
            />
          </div>
        </section>

        {/* sensitivity halo — the hero anti-overfit chart */}
        {result.sensitivity_halo && (
          <SensitivityHaloChart
            halo={result.sensitivity_halo}
            baseline={result.equity_curve}
            trainFraction={trainFrac}
            valFraction={valFrac}
          />
        )}

        {/* drawdown */}
        <section className="space-y-3">
          <SectionLabel rule>drawdown</SectionLabel>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <DrawdownChart drawdown={result.drawdown_curve} />
          </div>
        </section>

        {/* anti-overfit views — the wedge */}
        {result.cost_stress.length > 0 && (
          <CostStressChart points={result.cost_stress} />
        )}
        {result.regime_breakdown && (
          <RegimeBreakdownGrid regime={result.regime_breakdown} />
        )}

        {/* trade log */}
        <TradesTable trades={result.trades} />

        {/* critique */}
        <CritiqueCard text={critique} loading={critiqueLoading} />

        <div className="h-2" />
      </div>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="flex h-full flex-col gap-6 px-7 py-6">
      <div className="border-b border-[var(--color-border)] pb-4">
        <div className="h-2.5 w-24 rounded shimmer mb-3" />
        <div className="h-5 w-72 rounded shimmer" />
      </div>
      <div className="grid grid-cols-4 gap-px bg-[var(--color-border)]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[88px] bg-[var(--color-bg)] p-4">
            <div className="h-2 w-16 shimmer rounded mb-3" />
            <div className="h-6 w-24 shimmer rounded" />
          </div>
        ))}
      </div>
      <div className="h-[340px] w-full rounded-md shimmer" />
      <div className="h-[120px] w-full rounded-md shimmer" />
    </div>
  );
}
