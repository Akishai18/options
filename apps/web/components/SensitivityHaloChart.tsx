"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionLabel } from "./SectionLabel";
import { cn, num } from "@/lib/utils";
import type { EquityPoint, SensitivityHalo } from "@/lib/types";

type Props = {
  halo: SensitivityHalo;
  baseline: EquityPoint[];
  trainFraction: number;
  valFraction: number;
};

type Row = {
  ts: number;
  date: string;
  base: number;
  lo: number;
  hi: number;
  band: [number, number];
};

export function SensitivityHaloChart({
  halo,
  baseline,
  trainFraction,
  valFraction,
}: Props) {
  // Index lo/hi by ms-since-epoch so we can join robustly to the baseline.
  const data: Row[] = useMemo(() => {
    const loByTs = new Map(
      halo.envelope_lo.map(([ts, v]) => [new Date(ts).getTime(), v]),
    );
    const hiByTs = new Map(
      halo.envelope_hi.map(([ts, v]) => [new Date(ts).getTime(), v]),
    );
    return baseline.map(([ts, v]) => {
      const t = new Date(ts).getTime();
      const lo = loByTs.get(t) ?? v;
      const hi = hiByTs.get(t) ?? v;
      return {
        ts: t,
        date: new Date(ts).toISOString().slice(0, 10),
        base: v,
        lo,
        hi,
        band: [lo, hi] as [number, number],
      };
    });
  }, [halo.envelope_lo, halo.envelope_hi, baseline]);

  if (data.length === 0) return null;

  const tsStart = data[0].ts;
  const tsEnd = data[data.length - 1].ts;
  const span = tsEnd - tsStart;
  const trainEnd = tsStart + span * trainFraction;
  const valEnd = trainEnd + span * valFraction;

  // Halo-width band → fragility tint. Cool blue when narrow (robust), warm
  // amber when wide (fragile). Linear ramp between 5% and 50% width.
  const widthPct = halo.median_width;
  const fragility = Math.max(0, Math.min(1, (widthPct - 0.05) / 0.45));
  const fragile = fragility > 0.55;
  const haloLabel =
    fragility < 0.25 ? "robust" : fragility < 0.6 ? "moderate" : "fragile";

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <SectionLabel rule>
          sensitivity halo · each param ±{(halo.delta * 100).toFixed(0)}%
        </SectionLabel>
        <span
          className={cn(
            "font-mono text-[10.5px]",
            fragile
              ? "text-[var(--color-down)]"
              : fragility > 0.25
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-up)]",
          )}
        >
          {haloLabel} · median width {(widthPct * 100).toFixed(1)}%
        </span>
      </div>

      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="relative h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
            >
              <defs>
                <linearGradient id="halo-band" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={fragile ? "var(--color-down)" : "var(--color-accent)"}
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor={fragile ? "var(--color-down)" : "var(--color-accent)"}
                    stopOpacity={0.06}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="2 4"
                stroke="var(--color-border)"
                vertical={false}
              />

              <XAxis
                dataKey="ts"
                type="number"
                domain={[tsStart, tsEnd]}
                scale="time"
                tickFormatter={(ms) =>
                  new Date(ms).toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                  })
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

              <ReferenceArea
                x1={valEnd}
                x2={tsEnd}
                strokeOpacity={0}
                fill="var(--color-accent)"
                fillOpacity={0.04}
              />

              <Tooltip content={<HaloTooltip />} cursor={{ stroke: "var(--color-fg-faint)" }} />

              {/* Envelope band — area between lo and hi. */}
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="url(#halo-band)"
                isAnimationActive={false}
                activeDot={false}
              />
              {/* Baseline equity line. */}
              <Line
                type="monotone"
                dataKey="base"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive
                animationDuration={600}
                name="baseline"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute top-2 right-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-faint)]">
            <span className="text-[var(--color-accent)]">
              ±{(halo.delta * 100).toFixed(0)}% per param envelope
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
          <p className="eyebrow mb-2">per-parameter sharpe spread</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {halo.perturbations.map((p) => (
              <li
                key={p.path}
                className="flex items-baseline justify-between gap-3 rounded bg-[var(--color-bg)] px-3 py-2 font-mono text-[11.5px]"
              >
                <span className="truncate text-[var(--color-fg-muted)]">
                  {prettyPath(p.path)}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="text-[10px] text-[var(--color-fg-faint)]">
                    {fmtNum(p.low_value)} · {fmtNum(p.base_value)} · {fmtNum(p.high_value)}
                  </span>
                  <span
                    className={cn(
                      "tabular",
                      p.sharpe_range > 1.0
                        ? "text-[var(--color-down)]"
                        : p.sharpe_range > 0.4
                          ? "text-[var(--color-accent)]"
                          : "text-[var(--color-fg-muted)]",
                    )}
                  >
                    Δ{num(p.sharpe_range)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {halo.skipped_paths.length > 0 && (
            <p className="mt-2 font-mono text-[10px] text-[var(--color-fg-faint)]">
              skipped: {halo.skipped_paths.join(", ")}
            </p>
          )}
          <p className="mt-3 text-[11.5px] leading-[1.55] text-[var(--color-fg-muted)]">
            <span className="serif-italic text-[var(--color-fg)]">A note. </span>
            One-at-a-time perturbation — the band is the per-bar
            min/max across {1 + 2 * halo.perturbations.length} runs (baseline +
            ±{(halo.delta * 100).toFixed(0)}% on each parameter). A wide,
            warm-tinted halo means the strategy is fragile to the exact param
            values; a narrow, cool one means it&apos;s robust.
          </p>
        </div>
      </div>
    </motion.section>
  );
}

function prettyPath(p: string): string {
  // "entry.left.params.period" → "entry.left period"
  return p.replace(/\.params\./, " ").replace(/\.value$/, " value");
}

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1) return v.toFixed(v % 1 === 0 ? 0 : 2);
  return v.toFixed(3);
}

type TipPayload = { value: number | number[]; dataKey: string; payload: Row };
function HaloTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const widthAbs = row.hi - row.lo;
  const widthPct = row.base === 0 ? 0 : widthAbs / Math.abs(row.base);
  return (
    <div className="rounded border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[11px] shadow-lg">
      <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-faint)]">
        {row.date}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[var(--color-fg-muted)]">baseline</span>
        <span className="tabular text-[var(--color-fg)]">{row.base.toFixed(3)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-4 text-[var(--color-fg-muted)]">
        <span>halo</span>
        <span className="tabular">
          {row.lo.toFixed(3)} – {row.hi.toFixed(3)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-1 text-[var(--color-fg-faint)]">
        <span>width</span>
        <span className="tabular">{(widthPct * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
