"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMsg } from "@/lib/types";

type Props = {
  messages: ChatMsg[];
  thinking?: boolean;
  onViewResults?: () => void;
};

export function MessageList({ messages, thinking, onViewResults }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking]);

  // Find the latest backtest event so only the freshest one shows the CTA.
  let latestBacktestEventId: string | null = null;
  for (const m of messages) {
    if (m.role === "event" && m.meta?.backtestId) {
      latestBacktestEventId = m.id;
    }
  }

  return (
    <div className="flex flex-col gap-3 px-6 py-6">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          msg={m}
          showResultsCta={m.id === latestBacktestEventId}
          onViewResults={onViewResults}
        />
      ))}
      {thinking && (
        <div className="flex items-center gap-2 pl-1">
          <span className="h-1 w-1 rounded-full bg-[var(--color-accent)]" />
          <span className="eyebrow text-[10px]">stratlab</span>
          <span className="font-mono text-[12.5px] text-[var(--color-fg-muted)] cursor-blink" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
