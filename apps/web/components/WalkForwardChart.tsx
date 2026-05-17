"use client";

import { motion } from "motion/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionLabel } from "./SectionLabel";
import { cn, num, pct } from "@/lib/utils";
import type { WalkForwardReport } from "@/lib/types";

type Props = { report: WalkForwardReport };

type Row = {
  label: string;
  sharpe: number;
  totalReturn: number;
  maxDrawdown: number;
  range: string;
  positive: boolean;
};

export function WalkForwardChart({ report }: Props) {
  const rows: Row[] = report.folds.map((f) => ({
    label: `f${f.index + 1}`,
    sharpe: f.sharpe,
    totalReturn: f.total_return,
    maxDrawdown: f.max_drawdown,
    range: `${f.start_ts.slice(0, 10)} → ${f.end_ts.slice(0, 10)}`,
    positive: f.sharpe > 0,
  }));

  const consistency = report.pct_positive_sharpe;
  const consistent = consistency >= 0.7;
  const inconsistent = consistency < 0.4;
  const verdict = consistent
    ? "consistent across time"
    : inconsistent
      ? "inconsistent — fold-to-fold instability"
      : "mixed — reads regime-dependent";

  // Symmetric Y axis around zero so positive/negative bars look the same size.
  const maxAbs = Math.max(
    1,
    Math.ceil(Math.max(...rows.map((r) => Math.abs(r.sharpe))) * 10) / 10,
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <SectionLabel rule>
          walk-forward · {report.n_folds} rolling out-of-sample folds
        </SectionLabel>
        <span
          className={cn(
            "font-mono text-[10.5px]",
            consistent
              ? "text-[var(--color-up)]"
              : inconsistent
                ? "text-[var(--color-down)]"
                : "text-[var(--color-accent)]",
          )}
        >
          {verdict}
        </span>
      </div>

      <div className="glass-flat rounded-2xl p-4">
        {/* aggregate strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
          <Stat label="mean sharpe" value={num(report.mean_sharpe)} accent={report.mean_sharpe >= 0 ? "up" : "down"} />
          <Stat label="median sharpe" value={num(report.median_sharpe)} accent={report.median_sharpe >= 0 ? "up" : "down"} />
          <Stat label="stdev" value={num(report.sharpe_stdev)} accent="muted" />
          <Stat
            label="positive folds"
            value={`${(report.pct_positive_sharpe * 100).toFixed(0)}%`}
            accent={consistent ? "up" : inconsistent ? "down" : "muted"}
          />
        </div>

        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--color-fg-subtle)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                stroke="var(--color-border)"
              />
              <YAxis
                domain={[-maxAbs, maxAbs]}
                tick={{ fill: "var(--color-fg-subtle)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                stroke="var(--color-border)"
                tickFormatter={(v) => v.toFixed(1)}
                width={36}
              />
              <ReferenceLine y={0} stroke="var(--color-border-strong)" />
              <Tooltip content={<FoldTooltip />} cursor={{ fill: "var(--color-fg-faint)", fillOpacity: 0.05 }} />
              <Bar dataKey="sharpe" radius={[2, 2, 0, 0]}>
                {rows.map((r) => (
                  <Cell
                    key={r.label}
                    fill={r.positive ? "var(--color-up)" : "var(--color-down)"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-3 text-[11.5px] leading-[1.55] text-[var(--color-fg-muted)]">
          <span className="serif-italic text-[var(--color-fg)]">A note. </span>
          Each bar is the strategy&apos;s annualized Sharpe on a forward-rolling
          test window of equal length. Walk-forward asks <em>is this strategy
          consistent over time?</em> — a different question than regime
          decomposition (consistent across regime <em>types</em>). Strategies
          that pass one and fail the other are surprisingly common.
        </p>
        {report.note && (
          <p className="mt-2 font-mono text-[10.5px] text-[var(--color-fg-faint)]">
            {report.note}
          </p>
        )}
      </div>
    </motion.section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "up" | "down" | "muted";
}) {
  return (
    <div className="glass-flat rounded-xl flex flex-col gap-1 px-3.5 py-2.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-mono text-[15px] font-light leading-none",
          accent === "up" && "text-[var(--color-up)]",
          accent === "down" && "text-[var(--color-down)]",
          accent === "muted" && "text-[var(--color-fg)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

type TipPayload = { value: number; payload: Row };
function FoldTooltip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl glass px-3 py-2 font-mono text-[11px] shadow-lg">
      <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-faint)]">
        fold {r.label}
      </div>
      <div className="text-[10px] text-[var(--color-fg-muted)]">{r.range}</div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-[var(--color-fg-muted)]">sharpe</span>
        <span
          className={cn(
            "tabular",
            r.sharpe >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
          )}
        >
          {num(r.sharpe)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[var(--color-fg-muted)]">return</span>
        <span
          className={cn(
            "tabular",
            r.totalReturn >= 0 ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
          )}
        >
          {pct(r.totalReturn)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[var(--color-fg-muted)]">max dd</span>
        <span className="tabular text-[var(--color-down)]">
          {pct(r.maxDrawdown)}
        </span>
      </div>
    </div>
  );
}
