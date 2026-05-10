"use client";

import { motion } from "motion/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pct } from "@/lib/utils";
import type { EquityPoint } from "@/lib/types";

type Props = {
  equity: EquityPoint[];
  benchmark: EquityPoint[];
  trainFraction: number; // e.g. 0.6
  valFraction: number;   // e.g. 0.2  (test is the rest)
};

type Row = {
  ts: number;          // unix ms — Recharts expects numeric for proper scaling
  date: string;        // pretty label
  strategy: number;
  benchmark: number;
};

export function EquityChart({ equity, benchmark, trainFraction, valFraction }: Props) {
  const benchByTs = new Map(benchmark.map(([ts, v]) => [ts, v]));
  const data: Row[] = equity.map(([ts, v]) => {
    const t = new Date(ts).getTime();
    return {
      ts: t,
      date: new Date(ts).toISOString().slice(0, 10),
      strategy: v,
      benchmark: benchByTs.get(ts) ?? NaN,
    };
  });

  if (data.length === 0) return null;

  const tsStart = data[0].ts;
  const tsEnd = data[data.length - 1].ts;
  const span = tsEnd - tsStart;
  const trainEnd = tsStart + span * trainFraction;
  const valEnd = trainEnd + span * valFraction;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.05 }}
      className="relative h-[340px] w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="strategyGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />

          <XAxis
            dataKey="ts"
            type="number"
            domain={[tsStart, tsEnd]}
            scale="time"
            tickFormatter={(ms) =>
              new Date(ms).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
            }
            tick={{ fill: "var(--color-fg-subtle)", fontSize: 10 }}
            stroke="var(--color-border)"
            tickLine={false}
            axisLine={false}
            minTickGap={42}
          />

          <YAxis
            tick={{ fill: "var(--color-fg-subtle)", fontSize: 10 }}
            stroke="var(--color-border)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toFixed(2)}
            width={44}
          />

          {/* Validation region — slight tint */}
          <ReferenceArea
            x1={trainEnd}
            x2={valEnd}
            strokeOpacity={0}
            fill="var(--color-fg-subtle)"
            fillOpacity={0.04}
          />
          {/* Test (out-of-sample) region — accent tint, the wedge */}
          <ReferenceArea
            x1={valEnd}
            x2={tsEnd}
            strokeOpacity={0}
            fill="var(--color-accent)"
            fillOpacity={0.06}
          />

          <ReferenceLine x={trainEnd} stroke="var(--color-border-strong)" strokeDasharray="3 3" />
          <ReferenceLine x={valEnd} stroke="var(--color-accent)" strokeDasharray="3 3" />

          <Tooltip content={<EquityTooltip />} cursor={{ stroke: "var(--color-fg-faint)" }} />

          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="var(--color-fg-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
            name="benchmark"
          />
          <Line
            type="monotone"
            dataKey="strategy"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive
            animationDuration={750}
            animationEasing="ease-out"
            name="strategy"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* In-chart region labels — overlay so they don't fight axis ticks */}
      <RegionLabels />
    </motion.div>
  );
}

function RegionLabels() {
  return (
    <div className="pointer-events-none absolute top-2 left-12 right-4 flex justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-faint)]">
      <span>train (in-sample)</span>
      <span>validation</span>
      <span className="text-[var(--color-accent)]">test (out-of-sample)</span>
    </div>
  );
}

type TipPayload = { value: number; dataKey: string; payload: Row };
function EquityTooltip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const strat = payload.find((p) => p.dataKey === "strategy")?.value;
  const bench = payload.find((p) => p.dataKey === "benchmark")?.value;
  if (strat == null) return null;
  return (
    <div className="rounded border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[11px] shadow-lg">
      <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-faint)]">
        {row.date}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
          <span className="h-px w-3 bg-[var(--color-accent)]" />
          strategy
        </span>
        <span className="tabular text-[var(--color-fg)]">{strat.toFixed(3)}</span>
      </div>
      {bench != null && Number.isFinite(bench) && (
        <div className="mt-0.5 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
            <span className="h-px w-3 bg-[var(--color-fg-faint)]" />
            benchmark
          </span>
          <span className="tabular text-[var(--color-fg-muted)]">{bench.toFixed(3)}</span>
        </div>
      )}
      <div className="mt-1 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-1 text-[var(--color-fg-faint)]">
        <span>vs bench</span>
        <span className="tabular">
          {bench != null && Number.isFinite(bench) ? pct(strat / bench - 1) : "—"}
        </span>
      </div>
    </div>
  );
}
