"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  MessageSquare,
  BarChart3,
  Code2,
  BookOpen,
  History,
  LogOut,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { VersionEntry } from "./VersionTimeline";

export type View = "chat" | "results" | "code" | "library";

type Status = "idle" | "thinking" | "running" | "critiquing" | "ready" | "error";

type Props = {
  active: View;
  onSelect: (v: View) => void;
  hasResults: boolean;
  hasFreshResults: boolean;
  hasStrategy: boolean;
  status: Status;
  versions?: VersionEntry[];
  activeVersionId?: string | null;
  onSelectVersion?: (id: string) => void;
  onNewStrategy?: () => void;
};

type Item = {
  id: View;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const ITEMS: Item[] = [
  { id: "chat",    label: "Chat",    hint: "describe & iterate", icon: MessageSquare },
  { id: "results", label: "Results", hint: "metrics & charts",   icon: BarChart3 },
  { id: "code",    label: "Code",    hint: "strategy spec",      icon: Code2 },
  { id: "library", label: "Library", hint: "indicators",         icon: BookOpen },
];

function itemDisabled(id: View, hasStrategy: boolean): boolean {
  if (id === "results" || id === "code") return !hasStrategy;
  return false;
}

export function Sidebar(props: Props) {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileTabBar {...props} />
    </>
  );
}

function DesktopSidebar({
  active,
  onSelect,
  hasResults,
  hasFreshResults,
  hasStrategy,
  status,
  versions = [],
  activeVersionId,
  onSelectVersion,
  onNewStrategy,
}: Props) {
  const live =
    status === "thinking" || status === "running" || status === "critiquing";
  const ready = status === "ready" || status === "idle";

  return (
    <nav className="hidden md:flex h-full w-[256px] shrink-0 flex-col border-r border-[var(--color-border)] glass-soft">
      {/* wordmark */}
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-baseline justify-between">
          <h1 className="font-mono text-[13px] font-medium tracking-[0.25em] text-[var(--color-fg)]">
            STRATLAB
          </h1>
          <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-fg-faint)]">
            V1
          </span>
        </div>
        <p className="serif-italic mt-2 text-[14px] text-[var(--color-fg-muted)]">
          the research workbench
        </p>
      </div>

      {/* workspace nav */}
      <div className="px-4">
        <p className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[var(--color-fg-muted)] opacity-80 px-2 mb-2">
          Workspace
        </p>
        <ul className="space-y-0.5">
          {ITEMS.map((it) => {
            const isActive = active === it.id;
            const disabled = itemDisabled(it.id, hasStrategy);
            const showFresh = it.id === "results" && hasFreshResults && !isActive;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => !disabled && onSelect(it.id)}
                  disabled={disabled}
                  className={cn(
                    "group relative flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-all duration-200",
                    isActive
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] ring-1 ring-[var(--color-accent)]/30 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)]"
                      : disabled
                        ? "text-[var(--color-fg-faint)] cursor-not-allowed"
                        : "text-[var(--color-fg-muted)] hover:bg-[oklch(1_0_0/0.04)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <it.icon size={14} strokeWidth={1.6} />
                    <span className="text-[13px]">{it.label}</span>
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[9px] tracking-tight",
                      isActive ? "opacity-70" : "opacity-60",
                    )}
                  >
                    {it.hint}
                  </span>
                  {showFresh && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* history */}
      {versions.length > 0 && (
        <div className="px-4 mt-7 min-h-0 flex-1 flex flex-col">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.22em] uppercase text-[var(--color-fg-muted)] opacity-80">
              <History size={11} /> History
            </span>
            {onNewStrategy && (
              <button
                type="button"
                onClick={onNewStrategy}
                aria-label="New strategy"
                className="text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
          <ul className="space-y-0.5 overflow-y-auto pr-1">
            {[...versions].reverse().map((v) => {
              const isActive = v.id === activeVersionId;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onSelectVersion?.(v.id)}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-md border-l px-2 py-1 text-left transition-all duration-200",
                      "text-[11.5px] truncate",
                      isActive
                        ? "border-[var(--color-accent)]/60 bg-[var(--color-accent-soft)] text-[var(--color-fg)]"
                        : "border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[oklch(1_0_0/0.03)]",
                    )}
                  >
                    <span className="truncate">
                      {v.result.schema_name}
                    </span>
                    <span className="font-mono text-[9px] text-[var(--color-fg-faint)] ml-2 shrink-0">
                      {v.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* spacer when no history */}
      {versions.length === 0 && <div className="flex-1" />}

      {/* footer: status + model */}
      <div className="border-t border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center gap-2">
          {live ? (
            <span className="size-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          ) : (
            <span
              className={cn(
                "size-1.5 rounded-full",
                status === "error"
                  ? "bg-[var(--color-down)]"
                  : "bg-[var(--color-up)] pulse-dot",
              )}
            />
          )}
          <span
            className={cn(
              "font-mono text-[10px] tracking-[0.22em] uppercase",
              live
                ? "text-[var(--color-accent)]"
                : status === "error"
                  ? "text-[var(--color-down)]"
                  : "text-[var(--color-up)]",
            )}
          >
            {live ? "Working" : status === "error" ? "Error" : "Ready"}
          </span>
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-[var(--color-fg-muted)] opacity-80">
          gemini-2.5-flash · vectorized engine
        </p>
        {hasResults && (
          <p className="mt-1 font-mono text-[9.5px] text-[var(--color-fg-faint)]">
            backtest cached ·{" "}
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        <UserMenu />
      </div>
    </nav>
  );
}

function UserMenu() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    let cancelled = false;
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      });
    } catch {
      /* dev mode without Supabase configured */
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!email) return null;

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/sign-in";
  }

  return (
    <div className="mt-3 border-t border-[var(--color-border)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="truncate font-mono text-[10px] text-[var(--color-fg-muted)]"
          title={email}
        >
          {email}
        </span>
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="grid h-6 w-6 place-items-center rounded text-[var(--color-fg-faint)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
        >
          <LogOut size={11} />
        </button>
      </div>
    </div>
  );
}

/* Bottom tab bar for narrow viewports. */
function MobileTabBar({ active, onSelect, hasFreshResults, hasStrategy }: Props) {
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur">
      <ul className="grid grid-cols-4">
        {ITEMS.map((it) => {
          const isActive = active === it.id;
          const disabled = itemDisabled(it.id, hasStrategy);
          const showFresh = it.id === "results" && hasFreshResults && !isActive;
          return (
            <li key={it.id} className="contents">
              <button
                type="button"
                onClick={() => !disabled && onSelect(it.id)}
                disabled={disabled}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 px-1 py-2 transition-colors",
                  isActive
                    ? "text-[var(--color-accent)]"
                    : disabled
                      ? "text-[var(--color-fg-faint)] opacity-50"
                      : "text-[var(--color-fg-muted)]",
                )}
              >
                <it.icon size={18} strokeWidth={1.6} />
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em]">
                  {it.label}
                </span>
                {isActive && (
                  <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[var(--color-accent)]" />
                )}
                {showFresh && (
                  <span className="absolute right-3 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
