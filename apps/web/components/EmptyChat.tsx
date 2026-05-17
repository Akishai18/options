"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Activity, DollarSign, Sliders, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PROMPTS = [
  { title: "20/50 EMA crossover",   body: "Build a 20/50 EMA crossover on BTC daily, with a 5% stop." },
  { title: "RSI mean-reversion",    body: "RSI mean-reversion on ETH 4h: buy under 30, sell at 55." },
  { title: "Donchian breakout",     body: "Donchian breakout on BTC 1d, 20-day high, 5% stop and 15% take-profit." },
  { title: "Vol-filtered trend",    body: "Vol-filtered trend: only trade BTC's 20/50 EMA cross when realized vol is below its 180-day average." },
];

type AxisPreview = { num: string; title: string; detail: string; icon: LucideIcon };

const AXES: AxisPreview[] = [
  { num: "01", title: "In-Sample / OOS",        detail: "Did your edge survive on data the strategy never saw?",          icon: Sliders },
  { num: "02", title: "Parameter Sensitivity",  detail: "Does it fall apart if your “20-day” was really meant to be 24?",  icon: Activity },
  { num: "03", title: "Cost Robustness",        detail: "Does it still work at 2× the assumed fees?",                       icon: DollarSign },
  { num: "04", title: "Walk-Forward",           detail: "Is it consistent across time, or did it just get lucky once?",     icon: TrendingUp },
];

type Props = { onPick: (prompt: string) => void };

export function EmptyChat({ onPick }: Props) {
  return (
    <div className="flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 inline-flex w-fit items-center gap-2 rounded-full glass-soft px-3 py-1"
      >
        <span className="size-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--color-fg-muted)]">
          Vol. 1 · The Research Workbench
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1], delay: 0.05 }}
        className="mb-9"
      >
        <h1 className="display text-[44px] md:text-[60px] text-[var(--color-fg)]">
          Describe a strategy.
          <br />
          <span className="display-italic text-[var(--color-fg-muted)]">See whether</span>{" "}
          <span className="text-[var(--color-accent)]">it survives</span>
          <span className="text-[var(--color-fg)]"> out&#8209;of&#8209;sample.</span>
        </h1>
        <p className="mt-6 max-w-[62ch] text-[15px] leading-[1.65] text-[var(--color-fg-muted)]">
          Backtests are easy to make look good and hard to trust. StratLab runs
          your strategy with in-sample / out-of-sample splits visible by
          default — and stress-tests it along four independent axes — so you
          can&apos;t lie to yourself about whether the edge generalizes.
        </p>
      </motion.div>

      {/* Methodology preview — glass tiles in the same shape as the verdict grid */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18 }}
        className="mb-10"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow">Methodology · four stress tests</span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase rounded-full glass-soft px-2.5 py-0.5 text-[var(--color-accent-strong)]">
            <span className="opacity-70">●</span>&nbsp; Awaiting input
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AXES.map((a, i) => (
            <motion.div
              key={a.num}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.22 + i * 0.05 }}
              className="group glass glass-sheen rounded-2xl p-5 card-lift hover:bg-[oklch(1_0_0/0.06)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--color-fg-muted)]">
                  Axis {a.num}
                </span>
                <span className="grid size-6 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <a.icon size={11} strokeWidth={1.8} />
                </span>
              </div>
              <p className="text-[18px] font-medium leading-tight tracking-[-0.015em] text-[var(--color-fg)]">
                {a.title}
              </p>
              <p className="mt-2 text-[12.5px] leading-snug text-[var(--color-fg-muted)]">
                {a.detail}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Prompt examples — glass cards, generous radii */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="eyebrow shrink-0">Try one of these</span>
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROMPTS.map((p, i) => (
            <motion.button
              key={p.title}
              type="button"
              onClick={() => onPick(p.body)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.45 + i * 0.04 }}
              className="group glass-soft glass-sheen relative flex flex-col gap-1.5 rounded-2xl px-4 py-3.5 text-left card-lift hover:bg-[oklch(1_0_0/0.07)]"
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
              <span className="text-[13.5px] leading-[1.5] text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]">
                {p.body}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
