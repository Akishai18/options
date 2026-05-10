"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Copy, Check, Download, FileJson, FileText, FileCode2 } from "lucide-react";
import { SectionLabel } from "./SectionLabel";
import { ApiError, getExportBundle } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { StrategySchema } from "@/lib/types";

type Props = {
  strategy: StrategySchema | null;
  strategyName: string | null;
  versionLabel: string | null;
  strategyId: string | null;
  versionId: string | null;
};

type Tab = "strategy.py" | "requirements.txt" | "README.md" | "spec.json";

const TAB_ICONS: Record<Tab, typeof FileCode2> = {
  "strategy.py": FileCode2,
  "requirements.txt": FileText,
  "README.md": FileText,
  "spec.json": FileJson,
};

const TAB_LANG: Record<Tab, string> = {
  "strategy.py": "python",
  "requirements.txt": "text",
  "README.md": "markdown",
  "spec.json": "json",
};

export function CodeView({
  strategy,
  strategyName,
  versionLabel,
  strategyId,
  versionId,
}: Props) {
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("strategy.py");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!strategyId || !versionId) {
      setFiles(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getExportBundle(strategyId, versionId)
      .then((b) => {
        if (cancelled) return;
        setFiles(b.files);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [strategyId, versionId]);

  if (!strategy) return <EmptyCode />;

  const specJson = JSON.stringify(strategy, null, 2);
  const allFiles: Record<string, string> = {
    ...(files ?? {}),
    "spec.json": specJson,
  };
  const tabs: Tab[] = ["strategy.py", "requirements.txt", "README.md", "spec.json"];
  const activeContent = allFiles[activeTab] ?? "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function download() {
    const blob = new Blob([activeContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeTab;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="space-y-5 px-4 pt-5 md:px-7 md:pt-6">
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-4"
        >
          <div>
            <p className="eyebrow mb-1.5">code export</p>
            <h2 className="text-[20px] font-medium tracking-[-0.01em] text-[var(--color-fg)]">
              {strategyName ?? strategy.name}
              {versionLabel && (
                <span className="serif-italic ml-2 text-[var(--color-fg-muted)]">
                  — {versionLabel}
                </span>
              )}
            </h2>
            <p className="mt-1 max-w-[64ch] text-[12.5px] leading-[1.55] text-[var(--color-fg-muted)]">
              A self-contained Python script that reproduces this backtest.
              Depends only on ccxt + numpy + pandas — no StratLab dependency.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-[11.5px] transition-colors",
                copied
                  ? "border-[var(--color-up)] text-[var(--color-up)]"
                  : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]",
              )}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "copied" : "copy"}
            </button>
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded border border-[var(--color-border)] px-3 py-1.5 font-mono text-[11.5px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
            >
              <Download size={12} />
              download
            </button>
          </div>
        </motion.div>
      </div>

      <div className="flex-1 overflow-hidden px-4 pb-6 pt-4 md:px-7 md:pb-8 md:pt-5">
        <div className="flex h-full flex-col">
          {/* file tabs */}
          <div className="flex items-end gap-1 border-b border-[var(--color-border)]">
            {tabs.map((t) => {
              const Icon = TAB_ICONS[t];
              const isActive = t === activeTab;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={cn(
                    "group relative inline-flex items-center gap-1.5 rounded-t border border-b-0 px-3 py-2 font-mono text-[11.5px] transition-colors",
                    isActive
                      ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)]"
                      : "border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <Icon
                    size={12}
                    className={isActive ? "text-[var(--color-accent)]" : ""}
                  />
                  {t}
                  {isActive && (
                    <span className="absolute bottom-[-1px] left-0 right-0 h-px bg-[var(--color-surface)]" />
                  )}
                </button>
              );
            })}
            <span className="ml-auto px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-faint)]">
              {TAB_LANG[activeTab]}
            </span>
          </div>

          {/* file body */}
          <div className="flex-1 overflow-auto rounded-b rounded-tr border border-[var(--color-border)] bg-[var(--color-surface)]">
            {loading && activeTab !== "spec.json" ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-3 shimmer rounded"
                    style={{ width: `${60 + Math.random() * 35}%` }}
                  />
                ))}
              </div>
            ) : error && activeTab !== "spec.json" ? (
              <div className="p-5 font-mono text-[12px] text-[var(--color-down)]">
                export failed — {error}
              </div>
            ) : (
              <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-[1.6] text-[var(--color-fg)]">
                <code>{activeContent}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyCode() {
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[44ch] text-center"
      >
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
          <FileCode2 size={18} strokeWidth={1.4} className="text-[var(--color-fg-muted)]" />
        </div>
        <p className="eyebrow mb-3">no strategy yet</p>
        <p className="serif-italic text-[18px] leading-[1.4] text-[var(--color-fg-muted)]">
          Describe a strategy in chat. Once it backtests, this view will hand
          you a runnable Python script that reproduces the result.
        </p>
      </motion.div>
    </div>
  );
}
