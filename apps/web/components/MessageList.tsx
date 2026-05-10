"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMsg } from "@/lib/types";

type Props = {
  messages: ChatMsg[];
  thinking?: boolean;
};

export function MessageList({ messages, thinking }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking]);

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} msg={m} />
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
