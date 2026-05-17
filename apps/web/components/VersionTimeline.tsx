"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn, num, pct } from "@/lib/utils";
import type { BacktestResult } from "@/lib/types";

export type VersionEntry = {
  id: string;
  label: string;
  prompt: string;
  result: BacktestResult;
  asset: string | null;
  timeframe: string | null;
  createdAt: number;
  /** Server-side version id (when known) — used by the export endpoint. */
  serverVersionId?: string | null;
};

type Props = {
  versions: VersionEntry[];
  activeId: string | null;
  compareId?: string | null;
  onSelect: (id: string) => void;
  onCompare?: (id: string) => void;
};

export function VersionTimeline({
  versions,
  activeId,
  compareId,
  onSelect,
  onCompare,
}: Props) {
  if (versions.length === 0) return null;
  const isLatest = (id: string) => id === versions[versions.length - 1].id;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className="glass-soft px-4 py-3 md:px-7"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">version history</span>
        <span className="font-mono text-[10.5px] text-[var(--color-fg-faint)]">
          {versions.length} {versions.length === 1 ? "version" : "versions"}
          {onCompare && versions.length >= 2 && (
            <> · <span className="text-[var(--color-fg-muted)]">⇧ click to compare</span></>
          )}
        </span>
      </div>

      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {versions.map((v, i) => {
          const prior = i > 0 ? versions[i - 1].result.metrics_test : null;
          const cur = v.result.metrics_test;
          const sharpeDelta =
            prior && cur ? cur.sharpe - prior.sharpe : null;
          const isActive = v.id === activeId;
          const isCompare = v.id === compareId;
          const latest = isLatest(v.id);
          return (
            <button
              type="button"
              key={v.id}
              onClick={(e) => {
                if (onCompare && (e.shiftKey || e.metaKey) && v.id !== activeId) {
                  onCompare(v.id);
                  return;
                }
                onSelect(v.id);
              }}
              className={cn(
                "group relative flex shrink-0 flex-col gap-1 rounded-2xl px-3.5 py-2.5 text-left transition-all duration-300",
                "min-w-[200px] max-w-[280px] glass-sheen card-lift",
                isActive
                  ? "bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]/50 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.12),0_0_24px_-6px_oklch(0.74_0.16_235/0.35)]"
                  : isCompare
                    ? "glass-flat-strong ring-1 ring-[var(--color-fg-muted)]/30"
                    : "glass-flat hover:bg-[oklch(1_0_0/0.06)]",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "font-mono text-[11px] tracking-wider uppercase",
                    isActive
                      ? "text-[var(--color-accent-strong)]"
                      : "text-[var(--color-fg-muted)]",
                  )}
                >
                  {v.label}
                </span>
                {latest && (
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
                    latest
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2.5">
                <span
                  className={cn(
                    "tabular font-mono text-[14px] font-light",
                    cur && cur.sharpe >= 0
                      ? "text-[var(--color-fg)]"
                      : "text-[var(--color-down)]",
                  )}
                >
                  {num(cur?.sharpe ?? null)}
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--color-fg-faint)]">
                  oos sharpe
                </span>
                {sharpeDelta != null && (
                  <span
                    className={cn(
                      "ml-auto font-mono text-[10.5px]",
                      sharpeDelta > 0.05
                        ? "text-[var(--color-up)]"
                        : sharpeDelta < -0.05
                          ? "text-[var(--color-down)]"
                          : "text-[var(--color-fg-muted)]",
                    )}
                  >
                    {sharpeDelta >= 0 ? "+" : ""}
                    {sharpeDelta.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-[11px] leading-[1.4] text-[var(--color-fg-muted)]">
                {v.prompt}
              </p>
              <div className="flex items-baseline justify-between font-mono text-[10px] text-[var(--color-fg-faint)]">
                <span>
                  {cur ? `${cur.num_trades} trades` : "—"} · {pct(cur?.total_return)}
                </span>
                <span>
                  {new Date(v.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {isActive && (
                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-bg)]">
                  <ArrowRight size={10} strokeWidth={3} />
                </span>
              )}
              {isCompare && (
                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-[var(--color-fg-muted)] bg-[var(--color-surface)] font-mono text-[8px] text-[var(--color-fg-muted)]">
                  vs
                </span>
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
