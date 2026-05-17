"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { SectionLabel } from "./SectionLabel";
import { cn, num, pct } from "@/lib/utils";
import type { TradeRecord } from "@/lib/types";

type Props = {
  trades: TradeRecord[];
};

const REASON_LABEL: Record<TradeRecord["exit_reason"], string> = {
  signal: "signal",
  stop_loss: "stop",
  take_profit: "tp",
  end_of_data: "eod",
};

const REASON_COLOR: Record<TradeRecord["exit_reason"], string> = {
  signal: "text-[var(--color-fg-muted)]",
  stop_loss: "text-[var(--color-down)]",
  take_profit: "text-[var(--color-up)]",
  end_of_data: "text-[var(--color-fg-faint)]",
};

const PAGE = 25;

export function TradesTable({ trades }: Props) {
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => {
    if (trades.length === 0) return null;
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);
    const avgWin =
      wins.length === 0 ? 0 : wins.reduce((s, t) => s + t.return_pct, 0) / wins.length;
    const avgLoss =
      losses.length === 0
        ? 0
        : losses.reduce((s, t) => s + t.return_pct, 0) / losses.length;
    const bestReturn = Math.max(...trades.map((t) => t.return_pct));
    const worstReturn = Math.min(...trades.map((t) => t.return_pct));
    const avgBars = trades.reduce((s, t) => s + t.bars_held, 0) / trades.length;
    return { avgWin, avgLoss, bestReturn, worstReturn, avgBars };
  }, [trades]);

  if (trades.length === 0 || !stats) {
    return (
      <section className="space-y-3">
        <SectionLabel rule>trade log</SectionLabel>
        <div className="glass-flat rounded-2xl px-5 py-6 text-center text-[13px] text-[var(--color-fg-muted)]">
          <span className="serif-italic">No trades — the entry rule never fired in this window.</span>
        </div>
      </section>
    );
  }

  const visible = showAll ? trades : trades.slice(0, PAGE);

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      <SectionLabel rule>
        trade log
        <span className="ml-2 font-mono text-[10.5px] text-[var(--color-fg-faint)]">
          {trades.length} closed
        </span>
      </SectionLabel>

      {/* summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="best" value={pct(stats.bestReturn)} accent="up" />
        <Stat label="worst" value={pct(stats.worstReturn)} accent="down" />
        <Stat label="avg win" value={pct(stats.avgWin)} accent="up" />
        <Stat
          label="avg loss"
          value={pct(stats.avgLoss)}
          accent="down"
        />
      </div>

      <div className="overflow-hidden rounded-2xl glass-flat">
        <div className="grid grid-cols-[1fr_60px_90px_90px_90px_70px_70px] gap-3 border-b border-[var(--color-border)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
          <span>entry → exit</span>
          <span>side</span>
          <span className="text-right">entry</span>
          <span className="text-right">exit</span>
          <span className="text-right">return</span>
          <span className="text-right">bars</span>
          <span className="text-right">reason</span>
        </div>
        <ul>
          {visible.map((t, i) => (
            <li
              key={`${t.entry_ts}-${i}`}
              className={cn(
                "grid grid-cols-[1fr_60px_90px_90px_90px_70px_70px] items-baseline gap-3 px-4 py-2 font-mono text-[11.5px] tabular",
                i % 2 === 1 && "bg-[var(--color-bg)]",
              )}
            >
              <span className="truncate text-[var(--color-fg-muted)]">
                <span className="text-[var(--color-fg)]">{t.entry_ts.slice(0, 10)}</span>
                <span className="text-[var(--color-fg-faint)]"> → </span>
                <span className="text-[var(--color-fg)]">{t.exit_ts.slice(0, 10)}</span>
              </span>
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider",
                  t.side === "long" ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
                )}
              >
                {t.side}
              </span>
              <span className="text-right text-[var(--color-fg-muted)]">
                {num(t.entry_price)}
              </span>
              <span className="text-right text-[var(--color-fg-muted)]">
                {num(t.exit_price)}
              </span>
              <span
                className={cn(
                  "text-right font-medium",
                  t.return_pct >= 0
                    ? "text-[var(--color-up)]"
                    : "text-[var(--color-down)]",
                )}
              >
                {pct(t.return_pct)}
              </span>
              <span className="text-right text-[var(--color-fg-muted)]">
                {t.bars_held}
              </span>
              <span
                className={cn(
                  "text-right text-[10px] uppercase tracking-wider",
                  REASON_COLOR[t.exit_reason],
                )}
              >
                {REASON_LABEL[t.exit_reason]}
              </span>
            </li>
          ))}
        </ul>
        {trades.length > PAGE && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--color-border)] px-4 py-2 font-mono text-[11px] text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            {showAll ? "collapse" : `show all ${trades.length}`}
            <ChevronDown
              size={11}
              className={cn(
                "transition-transform",
                showAll ? "rotate-180" : "rotate-0",
              )}
            />
          </button>
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
  accent?: "up" | "down";
}) {
  return (
    <div className="glass-flat rounded-2xl flex flex-col gap-1 px-3.5 py-2.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-mono text-[15px] font-light leading-none",
          accent === "up" && "text-[var(--color-up)]",
          accent === "down" && "text-[var(--color-down)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
