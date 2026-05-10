"use client";

import { motion } from "motion/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import { SectionLabel } from "./SectionLabel";
import { cn, num, pct } from "@/lib/utils";
import type { VersionEntry } from "./VersionTimeline";

type Props = {
  a: VersionEntry;
  b: VersionEntry;
  onExit: () => void;
};

export function CompareView({ a, b, onExit }: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] space-y-7 px-7 py-6">
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-4"
        >
          <div>
            <p className="eyebrow mb-1.5">comparison</p>
            <h2 className="text-[20px] font-medium tracking-[-0.01em] text-[var(--color-fg)]">
              <span className="font-mono text-[var(--color-fg-muted)]">{a.label}</span>
              <span className="serif-italic mx-3 text-[var(--color-fg-muted)]">vs</span>
              <span className="font-mono text-[var(--color-accent)]">{b.label}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] px-3 py-1.5 font-mono text-[11.5px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
          >
            <X size={12} />
            exit compare
          </button>
        </motion.div>

        {/* per-version prompt summary */}
        <section className="grid gap-px overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2">
          <PromptCard v={a} accent={false} />
          <PromptCard v={b} accent />
        </section>

        {/* metric deltas */}
        <section className="space-y-3">
          <SectionLabel rule>oos metric deltas · test split</SectionLabel>
          <DeltaGrid a={a} b={b} />
        </section>

        {/* overlaid equity */}
        <section className="space-y-3">
          <SectionLabel rule>equity curves · overlay</SectionLabel>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <OverlayChart a={a} b={b} />
          </div>
        </section>

        <div className="h-2" />
      </div>
    </div>
  );
}

function PromptCard({ v, accent }: { v: VersionEntry; accent: boolean }) {
  return (
    <div className="bg-[var(--color-bg)] px-4 py-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span
          className={cn(
            "font-mono text-[10.5px] uppercase tracking-[0.18em]",
            accent ? "text-[var(--color-accent)]" : "text-[var(--color-fg-muted)]",
          )}
        >
          {v.label}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-fg-faint)]">
          {v.asset} · {v.timeframe}
        </span>
      </div>
      <p className="text-[13px] leading-[1.5] text-[var(--color-fg)]">{v.prompt}</p>
    </div>
  );
}

type Row = {
  label: string;
  a: number | null;
  b: number | null;
  format: "num" | "pct" | "int";
  higherIsBetter: boolean;
};

function DeltaGrid({ a, b }: { a: VersionEntry; b: VersionEntry }) {
  const am = a.result.metrics_test ?? a.result.metrics_full;
  const bm = b.result.metrics_test ?? b.result.metrics_full;
  const rows: Row[] = [
    { label: "Sharpe",       a: am.sharpe,        b: bm.sharpe,        format: "num", higherIsBetter: true },
    { label: "Total return", a: am.total_return,  b: bm.total_return,  format: "pct", higherIsBetter: true },
    { label: "Max drawdown", a: am.max_drawdown,  b: bm.max_drawdown,  format: "pct", higherIsBetter: true },  // less-negative = better
    { label: "Win rate",     a: am.win_rate,      b: bm.win_rate,      format: "pct", higherIsBetter: true },
    { label: "Profit factor",a: am.profit_factor, b: bm.profit_factor, format: "num", higherIsBetter: true },
    { label: "Trades",       a: am.num_trades,    b: bm.num_trades,    format: "int", higherIsBetter: false },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="grid grid-cols-[1fr_120px_120px_120px] gap-4 border-b border-[var(--color-border)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
        <span>metric</span>
        <span className="text-right">{a.label}</span>
        <span className="text-right">{b.label}</span>
        <span className="text-right">delta</span>
      </div>
      <ul>
        {rows.map((r, i) => (
          <DeltaRow key={r.label} row={r} striped={i % 2 === 1} />
        ))}
      </ul>
    </div>
  );
}

function DeltaRow({ row, striped }: { row: Row; striped: boolean }) {
  const fmt = (v: number | null) => {
    if (v == null) return "—";
    if (row.format === "pct") return pct(v);
    if (row.format === "int") return v.toFixed(0);
    return num(v);
  };
  const delta =
    row.a != null && row.b != null && Number.isFinite(row.a) && Number.isFinite(row.b)
      ? row.b - row.a
      : null;
  const goodDelta =
    delta == null
      ? null
      : row.higherIsBetter
        ? delta > 0
        : null; // for trade counts we don't color the delta

  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_120px_120px_120px] items-baseline gap-4 px-4 py-2.5 font-mono text-[12.5px] tabular",
        striped && "bg-[var(--color-bg)]",
      )}
    >
      <span className="text-[var(--color-fg-muted)]">{row.label}</span>
      <span className="text-right text-[var(--color-fg)]">{fmt(row.a)}</span>
      <span className="text-right text-[var(--color-fg)]">{fmt(row.b)}</span>
      <span
        className={cn(
          "text-right",
          goodDelta == null
            ? "text-[var(--color-fg-muted)]"
            : goodDelta
              ? "text-[var(--color-up)]"
              : "text-[var(--color-down)]",
        )}
      >
        {delta == null
          ? "—"
          : row.format === "pct"
            ? pct(delta)
            : row.format === "int"
              ? `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`
              : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`}
      </span>
    </li>
  );
}

type EqRow = {
  ts: number;
  date: string;
  a: number | null;
  b: number | null;
};

function OverlayChart({ a, b }: { a: VersionEntry; b: VersionEntry }) {
  const aMap = new Map(a.result.equity_curve.map(([ts, v]) => [new Date(ts).getTime(), v]));
  const bMap = new Map(b.result.equity_curve.map(([ts, v]) => [new Date(ts).getTime(), v]));
  const allKeys = Array.from(new Set([...aMap.keys(), ...bMap.keys()])).sort((x, y) => x - y);

  const data: EqRow[] = allKeys.map((t) => ({
    ts: t,
    date: new Date(t).toISOString().slice(0, 10),
    a: aMap.get(t) ?? null,
    b: bMap.get(t) ?? null,
  }));
  if (data.length === 0) return null;
  const tsStart = data[0].ts;
  const tsEnd = data[data.length - 1].ts;

  return (
    <div className="relative h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
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
            tickLine={false}
            axisLine={false}
            stroke="var(--color-border)"
            minTickGap={42}
          />
          <YAxis
            tick={{ fill: "var(--color-fg-subtle)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            stroke="var(--color-border)"
            tickFormatter={(v) => v.toFixed(2)}
            width={44}
          />
          <Tooltip content={<OverlayTooltip aLabel={a.label} bLabel={b.label} />} />
          <Line
            type="monotone"
            dataKey="a"
            stroke="var(--color-fg-muted)"
            strokeWidth={1.2}
            dot={false}
            isAnimationActive={false}
            connectNulls
            name={a.label}
          />
          <Line
            type="monotone"
            dataKey="b"
            stroke="var(--color-accent)"
            strokeWidth={1.6}
            dot={false}
            isAnimationActive
            animationDuration={500}
            connectNulls
            name={b.label}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute top-2 right-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.15em]">
        <span className="flex items-center gap-1.5 text-[var(--color-fg-muted)]">
          <span className="h-px w-3 bg-[var(--color-fg-muted)]" />
          {a.label}
        </span>
        <span className="flex items-center gap-1.5 text-[var(--color-accent)]">
          <span className="h-px w-3 bg-[var(--color-accent)]" />
          {b.label}
        </span>
      </div>
    </div>
  );
}

type TipPayload = { value: number | null; dataKey: string; payload: EqRow };
function OverlayTooltip({
  active,
  payload,
  aLabel,
  bLabel,
}: {
  active?: boolean;
  payload?: TipPayload[];
  aLabel: string;
  bLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const aVal = payload.find((p) => p.dataKey === "a")?.value;
  const bVal = payload.find((p) => p.dataKey === "b")?.value;
  return (
    <div className="rounded border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[11px] shadow-lg">
      <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-faint)]">
        {row.date}
      </div>
      {aVal != null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-fg-muted)]">{aLabel}</span>
          <span className="tabular text-[var(--color-fg)]">{aVal.toFixed(3)}</span>
        </div>
      )}
      {bVal != null && (
        <div className="mt-0.5 flex items-center justify-between gap-4">
          <span className="text-[var(--color-accent)]">{bLabel}</span>
          <span className="tabular text-[var(--color-accent)]">{bVal.toFixed(3)}</span>
        </div>
      )}
    </div>
  );
}
