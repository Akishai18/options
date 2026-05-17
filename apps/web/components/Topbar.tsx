"use client";

import { motion } from "motion/react";
import { Download, GitCompare } from "lucide-react";
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
  canCompare?: boolean;
  canExport?: boolean;
  onCompare?: () => void;
  onExport?: () => void;
};

const eyebrowFor: Record<View, string> = {
  chat:    "Conversation",
  results: "Backtest",
  code:    "Spec",
  library: "Reference",
};

export function Topbar({
  view,
  strategyName,
  versionLabel,
  asset,
  timeframe,
  status,
  viewingOlder,
  canCompare,
  canExport,
  onCompare,
  onExport,
}: Props) {
  const live =
    status === "thinking" || status === "running" || status === "critiquing";

  return (
    <header className="h-14 shrink-0 border-b border-[var(--color-border)] glass-soft">
      <div className="flex h-full items-center gap-4 px-4 md:px-8">
        {/* mobile wordmark — sidebar is hidden, so brand lives here */}
        <span className="md:hidden font-mono text-[12px] font-medium tracking-[0.22em] text-[var(--color-fg)]">
          STRATLAB
        </span>
        <span className="md:hidden h-4 w-px bg-[var(--color-border)]" />

        {/* eyebrow + title — lovable-style breadcrumb */}
        <motion.div
          key={view}
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          className="flex min-w-0 items-baseline gap-3"
        >
          <span className="hidden sm:inline font-mono text-[10px] tracking-[0.24em] uppercase text-[var(--color-fg-muted)]">
            {eyebrowFor[view]} <span className="text-[var(--color-fg-faint)] ml-1">/</span>
          </span>
          <h2 className="truncate text-[16px] md:text-[17px] font-medium tracking-[-0.015em] text-[var(--color-fg)] leading-none">
            {strategyName ? (
              <>
                {strategyName}
                {versionLabel && (
                  <span className="text-[var(--color-fg-muted)]"> · {versionLabel}</span>
                )}
              </>
            ) : (
              eyebrowLabelFromView(view)
            )}
          </h2>
        </motion.div>

        {/* tiny secondary breadcrumb (asset · timeframe) */}
        {strategyName && asset && timeframe && (
          <span className="hidden lg:inline font-mono text-[10.5px] text-[var(--color-fg-muted)] ml-2">
            {asset} <span className="text-[var(--color-fg-faint)]">{timeframe}</span>
          </span>
        )}

        {viewingOlder && (
          <span
            className={cn(
              "ml-2 hidden sm:inline-flex items-center gap-1.5 rounded border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5",
              "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-accent-strong)]",
            )}
          >
            <span className="h-1 w-1 rounded-full bg-[var(--color-accent)]" />
            viewing older
          </span>
        )}

        {/* actions + status */}
        <div className="ml-auto flex items-center gap-2">
          {canCompare && onCompare && (
            <button
              type="button"
              onClick={onCompare}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full glass-soft px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-fg-muted)] transition-all duration-200 hover:text-[var(--color-fg)] hover:bg-[oklch(1_0_0/0.08)]"
            >
              <GitCompare size={11} />
              Compare
            </button>
          )}
          {canExport && onExport && (
            <button
              type="button"
              onClick={onExport}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full glass-soft px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-fg-muted)] transition-all duration-200 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            >
              <Download size={11} />
              Export.py
            </button>
          )}

          {/* status indicator */}
          <span className="hidden md:flex items-center gap-2 pl-2 ml-2 border-l border-[var(--color-border)]">
            {live ? (
              <span className="scope-line w-10" aria-hidden />
            ) : (
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  status === "error"
                    ? "bg-[var(--color-down)]"
                    : "bg-[var(--color-up)]",
                )}
              />
            )}
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-fg-muted)]">
              {live ? "working" : status === "error" ? "error" : "ready"}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}

function eyebrowLabelFromView(view: View): string {
  switch (view) {
    case "chat":    return "Describe a strategy";
    case "results": return "Results";
    case "code":    return "Code";
    case "library": return "Library";
  }
}
