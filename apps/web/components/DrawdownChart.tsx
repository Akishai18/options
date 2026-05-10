"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pct } from "@/lib/utils";
import type { EquityPoint } from "@/lib/types";

type Props = {
  drawdown: EquityPoint[];
};

export function DrawdownChart({ drawdown }: Props) {
  const data = drawdown.map(([ts, v]) => ({
    ts: new Date(ts).getTime(),
    date: new Date(ts).toISOString().slice(0, 10),
    drawdown: v,
  }));
  if (data.length === 0) return null;

  return (
    <div className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-down)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--color-down)" stopOpacity="0.32" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            hide
          />
          <YAxis
            tick={{ fill: "var(--color-fg-subtle)", fontSize: 10 }}
            stroke="var(--color-border)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            width={44}
            domain={["dataMin", 0]}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-fg-faint)" }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const p = payload[0] as { value: number; payload: { date: string } };
              return (
                <div className="rounded border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-1.5 font-mono text-[11px]">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-fg-faint)]">
                    {p.payload.date}
                  </div>
                  <div className="tabular text-[var(--color-down)]">{pct(p.value)}</div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="var(--color-down)"
            strokeWidth={1}
            fill="url(#ddFill)"
            isAnimationActive
            animationDuration={750}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
