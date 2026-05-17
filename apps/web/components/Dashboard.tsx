"use client";

import { motion } from "motion/react";
import { MetricsStrip } from "./MetricsStrip";
import { EquityChart } from "./EquityChart";
import { DrawdownChart } from "./DrawdownChart";
import { CritiqueCard } from "./CritiqueCard";
import { CostStressChart } from "./CostStressChart";
import { RegimeBreakdownGrid } from "./RegimeBreakdownGrid";
import { RobustnessPills } from "./RobustnessPills";
import { SectionLabel } from "./SectionLabel";
import { SensitivityHaloChart } from "./SensitivityHaloChart";
import { WalkForwardChart } from "./WalkForwardChart";
import { EmptyDashboard } from "./EmptyDashboard";
import { TradesTable } from "./TradesTable";
import { fingerprint } from "@/lib/fingerprint";
import type { BacktestResult, StrategySchema } from "@/lib/types";

type Props = {
  result: BacktestResult | null;
  asset: string | null;
  timeframe: string | null;
  critique: string | null;
  critiqueLoading?: boolean;
  loading?: boolean;
  strategy?: StrategySchema | null;
  versionLabel?: string | null;
};

export function Dashboard({
  result,
  asset,
  timeframe,
  critique,
  critiqueLoading,
  loading,
  strategy,
  versionLabel,
}: Props) {
  if (loading) return <DashboardLoading />;
  if (!result) return <EmptyDashboard />;

  // Default 60/20/20 split — match the backend's StrategySchema.Splits default.
  const trainFrac = 0.6;
  const valFrac = 0.2;

  // Compact mono rendering of entry [→ exit] rules — distinctive header detail.
  const entryGlyph = strategy?.entry ? fingerprint(strategy.entry) : null;
  const exitGlyph = strategy?.exit ? fingerprint(strategy.exit) : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] space-y-7 px-4 py-5 md:px-7 md:py-6">
        {/* header strip — strategy meta */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 md:flex-row md:items-baseline md:justify-between"
        >
          <div className="min-w-0">
            <p className="eyebrow mb-2">backtest result</p>
            <h2 className="display text-[30px] md:text-[34px] text-[var(--color-fg)]">
              {result.schema_name}
              {versionLabel && (
                <span className="display-italic ml-3 text-[var(--color-fg-muted)]">
                  — {versionLabel}
                </span>
              )}
            </h2>
            {(entryGlyph || exitGlyph) && (
              <p className="mt-2 truncate font-mono text-[12px] text-[var(--color-fg-muted)]">
                {entryGlyph && (
                  <>
                    <span className="text-[var(--color-fg-faint)]">entry</span>
                    <span className="ml-1.5 text-[var(--color-accent)]">{entryGlyph}</span>
                  </>
                )}
                {exitGlyph && (
                  <>
                    <span className="ml-3 text-[var(--color-fg-faint)]">exit</span>
                    <span className="ml-1.5 text-[var(--color-fg-muted)]">{exitGlyph}</span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="text-right font-mono text-[11px] text-[var(--color-fg-muted)] shrink-0">
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

        {/* anti-overfit verdict pills — the single-glance summary */}
        <RobustnessPills result={result} />

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
          <div className="glass-flat rounded-2xl p-4">
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
          <div className="glass-flat rounded-2xl p-4">
            <DrawdownChart drawdown={result.drawdown_curve} />
          </div>
        </section>

        {/* anti-overfit views — the wedge */}
        {result.cost_stress.length > 0 && (
          <CostStressChart points={result.cost_stress} />
        )}
        {result.walk_forward && <WalkForwardChart report={result.walk_forward} />}
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
