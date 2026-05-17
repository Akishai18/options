"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { BacktestResult } from "@/lib/types";

type Verdict = "robust" | "mixed" | "fragile" | "n/a";

type Pill = {
  axis: string;
  title: string;
  detail: string;
  verdict: Verdict;
};

type Props = { result: BacktestResult };

/* 4-axis verdict grid — the editorial centerpiece. Each cell stretches the
 * full width of the row, separated by hairline internal borders. Serif title,
 * mono axis label + verdict badge.  Replaces the old "pill row". */
export function RobustnessPills({ result }: Props) {
  const pills = computePills(result);

  const robustCount = pills.filter((p) => p.verdict === "robust").length;
  const fragileCount = pills.filter((p) => p.verdict === "fragile").length;
  const overall: "robust" | "fragile" | "mixed" =
    fragileCount >= 2 ? "fragile" : robustCount >= 3 ? "robust" : "mixed";

  const overallLabel =
    overall === "robust"
      ? "Edge: Robust"
      : overall === "fragile"
        ? "Edge: Fragile"
        : "Edge: Conditionally Robust";

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">Verdict — four axes</span>
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.18em] uppercase rounded-full glass-soft px-3 py-0.5",
            overall === "robust"  && "text-[var(--color-up)]",
            overall === "fragile" && "text-[var(--color-down)]",
            overall === "mixed"   && "text-[var(--color-accent)]",
          )}
        >
          <span className="mr-1.5 opacity-70">●</span>
          {overallLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pills.map((p, i) => (
          <motion.div
            key={p.axis}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
            className="group glass glass-sheen rounded-2xl p-5 card-lift hover:bg-[oklch(1_0_0/0.06)]"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-muted)]">
                Axis {String(i + 1).padStart(2, "0")}
              </span>
              <VerdictBadge verdict={p.verdict} />
            </div>
            <p className="text-[18px] font-medium leading-tight tracking-[-0.015em] text-[var(--color-fg)]">
              {p.title}
            </p>
            <p className="mt-2 text-[12.5px] text-[var(--color-fg-muted)]">
              {p.detail}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { color, label } = {
    robust:  { color: "bg-[var(--color-up)]   text-[var(--color-up)]",      label: "Robust"  },
    mixed:   { color: "bg-[var(--color-accent)] text-[var(--color-accent)]", label: "Mixed"   },
    fragile: { color: "bg-[var(--color-down)] text-[var(--color-down)]",    label: "Fragile" },
    "n/a":   { color: "bg-[var(--color-fg-faint)] text-[var(--color-fg-faint)]", label: "n/a" },
  }[verdict];
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", color.split(" ")[0])} />
      <span className={cn("font-mono text-[9px] uppercase tracking-wider", color.split(" ")[1])}>
        {label}
      </span>
    </span>
  );
}

/* -------------------------- verdict calculation -------------------------- */

function computePills(r: BacktestResult): Pill[] {
  return [
    isOosPill(r),
    sensitivityPill(r),
    costStressPill(r),
    walkForwardPill(r),
  ];
}

function isOosPill(r: BacktestResult): Pill {
  const train = r.metrics_train?.sharpe;
  const test = r.metrics_test?.sharpe;
  if (train == null || test == null) {
    return {
      axis: "01", title: "In-Sample / OOS", verdict: "n/a",
      detail: "split not available",
    };
  }
  const delta = test - train;
  const decay = train > 0 ? (test - train) / Math.max(0.01, Math.abs(train)) : 0;
  let verdict: Verdict;
  if (test >= 0 && (delta >= -0.3 || decay >= -0.3)) verdict = "robust";
  else if (test < 0 || decay < -0.6) verdict = "fragile";
  else verdict = "mixed";
  return {
    axis: "01",
    title: "In-Sample / OOS",
    verdict,
    detail:
      verdict === "robust"
        ? `Holds OOS · ${train.toFixed(2)} → ${test.toFixed(2)}`
        : verdict === "fragile"
          ? `Collapses OOS · ${train.toFixed(2)} → ${test.toFixed(2)}`
          : `Decays OOS · ${train.toFixed(2)} → ${test.toFixed(2)}`,
  };
}

function sensitivityPill(r: BacktestResult): Pill {
  const halo = r.sensitivity_halo;
  if (!halo || halo.perturbations.length === 0) {
    return {
      axis: "02", title: "Parameter Sensitivity", verdict: "n/a",
      detail: "no perturbable params declared",
    };
  }
  const w = halo.median_width;
  let verdict: Verdict;
  if (w < 0.12) verdict = "robust";
  else if (w > 0.35) verdict = "fragile";
  else verdict = "mixed";
  return {
    axis: "02",
    title: "Parameter Sensitivity",
    verdict,
    detail:
      verdict === "robust"
        ? `Stable under ±${(halo.delta * 100).toFixed(0)}% on ${halo.perturbations.length} params`
        : verdict === "fragile"
          ? `Halo ${(w * 100).toFixed(0)}% — fragile to params`
          : `Halo ${(w * 100).toFixed(0)}% — moderate sensitivity`,
  };
}

function costStressPill(r: BacktestResult): Pill {
  if (r.cost_stress.length === 0) {
    return {
      axis: "03", title: "Cost Robustness", verdict: "n/a",
      detail: "cost stress unavailable",
    };
  }
  const base = r.cost_stress[0];
  const worst = r.cost_stress.reduce(
    (acc, p) => (p.sharpe < acc.sharpe ? p : acc),
    base,
  );
  const decay =
    base.sharpe > 0
      ? (worst.sharpe - base.sharpe) / Math.max(0.01, Math.abs(base.sharpe))
      : 0;
  let verdict: Verdict;
  if (base.sharpe <= 0) verdict = "fragile";
  else if (decay > -0.2) verdict = "robust";
  else if (decay < -0.5) verdict = "fragile";
  else verdict = "mixed";
  return {
    axis: "03",
    title: "Cost Robustness",
    verdict,
    detail:
      verdict === "robust"
        ? `Survives 2× fees · Sharpe ${worst.sharpe.toFixed(2)}`
        : verdict === "fragile"
          ? `Edge decays at 2× fees · ${worst.sharpe.toFixed(2)}`
          : `Softens at 2× fees · ${worst.sharpe.toFixed(2)}`,
  };
}

function walkForwardPill(r: BacktestResult): Pill {
  const wf = r.walk_forward;
  if (!wf) {
    return {
      axis: "04", title: "Walk-Forward", verdict: "n/a",
      detail: "window too short for walk-forward",
    };
  }
  let verdict: Verdict;
  if (wf.pct_positive_sharpe >= 0.7) verdict = "robust";
  else if (wf.pct_positive_sharpe < 0.4) verdict = "fragile";
  else verdict = "mixed";
  const positive = Math.round(wf.pct_positive_sharpe * wf.folds.length);
  return {
    axis: "04",
    title: "Walk-Forward",
    verdict,
    detail: `Passes ${positive} / ${wf.folds.length} windows`,
  };
}
