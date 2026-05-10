"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Topbar } from "./Topbar";
import { Sidebar, type View } from "./Sidebar";
import { ChatView } from "./ChatView";
import { Dashboard } from "./Dashboard";
import { CodeView } from "./CodeView";
import { LibraryView } from "./LibraryView";
import { CompareView } from "./CompareView";
import { VersionTimeline, type VersionEntry } from "./VersionTimeline";
import { chatTurn, streamCritique, ApiError } from "@/lib/api";
import { parseCompareArgs, parseSlash, SLASH_SPECS } from "@/lib/slashCommands";
import type { ChatMsg, StrategySchema } from "@/lib/types";

type Status = "idle" | "thinking" | "running" | "critiquing" | "ready" | "error";

let _msgId = 0;
const newId = () => `m${++_msgId}`;

export function Workbench() {
  const [view, setView] = useState<View>("chat");
  const [resultsViewedAt, setResultsViewedAt] = useState<number>(0);
  const [resultsReadyAt, setResultsReadyAt] = useState<number>(0);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [versionCounter, setVersionCounter] = useState(0);

  // Per-version state — we keep all backtested versions, not just the latest.
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  // Per-version critiques live in their own map so switching versions doesn't
  // wipe a fetched critique.
  const [critiqueByVersion, setCritiqueByVersion] = useState<Record<string, string>>({});
  // Track which version's critique is currently fetching, so the dashboard
  // shimmer reflects the active card's state, not a global one.
  const [critiqueLoadingFor, setCritiqueLoadingFor] = useState<string | null>(null);

  // Per-version strategy snapshot — Code view should reflect the active version.
  const [schemaByVersion, setSchemaByVersion] = useState<Record<string, StrategySchema>>({});

  const [status, setStatus] = useState<Status>("idle");

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId) ?? null,
    [versions, activeVersionId],
  );
  const compareVersion = useMemo(
    () => (compareVersionId ? versions.find((v) => v.id === compareVersionId) ?? null : null),
    [versions, compareVersionId],
  );

  const hasFreshResults = !!activeVersion && resultsReadyAt > resultsViewedAt;

  const goToView = useCallback((v: View) => {
    setView(v);
    if (v === "results") setResultsViewedAt(Date.now());
  }, []);

  // Keyboard shortcuts: ⌘1–⌘4 to switch views.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const map: Record<string, View> = {
        "1": "chat",
        "2": "results",
        "3": "code",
        "4": "library",
      };
      const target = map[e.key];
      if (!target) return;
      const hasStrategy = activeVersion != null;
      if ((target === "results" || target === "code") && !hasStrategy) return;
      e.preventDefault();
      goToView(target);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeVersion, goToView]);

  const handleSubmit = useCallback(
    async (text: string) => {
      // Slash commands are intercepted client-side — never sent to the LLM.
      const slash = parseSlash(text);
      if (slash) {
        setMessages((m) => [
          ...m,
          { id: newId(), role: "user", content: text },
        ]);
        const reply = (content: string) =>
          setMessages((m) => [
            ...m,
            { id: newId(), role: "event", content },
          ]);
        switch (slash.kind) {
          case "help": {
            const lines = SLASH_SPECS.map(
              (s) => `/${s.name}${s.args ? " " + s.args : ""} — ${s.hint}`,
            ).join("\n");
            setMessages((m) => [
              ...m,
              { id: newId(), role: "assistant", content: lines },
            ]);
            return;
          }
          case "results":
            if (!activeVersion) {
              reply("no results yet — describe a strategy first");
              return;
            }
            goToView("results");
            reply("opened results");
            return;
          case "chat":
            goToView("chat");
            return;
          case "export":
            if (!activeVersion) {
              reply("no strategy to export — describe one first");
              return;
            }
            goToView("code");
            reply("opened code export");
            return;
          case "clear":
            setMessages([]);
            setVersions([]);
            setActiveVersionId(null);
            setCompareVersionId(null);
            setCritiqueByVersion({});
            setSchemaByVersion({});
            setStrategyId(null);
            setVersionCounter(0);
            setStatus("idle");
            return;
          case "compare": {
            const args = parseCompareArgs(slash.args);
            if (!args) {
              reply("usage: /compare v2 v3");
              return;
            }
            const a = versions.find((v) => v.label === args[0]);
            const b = versions.find((v) => v.label === args[1]);
            if (!a || !b) {
              reply(
                `couldn't find ${[args[0], args[1]].filter((l) => !versions.find((v) => v.label === l)).join(" and ")}`,
              );
              return;
            }
            setActiveVersionId(a.id);
            setCompareVersionId(b.id);
            goToView("results");
            reply(`comparing ${a.label} vs ${b.label}`);
            return;
          }
        }
      }

      setMessages((m) => [...m, { id: newId(), role: "user", content: text }]);
      setStatus("thinking");

      try {
        const turn = await chatTurn({
          message: text,
          strategy_id: strategyId ?? undefined,
        });

        if (turn.mode === "clarification") {
          setMessages((m) => [
            ...m,
            {
              id: newId(),
              role: "assistant",
              content:
                turn.clarification_question ??
                "I need a bit more detail to build that.",
            },
          ]);
          setStatus("ready");
          return;
        }

        if (turn.strategy_id) setStrategyId(turn.strategy_id);

        const nextVersion = versionCounter + 1;
        setVersionCounter(nextVersion);
        const versionLabel = `v${nextVersion}`;

        if (turn.explanation) {
          setMessages((m) => [
            ...m,
            { id: newId(), role: "assistant", content: turn.explanation },
          ]);
        }

        const bt = turn.backtest;
        if (!bt || bt.status !== "completed" || !bt.result) {
          setMessages((m) => [
            ...m,
            {
              id: newId(),
              role: "event",
              content: `backtest failed — ${bt?.error ?? "unknown error"}`,
            },
          ]);
          setStatus("error");
          return;
        }

        setStatus("running");

        const versionId = `ver-${nextVersion}-${Date.now()}`;
        const newEntry: VersionEntry = {
          id: versionId,
          label: versionLabel,
          prompt: text,
          result: bt.result,
          asset: turn.strategy?.data?.asset ?? null,
          timeframe: turn.strategy?.data?.timeframe ?? null,
          createdAt: Date.now(),
          serverVersionId: turn.version_id ?? null,
        };
        setVersions((vs) => [...vs, newEntry]);
        setActiveVersionId(versionId);
        setResultsReadyAt(Date.now());
        if (turn.strategy) {
          setSchemaByVersion((m) => ({ ...m, [versionId]: turn.strategy! }));
        }

        const m = bt.result.metrics_full;
        setMessages((mm) => [
          ...mm,
          {
            id: newId(),
            role: "event",
            content: `${versionLabel} — ${m.num_trades} trades · Sharpe ${m.sharpe.toFixed(2)} · return ${(m.total_return * 100).toFixed(1)}%`,
            meta: {
              versionLabel,
              backtestId: bt.backtest_id,
              sharpe: m.sharpe,
              totalReturn: m.total_return,
            },
          },
        ]);

        setStatus("critiquing");
        setCritiqueLoadingFor(versionId);
        // Stream the critique progressively. The dashboard's CritiqueCard
        // reads from critiqueByVersion[versionId] and animates as text grows.
        await new Promise<void>((resolve) => {
          streamCritique(bt.backtest_id, {
            onChunk: (text) =>
              setCritiqueByVersion((c) => ({
                ...c,
                [versionId]: (c[versionId] ?? "") + text,
              })),
            onDone: () => {
              setStatus("ready");
              setCritiqueLoadingFor((id) => (id === versionId ? null : id));
              resolve();
            },
            onError: (err) => {
              setMessages((mm) => [
                ...mm,
                { id: newId(), role: "event", content: `critique failed — ${err}` },
              ]);
              setStatus("ready");
              setCritiqueLoadingFor((id) => (id === versionId ? null : id));
              resolve();
            },
          });
        });
      } catch (e) {
        const detail = e instanceof ApiError ? e.message : String(e);
        setMessages((m) => [
          ...m,
          { id: newId(), role: "event", content: `error — ${detail}` },
        ]);
        setStatus("error");
      }
    },
    [strategyId, versionCounter, activeVersion, versions, goToView],
  );

  const isBusy = status === "thinking" || status === "running";
  const latestVersion = versions[versions.length - 1] ?? null;
  const viewingOlder =
    activeVersion != null && latestVersion != null && activeVersion.id !== latestVersion.id;

  // Topbar reflects the ACTIVE version (not necessarily the latest).
  const headerStrategyName = activeVersion?.result.schema_name ?? null;
  const headerAsset = activeVersion?.asset ?? null;
  const headerTimeframe = activeVersion?.timeframe ?? null;
  const headerVersionLabel = activeVersion?.label ?? null;

  const activeCritique = activeVersion ? critiqueByVersion[activeVersion.id] ?? null : null;
  const activeCritiqueLoading = activeVersion?.id === critiqueLoadingFor;
  const activeSchema = activeVersion ? schemaByVersion[activeVersion.id] ?? null : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        active={view}
        onSelect={goToView}
        hasResults={!!activeVersion}
        hasFreshResults={hasFreshResults}
        hasStrategy={!!activeVersion}
        status={status}
      />
      <div className="flex flex-1 flex-col overflow-hidden pb-[58px] md:pb-0">
        <Topbar
          view={view}
          strategyName={headerStrategyName}
          versionLabel={headerVersionLabel}
          asset={headerAsset}
          timeframe={headerTimeframe}
          status={status}
          viewingOlder={viewingOlder}
        />
        <main className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
              className="absolute inset-0 flex flex-col"
            >
              {view === "chat" && (
                <ChatView
                  messages={messages}
                  thinking={isBusy}
                  busy={isBusy}
                  hasStrategy={!!activeVersion}
                  onSubmit={handleSubmit}
                  onViewResults={() => goToView("results")}
                />
              )}
              {view === "results" && (
                <>
                  {versions.length > 1 && (
                    <VersionTimeline
                      versions={versions}
                      activeId={activeVersionId}
                      compareId={compareVersionId}
                      onSelect={(id) => {
                        setActiveVersionId(id);
                        setCompareVersionId(null);
                      }}
                      onCompare={(id) =>
                        setCompareVersionId((cur) => (cur === id ? null : id))
                      }
                    />
                  )}
                  <div className="flex-1 overflow-hidden">
                    {activeVersion && compareVersion ? (
                      <CompareView
                        a={activeVersion}
                        b={compareVersion}
                        onExit={() => setCompareVersionId(null)}
                      />
                    ) : (
                      <Dashboard
                        result={activeVersion?.result ?? null}
                        asset={headerAsset}
                        timeframe={headerTimeframe}
                        critique={activeCritique}
                        critiqueLoading={activeCritiqueLoading}
                        loading={status === "running" && !activeVersion}
                      />
                    )}
                  </div>
                </>
              )}
              {view === "code" && (
                <CodeView
                  strategy={activeSchema}
                  strategyName={headerStrategyName}
                  versionLabel={headerVersionLabel}
                  strategyId={strategyId}
                  versionId={activeVersion?.serverVersionId ?? null}
                />
              )}
              {view === "library" && <LibraryView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
