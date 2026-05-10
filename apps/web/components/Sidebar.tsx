"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  MessageSquare,
  BarChart3,
  Code2,
  BookOpen,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type View = "chat" | "results" | "code" | "library";

type Status = "idle" | "thinking" | "running" | "critiquing" | "ready" | "error";

type Props = {
  active: View;
  onSelect: (v: View) => void;
  hasResults: boolean;
  hasFreshResults: boolean;
  hasStrategy: boolean;
  status: Status;
};

type Item = {
  id: View;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const ITEMS: Item[] = [
  { id: "chat", label: "Chat", hint: "describe & iterate", icon: MessageSquare },
  { id: "results", label: "Results", hint: "metrics & charts", icon: BarChart3 },
  { id: "code", label: "Code", hint: "strategy spec", icon: Code2 },
  { id: "library", label: "Library", hint: "indicators", icon: BookOpen },
];

const statusCopy: Record<Status, string> = {
  idle: "ready",
  thinking: "parsing strategy",
  running: "running backtest",
  critiquing: "writing critique",
  ready: "ready",
  error: "error",
};

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
}: Props) {
  const live =
    status === "thinking" || status === "running" || status === "critiquing";
  return (
    <nav className="hidden md:flex h-full w-[232px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]/60 backdrop-blur">
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-6">
        <span className="font-mono text-[14px] font-medium tracking-[0.2em] text-[var(--color-fg)]">
          STRATLAB
        </span>
        <span className="serif-italic text-[12px] text-[var(--color-fg-faint)]">
          workbench
        </span>
      </div>

      <div className="px-3">
        <p className="eyebrow mb-2 px-2">workspace</p>
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
                    "group relative flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left transition-colors",
                    isActive
                      ? "bg-[var(--color-surface-2)] text-[var(--color-fg)]"
                      : disabled
                        ? "text-[var(--color-fg-faint)] cursor-not-allowed"
                        : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active-edge"
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[var(--color-accent)]"
                      transition={{ duration: 0.25 }}
                    />
                  )}
                  <it.icon
                    size={15}
                    strokeWidth={1.6}
                    className={cn(
                      isActive
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]",
                    )}
                  />
                  <span className="flex-1 text-[13px]">{it.label}</span>
                  <span className="font-mono text-[10px] text-[var(--color-fg-faint)]">
                    {it.hint}
                  </span>
                  {showFresh && (
                    <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex-1" />

      <div className="border-t border-[var(--color-border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status === "error"
                ? "bg-[var(--color-down)]"
                : live
                  ? "bg-[var(--color-accent)] animate-pulse"
                  : "bg-[var(--color-up)]",
            )}
          />
          <span className="eyebrow text-[10px]">{statusCopy[status]}</span>
        </div>
        <div className="mt-2 font-mono text-[10px] text-[var(--color-fg-faint)]">
          gemini-2.5-flash · vectorized engine
        </div>
        {hasResults && (
          <div className="mt-2 font-mono text-[10px] text-[var(--color-fg-faint)]">
            backtest cached · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
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
          className="truncate font-mono text-[10.5px] text-[var(--color-fg-muted)]"
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

/** Bottom tab bar for narrow viewports. Same nav, native-feeling on mobile. */
function MobileTabBar({
  active,
  onSelect,
  hasFreshResults,
  hasStrategy,
}: Props) {
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
