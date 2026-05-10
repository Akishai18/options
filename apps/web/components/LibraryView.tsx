"use client";

import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";

type IndicatorDoc = {
  name: string;
  signature: string;
  blurb: string;
  example: string;
};

const FAMILIES: { title: string; subtitle: string; items: IndicatorDoc[] }[] = [
  {
    title: "moving averages",
    subtitle: "trend following — smooth past prices to estimate direction",
    items: [
      {
        name: "sma",
        signature: "sma(period, on='close')",
        blurb: "simple moving average over the last `period` bars.",
        example: "cross_above(sma(50), sma(200))",
      },
      {
        name: "ema",
        signature: "ema(period, on='close')",
        blurb: "exponentially weighted moving average; reacts faster than sma.",
        example: "cross_above(ema(20), ema(50))",
      },
    ],
  },
  {
    title: "oscillators",
    subtitle: "bounded indicators — useful for mean reversion",
    items: [
      {
        name: "rsi",
        signature: "rsi(period, on='close')",
        blurb: "wilder's relative strength index, 0–100.",
        example: "rsi(14) < 30",
      },
    ],
  },
  {
    title: "bands",
    subtitle: "envelope around a moving average — overbought/oversold",
    items: [
      {
        name: "bbands_upper",
        signature: "bbands_upper(period, num_std=2.0, on='close')",
        blurb: "upper bollinger band — mid + num_std × rolling stdev.",
        example: "close > bbands_upper(20, 2)",
      },
      {
        name: "bbands_mid",
        signature: "bbands_mid(period, on='close')",
        blurb: "middle band — simple moving average.",
        example: "close > bbands_mid(20)",
      },
      {
        name: "bbands_lower",
        signature: "bbands_lower(period, num_std=2.0, on='close')",
        blurb: "lower bollinger band — mid − num_std × rolling stdev.",
        example: "close < bbands_lower(20, 2)",
      },
    ],
  },
  {
    title: "volatility",
    subtitle: "size positions, set stops, filter regimes",
    items: [
      {
        name: "atr",
        signature: "atr(period)",
        blurb: "wilder's average true range — typical bar size.",
        example: "atr(14) > atr(60)",
      },
      {
        name: "stdev",
        signature: "stdev(period, on='close')",
        blurb: "rolling standard deviation of price.",
        example: "stdev(20) < stdev(60)",
      },
      {
        name: "realized_vol",
        signature: "realized_vol(period, on='close')",
        blurb: "rolling stdev of log returns; not annualized but unit-consistent.",
        example: "realized_vol(30) < realized_vol(180)",
      },
    ],
  },
  {
    title: "trend strength",
    items: [
      {
        name: "slope",
        signature: "slope(period, on='close')",
        blurb: "(current − past) / past — unitless rate of change.",
        example: "slope(close, 30) > 0",
      },
      {
        name: "adx",
        signature: "adx(period)",
        blurb: "wilder's average directional index — trend strength only, no direction.",
        example: "adx(14) > 25",
      },
    ],
    subtitle: "is the trend real, or just noise",
  },
  {
    title: "rolling extremes",
    subtitle: "donchian-style breakouts (uses prior bars only — current bar is excluded)",
    items: [
      {
        name: "rolling_max",
        signature: "rolling_max(period, on='high')",
        blurb: "max of the prior `period` bars — donchian upper.",
        example: "close > rolling_max(high, 20)",
      },
      {
        name: "rolling_min",
        signature: "rolling_min(period, on='low')",
        blurb: "min of the prior `period` bars — donchian lower.",
        example: "close < rolling_min(low, 20)",
      },
    ],
  },
];

const COMPARISONS = [
  { op: "gt / lt / gte / lte", note: "scalar comparison at each bar" },
  { op: "cross_above / cross_below", note: "crosses on the current bar" },
  { op: "eq", note: "equality (rarely useful for floats)" },
];

const LOGICALS = [
  { op: "and", note: "all operands true" },
  { op: "or", note: "any operand true" },
  { op: "not", note: "negate single operand" },
];

export function LibraryView() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-7 px-7 py-6">
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="border-b border-[var(--color-border)] pb-4"
        >
          <p className="eyebrow mb-1.5">closed vocabulary</p>
          <h2 className="text-[20px] font-medium tracking-[-0.01em] text-[var(--color-fg)]">
            Indicators & operators
            <span className="serif-italic ml-2 text-[var(--color-fg-muted)]">
              — what the LLM is allowed to reach for
            </span>
          </h2>
          <p className="mt-3 max-w-[68ch] text-[13px] leading-[1.6] text-[var(--color-fg-muted)]">
            Every name here is a registered, look-ahead-safe primitive. The LLM
            cannot invent indicators — it must compose strategies from this
            vocabulary, and Pydantic validates structurally before anything
            touches market data.
          </p>
        </motion.div>

        {FAMILIES.map((fam, fi) => (
          <motion.section
            key={fam.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 * fi }}
            className="space-y-3"
          >
            <div>
              <SectionLabel rule>{fam.title}</SectionLabel>
              {fam.subtitle && (
                <p className="serif-italic mt-1.5 text-[13px] text-[var(--color-fg-muted)]">
                  {fam.subtitle}
                </p>
              )}
            </div>
            <div className="grid gap-px rounded-md border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2">
              {fam.items.map((it) => (
                <article
                  key={it.name}
                  className="bg-[var(--color-surface)] px-4 py-3.5"
                >
                  <header className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[13px] font-medium text-[var(--color-fg)]">
                      {it.name}
                    </span>
                    <span className="font-mono text-[10.5px] text-[var(--color-fg-faint)]">
                      {it.signature}
                    </span>
                  </header>
                  <p className="text-[12.5px] leading-[1.55] text-[var(--color-fg-muted)]">
                    {it.blurb}
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-bg)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--color-accent)]">
                    {it.example}
                  </pre>
                </article>
              ))}
            </div>
          </motion.section>
        ))}

        <section className="grid gap-7 md:grid-cols-2">
          <div className="space-y-3">
            <SectionLabel rule>comparisons</SectionLabel>
            <ul className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {COMPARISONS.map((c) => (
                <li key={c.op} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="font-mono text-[12px] text-[var(--color-fg)] w-[180px]">
                    {c.op}
                  </span>
                  <span className="text-[12.5px] text-[var(--color-fg-muted)]">
                    {c.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <SectionLabel rule>logicals</SectionLabel>
            <ul className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {LOGICALS.map((c) => (
                <li key={c.op} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="font-mono text-[12px] text-[var(--color-fg)] w-[180px]">
                    {c.op}
                  </span>
                  <span className="text-[12.5px] text-[var(--color-fg-muted)]">
                    {c.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/50 px-5 py-4 text-[12.5px] leading-[1.6] text-[var(--color-fg-muted)]">
          <span className="serif-italic text-[var(--color-fg)]">A note on look-ahead. </span>
          Each indicator is causal — it only reads bars at or before time t.
          The compiler then shifts every entry/exit signal by one bar, so a
          rule formed at the close of bar t executes at the open of bar t+1.
          That single shift is the project&apos;s only line of defense against
          subtle look-ahead bugs, and it has a dedicated test
          (a perfect-future-knowledge strategy must regress to chance).
        </div>

        <div className="h-2" />
      </div>
    </div>
  );
}
