"use client";

import { useCallback, useState } from "react";
import { Topbar } from "./Topbar";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { EmptyChat } from "./EmptyChat";
import { Dashboard } from "./Dashboard";
import { chatTurn, getCritique, ApiError } from "@/lib/api";
import type { BacktestResult, ChatMsg } from "@/lib/types";

type Status = "idle" | "thinking" | "running" | "critiquing" | "ready" | "error";

let _msgId = 0;
const newId = () => `m${++_msgId}`;

export function Workbench() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [strategyName, setStrategyName] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState<string | null>(null);
  const [versionCounter, setVersionCounter] = useState(0);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [asset, setAsset] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string | null>(null);
  const [critique, setCritique] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = useCallback(
    async (text: string) => {
      // 1. push the user message immediately
      setMessages((m) => [...m, { id: newId(), role: "user", content: text }]);
      setStatus("thinking");
      setCritique(null);

      try {
        // 2. parse + backtest in one round-trip
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

        // strategy + backtest path
        if (turn.strategy?.name) setStrategyName(turn.strategy.name);
        if (turn.strategy?.data?.asset) setAsset(turn.strategy.data.asset);
        if (turn.strategy?.data?.timeframe) setTimeframe(turn.strategy.data.timeframe);
        if (turn.strategy_id) setStrategyId(turn.strategy_id);

        const nextVersion = versionCounter + 1;
        setVersionCounter(nextVersion);
        setVersionLabel(`v${nextVersion}`);

        // assistant explanation message
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

        // Render dashboard
        setStatus("running"); // brief flash
        setResult(bt.result);

        // Event message in chat: gives the user a chronological breadcrumb
        const m = bt.result.metrics_full;
        setMessages((mm) => [
          ...mm,
          {
            id: newId(),
            role: "event",
            content: `v${nextVersion} — ${m.num_trades} trades · Sharpe ${m.sharpe.toFixed(2)} · return ${(m.total_return * 100).toFixed(1)}%`,
            meta: {
              versionLabel: `v${nextVersion}`,
              backtestId: bt.backtest_id,
              sharpe: m.sharpe,
              totalReturn: m.total_return,
            },
          },
        ]);

        // 3. critique (separate call so the dashboard renders before the LLM finishes)
        setStatus("critiquing");
        try {
          const crit = await getCritique(bt.backtest_id);
          setCritique(crit.text);
          setStatus("ready");
        } catch (e) {
          const detail = e instanceof ApiError ? e.message : String(e);
          setMessages((mm) => [
            ...mm,
            { id: newId(), role: "event", content: `critique failed — ${detail}` },
          ]);
          setStatus("ready");
        }
      } catch (e) {
        const detail = e instanceof ApiError ? e.message : String(e);
        setMessages((m) => [
          ...m,
          { id: newId(), role: "event", content: `error — ${detail}` },
        ]);
        setStatus("error");
      }
    },
    [strategyId, versionCounter],
  );

  const isBusy = status === "thinking" || status === "running";

  return (
    <div className="flex h-screen flex-col">
      <Topbar
        strategyName={strategyName}
        versionLabel={versionLabel}
        status={status}
      />
      <div className="grid flex-1 overflow-hidden grid-cols-[minmax(380px,460px)_1fr]">
        {/* chat pane */}
        <aside className="flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <EmptyChat onPick={(p) => handleSubmit(p)} />
            ) : (
              <MessageList messages={messages} thinking={isBusy} />
            )}
          </div>
          <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <Composer
              onSubmit={handleSubmit}
              disabled={isBusy}
              placeholder={
                strategyId
                  ? "Refine the strategy — e.g. tighten the stop, add a vol filter…"
                  : undefined
              }
            />
          </div>
        </aside>

        {/* dashboard pane */}
        <main className="h-full overflow-hidden">
          <Dashboard
            result={result}
            asset={asset}
            timeframe={timeframe}
            critique={critique}
            critiqueLoading={status === "critiquing"}
            loading={status === "running" && !result}
          />
        </main>
      </div>
    </div>
  );
}
