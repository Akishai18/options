"use client";

import { motion } from "motion/react";
import { Activity, TrendingUp, Waves, Wind } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionLabel } from "./SectionLabel";
import { cn, num } from "@/lib/utils";
import type { RegimeBreakdown, RegimeStat } from "@/lib/types";

type Props = { regime: RegimeBreakdown };

const META: Record<RegimeStat["label"], { title: string; icon: LucideIcon; blurb: string }> = {
  low_vol: {
    title: "low vol",
    icon: Waves,
    blurb: "calm bars — small bar-to-bar moves",
  },
  high_vol: {
    title: "high vol",
    icon: Wind,
    blurb: "loud bars — large bar-to-bar moves",
  },
  trending: {
    title: "trending",
    icon: TrendingUp,
    blurb: "50-bar SMA rising vs 20 bars ago",
  },
  sideways: {
    title: "sideways",
    icon: Activity,
    blurb: "50-bar SMA flat or falling",
  },
};

export function RegimeBreakdownGrid({ regime }: Props) {
  const cells: RegimeStat[] = [
    regime.low_vol,
    regime.high_vol,
    regime.trending,
    regime.sideways,
  ];
  // Spot the strongest and weakest regime to highlight the gap.
  const sortedBySharpe = [...cells].sort((a, b) => b.sharpe - a.sharpe);
  const best = sortedBySharpe[0];
  const worst = sortedBySharpe[sortedBySharpe.length - 1];
  const gap = best.sharpe - worst.sharpe;
  const lopsided = gap > 1.5;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <SectionLabel rule>regime decomposition · test split</SectionLabel>
        {lopsided ? (
          <span className="font-mono text-[10.5px] text-[var(--color-down)]">
            regime-dependent · {best.label.replace("_", " ")} carries the strategy
          </span>
        ) : (
          <span className="font-mono text-[10.5px] text-[var(--color-fg-muted)]">
            balanced across regimes
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((cell) => (
          <RegimeCell
            key={cell.label}
            cell={cell}
            isBest={cell.label === best.label && best.sharpe > 0}
            isWorst={cell.label === worst.label && lopsided}
          />
        ))}
      </div>

      {regime.note && (
        <p className="font-mono text-[10.5px] text-[var(--color-fg-faint)]">
          {regime.note}
        </p>
      )}
    </motion.section>
  );
}

function RegimeCell({
  cell,
  isBest,
  isWorst,
}: {
  cell: RegimeStat;
  isBest: boolean;
  isWorst: boolean;
}) {
  const meta = META[cell.label];
  return (
    <div className="relative glass-flat rounded-2xl flex flex-col gap-2 px-4 py-3.5">
      {isBest && (
        <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[var(--color-up)] shadow-[0_0_8px_var(--color-up)]" />
      )}
      {isWorst && (
        <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[var(--color-down)] shadow-[0_0_8px_var(--color-down)]" />
      )}
      <div className="flex items-center gap-2">
        <meta.icon
          size={13}
          strokeWidth={1.5}
          className={cn(
            "text-[var(--color-fg-muted)]",
            isBest && "text-[var(--color-up)]",
            isWorst && "text-[var(--color-down)]",
          )}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
          {meta.title}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "tabular font-mono text-[22px] font-light leading-none",
            cell.sharpe >= 0
              ? "text-[var(--color-fg)]"
              : "text-[var(--color-down)]",
          )}
        >
          {num(cell.sharpe)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)]">
          sharpe
        </span>
      </div>
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="font-mono text-[var(--color-fg-faint)]">
          {(cell.fraction * 100).toFixed(0)}% of bars
        </span>
        <span className="font-mono text-[var(--color-fg-faint)]">
          {cell.bars} bars
        </span>
      </div>
      <p className="serif-italic text-[11px] leading-[1.4] text-[var(--color-fg-muted)]">
        {meta.blurb}
      </p>
    </div>
  );
}
