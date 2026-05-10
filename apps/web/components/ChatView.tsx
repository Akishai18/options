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

  // Empty state: hero composer centered like ChatGPT/Claude landing.
  if (isEmpty) {
    return (
      <div className="mx-auto flex h-full w-full max-w-[760px] flex-col px-4 md:px-6">
        <div className="flex flex-1 flex-col justify-center pt-6">
          <EmptyChat onPick={onSubmit} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="pb-6"
        >
          <Composer onSubmit={onSubmit} disabled={busy} />
        </motion.div>
      </div>
    );
  }

  // Active conversation: messages scroll, composer sticks to bottom.
  return (
    <div className="mx-auto flex h-full w-full max-w-[820px] flex-col">
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
