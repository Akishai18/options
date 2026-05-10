"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Sparkles } from "lucide-react";

const PROMPTS = [
  {
    title: "20/50 EMA crossover",
    body: "Build a 20/50 EMA crossover on BTC daily, with a 5% stop.",
  },
  {
    title: "RSI mean-reversion",
    body: "RSI mean-reversion on ETH 4h: buy under 30, sell at 55.",
  },
  {
    title: "Donchian breakout",
    body: "Donchian breakout on BTC 1d, 20-day high, 5% stop and 15% take-profit.",
  },
  {
    title: "Vol-filtered trend",
    body: "Vol-filtered trend: only trade BTC's 20/50 EMA cross when realized vol is below its 180-day average.",
  },
];

type Props = {
  onPick: (prompt: string) => void;
};

export function EmptyChat({ onPick }: Props) {
  return (
    <div className="flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-9"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
          <Sparkles size={11} className="text-[var(--color-accent)]" />
          <span className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-[var(--color-fg-muted)]">
            a research workbench
          </span>
        </div>
        <h1 className="text-[26px] md:text-[34px] leading-[1.1] tracking-[-0.015em] text-[var(--color-fg)]">
          Describe a strategy.
          <br />
          <span className="serif-italic text-[var(--color-fg-muted)]">
            See whether it survives
          </span>{" "}
          out-of-sample.
        </h1>
        <p className="mt-5 max-w-[58ch] text-[14px] leading-[1.6] text-[var(--color-fg-muted)]">
          Backtests are easy to make look good and hard to trust. StratLab runs your
          strategy with in-sample / out-of-sample splits visible by default — so you
          can&apos;t lie to yourself about whether the edge generalizes.
        </p>
      </motion.div>

      <div>
        <p className="eyebrow mb-3">try one of these</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROMPTS.map((p, i) => (
            <motion.button
              key={p.title}
              type="button"
              onClick={() => onPick(p.body)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
              className="group relative flex flex-col gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-3 text-left transition-all hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-accent)]">
                  {p.title}
                </span>
                <ArrowUpRight
                  size={12}
                  className="text-[var(--color-fg-faint)] transition-all group-hover:text-[var(--color-accent)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </div>
              <span className="text-[13px] leading-[1.5] text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]">
                {p.body}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
