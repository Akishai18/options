"use client";

import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";
import { cn, num, pct } from "@/lib/utils";
import type { CostStressPoint } from "@/lib/types";

type Props = { points: CostStressPoint[] };

export function CostStressChart({ points }: Props) {
  if (points.length === 0) return null;

  const baseline = points[0];
  // Track the worst-case Sharpe degradation as the headline number.
  const worst = points.reduce((acc, p) => (p.sharpe < acc.sharpe ? p : acc), baseline);
  const sharpeDelta = worst.sharpe - baseline.sharpe;
  const fragile = baseline.sharpe > 0 && sharpeDelta / Math.max(0.01, Math.abs(baseline.sharpe)) <= -0.4;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <SectionLabel rule>cost stress · test split sharpe at scaled fees</SectionLabel>
        <span
          className={cn(
            "font-mono text-[10.5px]",
            fragile ? "text-[var(--color-down)]" : "text-[var(--color-fg-muted)]",
          )}
        >
          {fragile ? "fragile to fees" : "robust to fees"}
        </span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {points.map((p) => (
            <CostBar key={p.multiplier} point={p} baseline={baseline} />
          ))}
        </div>
        <div className="glass-flat rounded-2xl px-4 py-2.5 text-[11px] text-[var(--color-fg-muted)]">
          <span className="serif-italic text-[var(--color-fg)]">A note. </span>
          Each bar is the entire backtest re-run with fees scaled — slippage held
          constant. A real strategy holds up at 1.5× and 2× the assumed cost; an
          overfit one collapses.
        </div>
      </div>
    </motion.section>
  );
}

function CostBar({
  point,
  baseline,
}: {
  point: CostStressPoint;
  baseline: CostStressPoint;
}) {
  const sharpeDeltaPct =
    baseline.sharpe === 0 ? 0 : (point.sharpe - baseline.sharpe) / Math.abs(baseline.sharpe);
  const isBaseline = point.multiplier === baseline.multiplier;
  return (
    <div className="glass-flat rounded-2xl flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
          {point.multiplier.toFixed(1)}× fees
        </span>
        <span className="font-mono text-[10px] text-[var(--color-fg-faint)]">
          {point.fee_bps.toFixed(1)} bps
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "tabular font-mono text-[24px] font-light leading-none",
            point.sharpe >= 0 ? "text-[var(--color-fg)]" : "text-[var(--color-down)]",
          )}
        >
          {num(point.sharpe)}
        </span>
        {!isBaseline && (
          <span
            className={cn(
              "font-mono text-[10.5px]",
              sharpeDeltaPct < -0.05
                ? "text-[var(--color-down)]"
                : sharpeDeltaPct > 0.05
                  ? "text-[var(--color-up)]"
                  : "text-[var(--color-fg-muted)]",
            )}
          >
            {sharpeDeltaPct >= 0 ? "+" : ""}
            {(sharpeDeltaPct * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-[var(--color-fg-muted)]">
        <span className="font-mono">return</span>
        <span
          className={cn(
            "tabular font-mono",
            point.total_return >= 0
              ? "text-[var(--color-up)]"
              : "text-[var(--color-down)]",
          )}
        >
          {pct(point.total_return)}
        </span>
      </div>
    </div>
  );
}
