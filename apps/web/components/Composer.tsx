"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function Composer({ onSubmit, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Autosize the textarea up to ~6 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div
      className={cn(
        "relative rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]",
        "focus-within:border-[var(--color-border-strong)] transition-colors",
        disabled && "opacity-60",
      )}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={1}
        placeholder={placeholder ?? "Describe a strategy — e.g. 20/50 EMA crossover on BTC daily…"}
        className={cn(
          "w-full resize-none bg-transparent px-4 py-3 pr-14",
          "text-[14px] leading-[1.55] text-[var(--color-fg)]",
          "placeholder:text-[var(--color-fg-faint)] focus:outline-none",
          "min-h-[52px] max-h-[180px]",
        )}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        className={cn(
          "absolute right-2 bottom-2 grid place-items-center",
          "h-8 w-8 rounded transition-colors",
          value.trim().length > 0 && !disabled
            ? "bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-strong)]"
            : "bg-[var(--color-surface-2)] text-[var(--color-fg-faint)]",
        )}
        aria-label="Run"
      >
        <ArrowUp size={14} strokeWidth={2.5} />
      </button>
      <div className="flex items-center justify-between px-4 pb-2 pt-0">
        <span className="font-mono text-[10.5px] text-[var(--color-fg-faint)]">
          ⏎ to send · ⇧⏎ for newline
        </span>
        <span className="font-mono text-[10.5px] text-[var(--color-fg-faint)]">
          gemini-2.5-flash
        </span>
      </div>
    </div>
  );
}
