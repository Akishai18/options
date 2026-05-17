"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

type Props = { mode: Mode };

export function AuthCard({ mode }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useSearchParams();
  const next = search.get("next") ?? "/";

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    try {
      const fn =
        mode === "sign-in"
          ? supabase.auth.signInWithPassword
          : supabase.auth.signUp;
      const { error } = await fn.call(supabase.auth, {
        email,
        password,
        ...(mode === "sign-up"
          ? {
              options: {
                emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
              },
            }
          : {}),
      });
      if (error) {
        setError(error.message);
        return;
      }
      if (mode === "sign-up") {
        setMagicSent(true);
        return;
      }
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMagicLink() {
    if (!email) {
      setError("enter your email first");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setMagicSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (magicSent) {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)]">
            <Mail size={18} className="text-[var(--color-accent)]" />
          </div>
          <h1 className="text-[24px] tracking-[-0.01em] text-[var(--color-fg)]">
            Check your inbox.
          </h1>
          <p className="serif-italic mt-2 text-[15px] text-[var(--color-fg-muted)]">
            We sent a confirmation link to{" "}
            <span className="font-mono text-[13px] text-[var(--color-fg)]">{email}</span>.
          </p>
          <p className="mt-6 font-mono text-[11px] text-[var(--color-fg-faint)]">
            once you click it, you&apos;ll land back here, signed in.
          </p>
        </motion.div>
      </Shell>
    );
  }

  const otherMode: Mode = mode === "sign-in" ? "sign-up" : "sign-in";
  const otherLabel = mode === "sign-in" ? "create one" : "sign in instead";

  return (
    <Shell>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="eyebrow mb-3">{mode === "sign-in" ? "welcome back" : "create your workbench"}</p>
        <h1 className="mb-2 text-[28px] leading-[1.1] tracking-[-0.015em] text-[var(--color-fg)]">
          {mode === "sign-in" ? (
            <>
              Sign in to <span className="serif-italic text-[var(--color-fg-muted)]">StratLab</span>.
            </>
          ) : (
            <>
              Get a free <span className="serif-italic text-[var(--color-fg-muted)]">research seat</span>.
            </>
          )}
        </h1>
        <p className="text-[13px] leading-[1.5] text-[var(--color-fg-muted)]">
          {mode === "sign-in"
            ? "Email + password, or a one-time magic link."
            : "We email you a confirmation link. No card required."}
        </p>

        <form onSubmit={submitPassword} className="mt-7 space-y-4">
          <Field
            label="email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            label="password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={6}
            hint="6+ characters"
          />
          {error && (
            <p className="font-mono text-[11px] text-[var(--color-down)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "group inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3",
              "bg-[var(--color-accent)] text-[var(--color-bg)] font-mono text-[12px] uppercase tracking-[0.16em]",
              "shadow-[inset_0_1px_0_0_oklch(1_0_0/0.3),0_0_24px_-6px_var(--color-accent)]",
              "transition-all duration-200 hover:brightness-110",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {submitting ? "working…" : mode === "sign-in" ? "sign in" : "create account"}
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-faint)]">
            or
          </span>
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <button
          type="button"
          onClick={sendMagicLink}
          disabled={submitting}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3",
            "glass-soft text-[var(--color-fg)] font-mono text-[12px]",
            "transition-all duration-200 hover:bg-[oklch(1_0_0/0.08)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Mail size={13} />
          email me a magic link
        </button>

        <p className="mt-7 text-center text-[12px] text-[var(--color-fg-muted)]">
          {mode === "sign-in" ? "no account? " : "already have one? "}
          <Link
            href={`/${otherMode}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            {otherLabel}
          </Link>
        </p>
      </motion.div>
    </Shell>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  ...rest
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] text-[var(--color-fg-faint)]">{hint}</span>
        )}
      </div>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-xl glass-flat px-3.5 py-2.5",
          "text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-faint)]",
          "transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:bg-[oklch(1_0_0/0.06)]",
        )}
      />
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-12">
      {/* ambient backdrop — extended grid + soft amber wash, all CSS */}
      <AuthBackdrop />

      <div className="relative w-full max-w-[420px]">
        {/* Editorial wordmark — bigger Fraunces lockup over a phosphor rule */}
        <div className="mb-8 text-center">
          <div className="inline-flex flex-col items-center">
            <span className="font-mono text-[12.5px] font-medium tracking-[0.32em] text-[var(--color-fg)]">
              STRATLAB
            </span>
            <span className="relative mt-2 block h-px w-24">
              <span className="absolute inset-y-0 left-0 right-0 bg-[var(--color-border)]" />
              <span className="absolute inset-y-0 left-1/4 right-1/4 bg-[var(--color-accent)] phosphor-pulse" />
            </span>
            <span className="display-italic mt-3 text-[22px] text-[var(--color-fg-muted)]">
              the research workbench
            </span>
          </div>
        </div>
        <div className="glass rounded-3xl p-8 shadow-[0_24px_60px_-16px_oklch(0_0_0/0.6)]">
          {children}
        </div>
        <p className="serif-italic mt-6 text-center text-[13px] text-[var(--color-fg-faint)]">
          &ldquo;Backtests are easy to make look good and hard to trust.&rdquo;
        </p>
      </div>
    </div>
  );
}

function AuthBackdrop() {
  return (
    <>
      {/* Aurora orbs — matches workbench treatment, blurred for atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 18% 22%, oklch(0.6 0.16 215 / 0.22), transparent 65%), " +
            "radial-gradient(50% 45% at 82% 78%, oklch(0.65 0.14 195 / 0.18), transparent 65%), " +
            "radial-gradient(45% 40% at 50% 105%, oklch(0.55 0.18 250 / 0.16), transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      {/* faint equity-curve glyph — references the product without being heavy */}
      <svg
        aria-hidden
        viewBox="0 0 800 200"
        className="pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[min(900px,110%)] opacity-[0.06]"
        preserveAspectRatio="none"
      >
        <path
          d="M0,170 C100,150 180,130 260,135 C340,140 420,90 500,80 C580,70 660,55 740,30 L800,20"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
    </>
  );
}
