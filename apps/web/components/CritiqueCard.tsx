"use client";

import { motion } from "motion/react";
import { SectionLabel } from "./SectionLabel";

type Props = {
  text: string | null;
  loading?: boolean;
};

export function CritiqueCard({ text, loading }: Props) {
  // Streaming case: text already contains partial output AND loading is true.
  // Render the partial text with a blinking cursor; once loading flips off
  // the cursor disappears.
  if (loading && !text) {
    return (
      <div className="space-y-2">
        <SectionLabel rule>critique</SectionLabel>
        <div className="space-y-2 px-1 pt-2">
          <div className="h-3 w-full shimmer rounded" />
          <div className="h-3 w-[92%] shimmer rounded" />
          <div className="h-3 w-[78%] shimmer rounded" />
          <div className="h-3 w-[88%] shimmer rounded" />
        </div>
      </div>
    );
  }
  if (!text) return null;

  // Drop-cap the first letter as an italic-serif accent — magazine-y.
  const first = text.slice(0, 1);
  const rest = text.slice(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
      className="space-y-3"
    >
      <SectionLabel rule>critique</SectionLabel>
      <div
        className="relative glass rounded-2xl p-6 overflow-hidden"
        style={{
          boxShadow:
            "inset 0 1px 0 0 oklch(1 0 0 / 0.12), inset 0 -1px 0 0 oklch(0 0 0 / 0.2), 0 10px 30px -12px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(0.74 0.16 235 / 0.06)",
        }}
      >
        {/* subtle accent wash from the top-left, behind text */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.74 0.16 235 / 0.18), transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <p className={`relative text-[14.5px] leading-[1.75] text-[var(--color-fg)] ${loading ? "cursor-blink" : ""}`}>
          <span className="serif-italic float-left mr-1.5 mt-0 text-[42px] leading-[0.85] text-[var(--color-accent)]">
            {first}
          </span>
          {rest}
        </p>
        <div className="relative mt-5 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
          <span className={`h-1 w-1 rounded-full ${loading ? "bg-[var(--color-accent)] animate-pulse" : "bg-[var(--color-up)]"}`} />
          <span className="eyebrow text-[10px]">
            {loading ? "streaming critique…" : "grounded in computed metrics — no market reasoning"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
