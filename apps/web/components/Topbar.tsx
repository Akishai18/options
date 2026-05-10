"use client";

import { cn } from "@/lib/utils";

type Props = {
  strategyName?: string | null;
  versionLabel?: string | null;
  status: "idle" | "thinking" | "running" | "critiquing" | "ready" | "error";
};

const statusCopy: Record<Props["status"], string> = {
  idle: "ready",
  thinking: "parsing strategy",
  running: "running backtest",
  critiquing: "generating critique",
  ready: "ready",
  error: "error",
};

export function Topbar({ strategyName, versionLabel, status }: Props) {
  const live = status === "thinking" || status === "running" || status === "critiquing";
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/70 backdrop-blur">
      <div className="flex items-center px-6 h-14 gap-6">
        {/* wordmark */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[15px] font-medium tracking-[0.18em] text-[var(--color-fg)]">
            STRATLAB
          </span>
          <span className="serif-italic text-[13px] text-[var(--color-fg-faint)]">
            workbench
          </span>
        </div>

        {/* divider */}
        <span className="h-4 w-px bg-[var(--color-border)]" />

        {/* status line — terminal-ish breadcrumb */}
        <div className="flex items-center gap-3 font-mono text-[12px] text-[var(--color-fg-muted)] min-w-0">
          {strategyName ? (
            <>
              <span className="truncate text-[var(--color-fg)]">{strategyName}</span>
              {versionLabel && (
                <>
                  <span className="text-[var(--color-fg-faint)]">/</span>
                  <span className="text-[var(--color-fg-muted)]">{versionLabel}</span>
                </>
              )}
            </>
          ) : (
            <span className="text-[var(--color-fg-faint)]">
              no strategy yet — describe one to begin
            </span>
          )}
        </div>

        {/* spacer */}
        <div className="ml-auto" />

        {/* live status indicator */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status === "error" && "bg-[var(--color-down)]",
              status === "ready" || status === "idle"
                ? "bg-[var(--color-up)]"
                : null,
              live && "bg-[var(--color-accent)] animate-pulse",
            )}
          />
          <span className="eyebrow text-[10.5px]">{statusCopy[status]}</span>
        </div>
      </div>
    </header>
  );
}
