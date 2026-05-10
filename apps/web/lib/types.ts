/* TypeScript shapes mirroring the backend's Pydantic models.
 * Kept loose where the engine emits structures we don't render directly
 * (e.g., the strategy schema's nested ExprNode tree). */

export type MetricsBlock = {
  label: string;
  bars: number;
  num_trades: number;
  total_return: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  win_rate: number;
  profit_factor: number;
  avg_trade_pnl: number;
  exposure: number;
};

export type TradeRecord = {
  entry_ts: string;
  exit_ts: string;
  side: "long" | "short" | "both";
  entry_price: number;
  exit_price: number;
  size: number;
  pnl: number;
  return_pct: number;
  bars_held: number;
  exit_reason: "signal" | "stop_loss" | "take_profit" | "end_of_data";
};

export type EquityPoint = [string, number]; // [iso_ts, value]

export type BacktestResult = {
  schema_name: string;
  schema_hash: string;
  ran_at: string;
  equity_curve: EquityPoint[];
  benchmark_curve: EquityPoint[];
  drawdown_curve: EquityPoint[];
  trades: TradeRecord[];
  metrics_full: MetricsBlock;
  metrics_train: MetricsBlock | null;
  metrics_val: MetricsBlock | null;
  metrics_test: MetricsBlock | null;
  metrics_benchmark_full: MetricsBlock;
  data_start: string;
  data_end: string;
  bars: number;
};

export type BacktestStatusResponse = {
  backtest_id: string;
  strategy_id: string;
  version_id: string;
  status: "queued" | "running" | "completed" | "failed";
  result: BacktestResult | null;
  error: string | null;
};

/* Strategy schema is treated opaquely on the FE — it's the contract for the
 * engine, not something the user edits in v1. Keep it as Record for now. */
export type StrategySchema = Record<string, unknown> & {
  name: string;
  side: "long" | "short" | "both";
  data: { asset: string; timeframe: string; start: string; end: string };
};

export type ChatTurnResponse = {
  mode: "strategy" | "clarification";
  strategy_id: string | null;
  version_id: string | null;
  backtest_id: string | null;
  strategy: StrategySchema | null;
  explanation: string;
  clarification_question: string | null;
  missing_fields: string[];
  backtest: BacktestStatusResponse | null;
};

export type CritiqueResponse = {
  backtest_id: string;
  text: string;
};

/* Local UI state for chat — superset of what comes back from the API. */
export type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "event";
  content: string;
  meta?: {
    versionLabel?: string;
    backtestId?: string;
    sharpe?: number;
    totalReturn?: number;
  };
};
