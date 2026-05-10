"use client";

import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

const PROMPTS = [
  "Build a 20/50 EMA crossover on BTC daily, with a 5% stop.",
  "RSI mean-reversion on ETH 4h: buy under 30, sell at 55.",
  "Donchian breakout on BTC 1d, 20-day high, 5% stop and 15% take-profit.",
  "Vol-filtered trend: only trade BTC's 20/50 EMA cross when realized vol is below its 180-day average.",
];

type Props = {
  onPick: (prompt: string) => void;
};

export function EmptyChat({ onPick }: Props) {
  return (
    <div className="flex flex-1 flex-col justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-7 max-w-[42ch]"
      >
        <p className="text-[12.5px] font-mono uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          a research workbench
        </p>
        <h1 className="mt-3 text-[28px] leading-[1.15] tracking-[-0.01em] text-[var(--color-fg)]">
          Describe a strategy.
          <span className="serif-italic text-[var(--color-fg-muted)]"> See whether it survives</span>
          <br />
          out-of-sample.
        </h1>
        <p className="mt-4 text-[13px] leading-[1.55] text-[var(--color-fg-muted)]">
          Backtests are easy to make look good and hard to trust. StratLab runs your
          strategy with in-sample / out-of-sample splits visible by default — so you
          can&apos;t lie to yourself about whether the edge generalizes.
        </p>
      </motion.div>

      <div className="space-y-1.5">
        <p className="eyebrow mb-2">try one of these</p>
        {PROMPTS.map((p, i) => (
          <motion.button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
            className="group flex w-full items-start gap-3 rounded border border-transparent px-3 py-2.5 text-left text-[13px] leading-[1.45] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
          >
            <span className="mt-0.5 font-mono text-[11px] text-[var(--color-fg-faint)] group-hover:text-[var(--color-accent)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex-1">{p}</span>
            <ArrowUpRight
              size={13}
              className="mt-1 shrink-0 text-[var(--color-fg-faint)] opacity-0 transition-opacity group-hover:opacity-100"
            />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
