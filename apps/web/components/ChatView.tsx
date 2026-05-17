"use client";

import { motion } from "motion/react";
import { EmptyChat } from "./EmptyChat";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import type { ChatMsg } from "@/lib/types";

type Props = {
  messages: ChatMsg[];
  thinking: boolean;
  busy: boolean;
  hasStrategy: boolean;
  onSubmit: (text: string) => void;
  onViewResults: () => void;
};

export function ChatView({
  messages,
  thinking,
  busy,
  hasStrategy,
  onSubmit,
  onViewResults,
}: Props) {
  const isEmpty = messages.length === 0;

  /* Empty state: editorial cover spread. Wider container so the headline
   * and methodology grid fill the workbench, not a narrow center column.
   * Composer sticks to the bottom of the spread. */
  if (isEmpty) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-8 pb-4 md:px-10 md:pt-12">
          <EmptyChat onPick={onSubmit} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="sticky bottom-0 border-t border-[var(--color-border)] bg-[var(--color-bg)]/90 px-4 py-3 backdrop-blur md:px-10 md:py-4"
        >
          <div className="mx-auto w-full max-w-[1180px]">
            <Composer onSubmit={onSubmit} disabled={busy} />
          </div>
        </motion.div>
      </div>
    );
  }

  /* Active conversation: tighter column, messages scroll, composer sticks. */
  return (
    <div className="mx-auto flex h-full w-full max-w-[860px] flex-col">
      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          thinking={thinking}
          onViewResults={onViewResults}
        />
      </div>
      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 py-3 backdrop-blur md:px-6 md:py-4">
        <Composer
          onSubmit={onSubmit}
          disabled={busy}
          placeholder={
            hasStrategy
              ? "Refine the strategy — tighten the stop, add a vol filter…"
              : undefined
          }
        />
      </div>
    </div>
  );
}
