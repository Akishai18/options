"use client";

import { motion } from "motion/react";

export function EmptyDashboard() {
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-[44ch] text-center"
      >
        <div className="mx-auto mb-6 grid place-items-center">
          <SkeletonChart />
        </div>
        <p className="eyebrow mb-3">awaiting first backtest</p>
        <p className="serif-italic text-[19px] leading-[1.4] text-[var(--color-fg-muted)]">
          Results render here — equity curve, in-sample / out-of-sample split, drawdown,
          and an AI critique grounded in the actual numbers.
        </p>
      </motion.div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <svg viewBox="0 0 360 100" className="w-[360px] max-w-full opacity-40">
      <defs>
        <linearGradient id="empty-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* faint horizontal rules */}
      {[20, 50, 80].map((y) => (
        <line key={y} x1="0" x2="360" y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="2 4" />
      ))}
      {/* meandering line */}
      <path
        d="M0,80 C30,60 60,75 90,55 C120,35 150,50 180,40 C210,30 240,55 270,30 C300,10 330,30 360,15"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M0,80 C30,60 60,75 90,55 C120,35 150,50 180,40 C210,30 240,55 270,30 C300,10 330,30 360,15 L360,100 L0,100 Z"
        fill="url(#empty-grad)"
      />
      {/* vertical OOS marker */}
      <line x1="270" x2="270" y1="0" y2="100" stroke="var(--color-accent)" strokeDasharray="3 3" opacity="0.5" />
    </svg>
  );
}
