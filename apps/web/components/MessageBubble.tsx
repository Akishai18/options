"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { cn, num, pct } from "@/lib/utils";
import type { ChatMsg } from "@/lib/types";

type Props = {
  msg: ChatMsg;
  showResultsCta?: boolean;
  onViewResults?: () => void;
};

export function MessageBubble({ msg, showResultsCta, onViewResults }: Props) {
  if (msg.role === "event") {
    if (msg.meta?.backtestId) {
      return <ResultEvent msg={msg} fresh={!!showResultsCta} onView={onViewResults} />;
    }
    return <EventLine msg={msg} />;
  }

  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
      className="flex w-full gap-4"
    >
      {/* YOU / LAB column — editorial byline style */}
      <div
        className={cn(
          "shrink-0 w-12 pt-1 font-mono text-[10px] tracking-[0.22em] uppercase",
          isUser ? "text-[var(--color-fg-muted)]" : "text-[var(--color-accent)]",
        )}
      >
        {isUser ? "You" : "Lab"}
      </div>

      <div
        className={cn(
          "flex-1 border-l pl-4 text-[14px] leading-[1.6]",
          isUser
            ? "border-[var(--color-border)] text-[var(--color-fg)]"
            : "border-[var(--color-accent)]/30 text-[var(--color-fg-muted)]",
        )}
      >
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    </motion.div>
  );
}

function EventLine({ msg }: { msg: ChatMsg }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.32 }}
      className="flex items-center gap-3 py-1.5"
    >
      <span className="h-px flex-1 bg-[var(--color-border)]" />
      <span className="serif-italic text-[12.5px] text-[var(--color-fg-muted)]">
        {msg.content}
      </span>
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </motion.div>
  );
}

function ResultEvent({
  msg,
  fresh,
  onView,
}: {
  msg: ChatMsg;
  fresh: boolean;
  onView?: () => void;
}) {
  const sharpe = msg.meta?.sharpe;
  const totalReturn = msg.meta?.totalReturn;
  const version = msg.meta?.versionLabel ?? "v1";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
      className="my-2"
    >
      <div className="relative overflow-hidden rounded-2xl glass">
        {fresh && (
          <span className="absolute left-0 top-0 h-full w-0.5 bg-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent-soft)]" />
        )}
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg glass-flat-strong">
              <span className="font-mono text-[10.5px] font-medium tracking-wider text-[var(--color-accent)]">
                {version.toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
                backtest complete
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {sharpe != null && (
                  <Stat label="sharpe" value={num(sharpe)} accent={sharpe >= 1} />
                )}
                {totalReturn != null && (
                  <Stat
                    label="return"
                    value={pct(totalReturn)}
                    accent={totalReturn >= 0}
                  />
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onView}
            className="group ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]/40 px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-accent-strong)] shadow-[inset_0_1px_0_0_oklch(1_0_0/0.1)] transition-all duration-200 hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] hover:shadow-[0_0_24px_-6px_var(--color-accent)]"
          >
            view results
            <ArrowRight
              size={12}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--color-fg-faint)]">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-mono text-[14px]",
          accent ? "text-[var(--color-up)]" : "text-[var(--color-down)]",
        )}
      >
        {value}
      </span>
    </span>
  );
}
