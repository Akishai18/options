"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { suggestSlash, type SlashSpec } from "@/lib/slashCommands";

type Props = {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Quick-pick chips rendered above the composer (slash commands or examples). */
  quickChips?: { label: string; insert: string }[];
};

const DEFAULT_CHIPS: { label: string; insert: string }[] = [
  { label: "Add ATR vol filter", insert: "Add an ATR-based volatility filter so we only enter when ATR is below its 60-day median." },
  { label: "Tighten stop to 2.5%", insert: "Tighten the stop loss to 2.5%." },
  { label: "Compare with v3", insert: "/compare v3 v4" },
  { label: "Walk-forward 6mo", insert: "Run walk-forward with 6-month rolling windows." },
];

export function Composer({ onSubmit, disabled, placeholder, quickChips }: Props) {
  const [value, setValue] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const chips = quickChips ?? DEFAULT_CHIPS;
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
    requestAnimationFrame(() => ref.current?.focus());
  }

  function applyChip(text: string) {
    setValue(text);
    requestAnimationFrame(() => {
      ref.current?.focus();
      // Move cursor to end of inserted text.
      const len = text.length;
      ref.current?.setSelectionRange(len, len);
    });
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
      {/* Slash autocomplete — pops above the composer */}
      {showAutocomplete && (
        <div
          role="listbox"
          className="absolute bottom-full mb-2 left-0 right-0 z-30 overflow-hidden rounded-xl glass-strong"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
            slash commands · <kbd>↹</kbd> insert · <kbd>↵</kbd> send
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
                  <span className="text-[var(--color-accent)] mr-1">/</span>
                  <span className="font-mono text-[12.5px] text-[var(--color-fg)]">
                    {s.name}
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

      {/* Quick-pick chips */}
      {chips.length > 0 && !showAutocomplete && (
        <div className="mb-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => applyChip(c.insert)}
              className="glass-soft rounded-full px-3 py-1 font-mono text-[10.5px] tracking-tight text-[var(--color-fg-muted)] transition-all duration-200 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] card-lift"
            >
              <span className="mr-1 text-[var(--color-accent)]/70">/</span>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Composer body — glass with stronger blur */}
      <div
        className={cn(
          "relative rounded-2xl glass transition-all",
          "focus-within:ring-2 focus-within:ring-[var(--color-accent)]/30",
          disabled && "opacity-60",
        )}
      >
        <div className="flex items-start gap-3 p-4 pr-14">
          <Sparkles
            size={14}
            className="mt-1 shrink-0 text-[var(--color-accent)]"
            strokeWidth={1.6}
          />
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            rows={2}
            placeholder={
              placeholder ?? "Describe a strategy, or type / for commands…"
            }
            className="flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)] focus:outline-none min-h-[44px] max-h-[180px]"
          />
        </div>
        <button
          type="button"
          onClick={() => submit()}
          disabled={disabled || value.trim().length === 0}
          aria-label="Send"
          className={cn(
            "absolute right-3 top-3 grid size-9 place-items-center rounded-xl transition-all duration-200",
            value.trim().length > 0 && !disabled
              ? "bg-[var(--color-accent)] text-[var(--color-bg)] hover:brightness-110 shadow-[0_0_24px_-4px_var(--color-accent),inset_0_1px_0_0_oklch(1_0_0/0.3)]"
              : "bg-[oklch(1_0_0/0.05)] text-[var(--color-fg-faint)] border border-[var(--color-border)]",
          )}
        >
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex gap-4 font-mono text-[10px] text-[var(--color-fg-muted)] opacity-80">
            <span><kbd>⏎</kbd> to send</span>
            <span><kbd>⇧⏎</kbd> for newline</span>
            <span><kbd>/</kbd> for commands</span>
          </div>
          <span className="font-mono text-[10px] text-[var(--color-fg-faint)]">
            stratlab-engine v1.4.2
          </span>
        </div>
      </div>
    </div>
  );
}
