"use client";

import { motion } from "motion/react";
import type { View } from "./Sidebar";
import { cn } from "@/lib/utils";

type Props = {
  view: View;
  strategyName?: string | null;
  versionLabel?: string | null;
  asset?: string | null;
  timeframe?: string | null;
  status: "idle" | "thinking" | "running" | "critiquing" | "ready" | "error";
  viewingOlder?: boolean;
};

const viewTitle: Record<View, { eyebrow: string; title: string }> = {
  chat: { eyebrow: "conversation", title: "Describe & iterate" },
  results: { eyebrow: "backtest", title: "Results" },
  code: { eyebrow: "spec", title: "Code" },
  library: { eyebrow: "reference", title: "Library" },
};

export function Topbar({
  view,
  strategyName,
  versionLabel,
  asset,
  timeframe,
  status,
  viewingOlder,
}: Props) {
  const live = status === "thinking" || status === "running" || status === "critiquing";
  const ctx = viewTitle[view];

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/70 backdrop-blur">
      <div className="flex h-14 items-center gap-5 px-7">
        {/* contextual title */}
        <motion.div
          key={view}
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-baseline gap-2.5"
        >
          <span className="eyebrow">{ctx.eyebrow}</span>
          <span className="serif-italic text-[15px] text-[var(--color-fg)]">
            {ctx.title}
          </span>
        </motion.div>

        {/* breadcrumb */}
        {strategyName && (
          <>
            <span className="h-4 w-px bg-[var(--color-border)]" />
            <div className="flex min-w-0 items-center gap-2 font-mono text-[12px] text-[var(--color-fg-muted)]">
              <span className="truncate text-[var(--color-fg)]">{strategyName}</span>
              {versionLabel && (
                <>
                  <span className="text-[var(--color-fg-faint)]">/</span>
                  <span>{versionLabel}</span>
                </>
              )}
              {asset && timeframe && (
                <>
                  <span className="text-[var(--color-fg-faint)]">·</span>
                  <span>
                    {asset} <span className="text-[var(--color-fg-faint)]">{timeframe}</span>
                  </span>
                </>
              )}
            </div>
          </>
        )}

        {viewingOlder && (
          <span
            className={cn(
              "ml-3 inline-flex items-center gap-1.5 rounded border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5",
              "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-accent-strong)]",
            )}
          >
            <span className="h-1 w-1 rounded-full bg-[var(--color-accent)]" />
            viewing older version
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status === "error" && "bg-[var(--color-down)]",
              !live && (status === "ready" || status === "idle") && "bg-[var(--color-up)]",
              live && "bg-[var(--color-accent)] animate-pulse",
            )}
          />
          <span className="eyebrow text-[10px]">
            {live ? "working" : status === "error" ? "error" : "ready"}
          </span>
        </div>
      </div>
    </header>
  );
}
