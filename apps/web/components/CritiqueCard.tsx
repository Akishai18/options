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
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <p className={`text-[14px] leading-[1.7] text-[var(--color-fg)] ${loading ? "cursor-blink" : ""}`}>
          <span className="serif-italic float-left mr-1.5 mt-0 text-[36px] leading-[0.9] text-[var(--color-accent)]">
            {first}
          </span>
          {rest}
        </p>
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
          <span className={`h-1 w-1 rounded-full ${loading ? "bg-[var(--color-accent)] animate-pulse" : "bg-[var(--color-up)]"}`} />
          <span className="eyebrow text-[10px]">
            {loading ? "streaming critique…" : "grounded in computed metrics — no market reasoning"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
