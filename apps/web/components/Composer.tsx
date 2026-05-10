"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Slash } from "lucide-react";
import { cn } from "@/lib/utils";
import { suggestSlash, type SlashSpec } from "@/lib/slashCommands";

type Props = {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function Composer({ onSubmit, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo<SlashSpec[]>(() => suggestSlash(value), [value]);
  const showAutocomplete = suggestions.length > 0 && value.startsWith("/");

  useEffect(() => {
    setHighlightIdx(0);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  function submit(text?: string) {
    const trimmed = (text ?? value).trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function applySuggestion(s: SlashSpec) {
    const filled = `/${s.name}${s.args ? " " + s.args : ""}`;
    setValue(filled);
    // Defer focus so the new value gets rendered first.
    requestAnimationFrame(() => ref.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showAutocomplete) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        applySuggestion(suggestions[highlightIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setValue("");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative">
      {showAutocomplete && (
        <div
          role="listbox"
          className={cn(
            "absolute bottom-full mb-2 left-0 right-0 z-30 overflow-hidden rounded-md border",
            "border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl",
          )}
        >
          <div className="border-b border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
            slash commands · ↹ to insert · ↵ to send
          </div>
          <ul>
            {suggestions.map((s, i) => (
              <li key={s.name}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={cn(
                    "flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors",
                    i === highlightIdx
                      ? "bg-[var(--color-accent-soft)]"
                      : "hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <Slash size={11} className="text-[var(--color-accent)]" />
                  <span className="font-mono text-[12.5px] text-[var(--color-fg)]">
                    /{s.name}
                  </span>
                  {s.args && (
                    <span className="font-mono text-[11px] text-[var(--color-fg-faint)]">
                      {s.args}
                    </span>
                  )}
                  <span className="ml-auto text-[11.5px] text-[var(--color-fg-muted)]">
                    {s.hint}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          placeholder={
            placeholder ??
            "Describe a strategy, or type / for commands…"
          }
          className={cn(
            "w-full resize-none bg-transparent px-4 py-3 pr-14",
            "text-[14px] leading-[1.55] text-[var(--color-fg)]",
            "placeholder:text-[var(--color-fg-faint)] focus:outline-none",
            "min-h-[52px] max-h-[180px]",
          )}
        />
        <button
          type="button"
          onClick={() => submit()}
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
            ⏎ to send · ⇧⏎ for newline · / for commands
          </span>
          <span className="font-mono text-[10.5px] text-[var(--color-fg-faint)]">
            gemini-2.5-flash
          </span>
        </div>
      </div>
    </div>
  );
}
