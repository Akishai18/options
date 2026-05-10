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
    // A backtest-completion event becomes a prominent card with a "View results" CTA.
    if (msg.meta?.backtestId) {
      return (
        <ResultEvent msg={msg} fresh={!!showResultsCta} onView={onViewResults} />
      );
    }
    return <EventLine msg={msg} />;
  }
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] text-[14px] leading-[1.6]",
          isUser
            ? "rounded-md bg-[var(--color-surface-2)] px-3.5 py-2.5 text-[var(--color-fg)]"
            : "px-1 py-1 text-[var(--color-fg)]",
        )}
      >
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-[var(--color-accent)]" />
            <span className="eyebrow text-[10px]">stratlab</span>
          </div>
        )}
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
      className="flex items-center gap-3 py-1"
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
      <div className="relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        {fresh && (
          <span className="absolute left-0 top-0 h-full w-0.5 bg-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent)]" />
        )}
        <div className="flex items-start gap-4 px-5 py-4">
          <div className="flex flex-col items-center pt-0.5">
            <div className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)]">
              <span className="font-mono text-[10.5px] font-medium tracking-wider text-[var(--color-accent)]">
                {version.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex-1">
            <p className="eyebrow mb-1.5">backtest complete</p>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
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
              <span className="font-mono text-[11px] text-[var(--color-fg-faint)]">
                · {msg.content.split("—")[1]?.trim() ?? msg.content}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onView}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11.5px] transition-all",
              "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]",
              "hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)]",
            )}
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
      <span className="eyebrow text-[9.5px]">{label}</span>
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
