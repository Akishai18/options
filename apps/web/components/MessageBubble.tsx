"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { ChatMsg } from "@/lib/types";

type Props = { msg: ChatMsg };

export function MessageBubble({ msg }: Props) {
  if (msg.role === "event") {
    return <EventMessage msg={msg} />;
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
          "max-w-[85%] text-[13.5px] leading-[1.55]",
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

function EventMessage({ msg }: { msg: ChatMsg }) {
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
