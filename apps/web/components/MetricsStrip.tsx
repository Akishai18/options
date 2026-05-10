"use client";

import { motion } from "motion/react";
import { cn, num, pct } from "@/lib/utils";
import type { MetricsBlock } from "@/lib/types";

type Props = {
  full: MetricsBlock;
  train: MetricsBlock | null;
  test: MetricsBlock | null;
  benchmark: MetricsBlock;
};

export function MetricsStrip({ full, train, test, benchmark }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
      className="grid grid-cols-2 gap-px bg-[var(--color-border)] md:grid-cols-4"
    >
      <Stat
        label="Sharpe"
        primary={num(full.sharpe)}
        train={train?.sharpe}
        test={test?.sharpe}
        bench={benchmark.sharpe}
        higherIsBetter
      />
      <Stat
        label="Total Return"
        primary={pct(full.total_return)}
        train={train?.total_return}
        test={test?.total_return}
        bench={benchmark.total_return}
        format="pct"
        higherIsBetter
      />
      <Stat
        label="Max Drawdown"
        primary={pct(full.max_drawdown)}
        train={train?.max_drawdown}
        test={test?.max_drawdown}
        bench={benchmark.max_drawdown}
        format="pct"
        higherIsBetter // less-negative is better; we still color by delta direction
      />
      <Stat
        label="Trades · Win Rate"
        primary={`${full.num_trades}  ·  ${(full.win_rate * 100).toFixed(0)}%`}
      />
    </motion.div>
  );
}

type StatProps = {
  label: string;
  primary: string;
  train?: number | null;
  test?: number | null;
  bench?: number | null;
  format?: "num" | "pct";
  higherIsBetter?: boolean;
};

function Stat({
  label,
  primary,
  train,
  test,
  bench,
  format = "num",
  higherIsBetter,
}: StatProps) {
  const fmt = (v: number | null | undefined) =>
    format === "pct" ? pct(v) : num(v);

  const showOosCompare = train != null && test != null;
  const delta = showOosCompare ? (test as number) - (train as number) : 0;
  const goodDelta = higherIsBetter ? delta >= 0 : delta <= 0;

  return (
    <div className="flex flex-col gap-2 bg-[var(--color-bg)] px-4 py-3">
      <span className="eyebrow">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="tabular font-mono text-[22px] font-light leading-none text-[var(--color-fg)]">
          {primary}
        </span>
      </div>
      {showOosCompare ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
          <span className="font-mono">IS</span>
          <span className="tabular font-mono text-[var(--color-fg)]">{fmt(train)}</span>
          <span
            className={cn(
              "font-mono",
              goodDelta ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
            )}
          >
            →
          </span>
          <span className="font-mono">OOS</span>
          <span
            className={cn(
              "tabular font-mono font-medium",
              goodDelta ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
            )}
          >
            {fmt(test)}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-fg-muted)]">
          {bench != null ? (
            <>
              <span className="font-mono">vs benchmark</span>
              <span className="tabular font-mono">{fmt(bench)}</span>
            </>
          ) : (
            <span className="font-mono text-[var(--color-fg-faint)]">—</span>
          )}
        </div>
      )}
    </div>
  );
}
