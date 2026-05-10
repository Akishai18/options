# StratLab

A conversational quant research workbench. Describe a trading strategy in
plain English; the AI converts it to a structured spec; the platform
backtests it on real crypto market data and shows results in a dashboard
whose default view *forces* anti-overfitting analysis (in-sample vs
out-of-sample side-by-side, sensitivity halo, regime decomposition, cost
stress). Iterate in chat until satisfied, then export the strategy as
runnable Python.

> **Working name.** "StratLab" is a placeholder; final naming TBD pre-launch.

## Why this exists

> Backtests are easy to make look good and hard to trust.

Most retail-quant tooling does the opposite of what it should: it makes it
*easier* to overfit, not harder. StratLab's wedge is an opinionated default
view that surfaces the questions overfit strategies tend to fail at:

- **In-sample / out-of-sample split** — visible in every chart, not buried
  behind a tab.
- **Sensitivity halo** — perturb each parameter ±20% and render the
  resulting equity envelope. Wide warm-tinted halo = fragile to params.
- **Regime decomposition** — Sharpe per (low-vol / high-vol) and
  (trending / sideways) regime. Lopsided regime performance is a common
  overfit signature.
- **Cost stress** — re-run the same backtest at 1.5× and 2× the assumed
  fees. Strategies that look great at 5 bps often die at 10 bps.
- **AI critique grounded in numbers** — the LLM never sees price data,
  only the computed metrics. Falsifiable: if the critique says "Sharpe
  falls 60% under cost stress," you can grep and check.

## V1 scope (this repo)

- **Universe**: BTC / ETH / SOL on 1h, 4h, 1d (Binance OHLCV).
- **Engine**: pure-Python bar-loop backtester with a single load-bearing
  `.shift(1)` in the compiler that prevents look-ahead.
- **Indicators**: 18-name closed vocabulary (sma, ema, rsi, bbands, atr,
  adx, slope, realized_vol, rolling_max/min, ...).
- **LLM**: Google Gemini 2.5 Flash via google-genai (free tier). Provider
  is behind a Protocol so swapping in Anthropic later is one file.
- **Storage**: in-memory for V1 local. Supabase swap is M2 external.

V2 adds equities, V3 adds options, V4 adds paper trading.

## Architecture

```
                ┌─────────────────────┐
                │  Next.js (web)      │
                │  app/ + components/ │
                └──────────┬──────────┘
                           │  /api/* proxied to FastAPI
                           ▼
                ┌─────────────────────┐
                │  FastAPI (api)      │
                │  routes/, llm/,     │
                │  exporters/         │
                └────┬───────────┬────┘
                     │           │
                     ▼           ▼
            ┌──────────────┐ ┌──────────────┐
            │ Gemini API   │ │ MemoryStore  │
            └──────────────┘ │ (V1) →       │
                             │ Supabase (V2)│
                             └──────────────┘
                     ┌──────────────┐
                     │ packages/    │
                     │  schema/     │
                     │  engine/     │
                     │  - indicators│
                     │  - compiler  │ (the load-bearing .shift(1))
                     │  - backtester│
                     │  - splits    │
                     │  - overfitting (cost_stress, regime, sensitivity)
                     │  - results   │
                     └──────────────┘
                              ▲
                              │ reads parquet OHLCV
                              ▼
                     ┌──────────────┐
                     │ data/ohlcv/  │ (gitignored; backfilled via ccxt)
                     └──────────────┘
```

## Repo layout

```
options-trader/
├── apps/
│   ├── web/              # Next.js 15 + React 19 frontend
│   └── api/              # FastAPI backend
├── packages/
│   ├── schema/           # Pydantic strategy DSL — the LLM ↔ engine contract
│   └── engine/           # Bar-loop backtester + indicators + overfit views
├── scripts/
│   └── backfill.py       # One-shot Binance OHLCV backfill
├── data/                 # gitignored; local OHLCV parquets
├── .env.example          # template; copy to .env and fill in
├── pyproject.toml        # uv workspace
└── README.md
```

## Run locally

### Prerequisites

- Python 3.13+ and [`uv`](https://docs.astral.sh/uv/)
- Node 20+ and [`pnpm`](https://pnpm.io/)
- A Gemini API key (free tier): https://aistudio.google.com/app/apikey

### Setup

```bash
# 1. Install deps
uv sync                                  # Python workspace
cd apps/web && pnpm install && cd ../..  # Web

# 2. Configure
cp .env.example .env
# Edit .env: set STRATLAB_GEMINI_API_KEY at minimum.

# 3. Backfill OHLCV (5y, 9 series, ~10–15 min)
uv run python scripts/backfill.py
```

If your machine is in the US, Binance.com may geo-block — swap to
`binanceus` or `bybit` in `scripts/backfill.py` (both are ccxt-supported
and free).

### Dev servers

One command, both servers, prefixed logs:

```bash
./scripts/dev.sh
```

Or split across two terminals:

```bash
# Terminal 1 — API at :8000
uv run uvicorn stratlab_api.main:app --reload --port 8000

# Terminal 2 — Web at :3000
cd apps/web && pnpm dev
```

Open http://localhost:3000.

### Persistence

By default (`STRATLAB_DEV_MODE=true`) the API uses an in-memory store —
strategies and backtests reset on every restart, single user (`dev-user`).

To turn on **persistent multi-user storage**:

1. Open Supabase → **SQL Editor** and paste the contents of
   `apps/api/migrations/001_initial_schema.sql`. Run.
2. In `.env`, set:
   ```
   STRATLAB_DEV_MODE=false
   STRATLAB_SUPABASE_URL=https://<project>.supabase.co
   STRATLAB_SUPABASE_SERVICE_ROLE_KEY=<service role key>
   STRATLAB_SUPABASE_JWT_SECRET=<JWT secret>
   NEXT_PUBLIC_SUPABASE_URL=<same URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
3. In **Supabase → Auth → URL Configuration**, add `http://localhost:3000`
   to Site URL and `http://localhost:3000/auth/callback` to Redirect URLs.
4. Restart `./scripts/dev.sh`. Visit localhost:3000 → bounced to `/sign-in` →
   sign up with email → use the app. Strategies/backtests survive restarts.

## Tests + lint

```bash
uv run pytest packages/ apps/api/        # 120 tests
uv run ruff check packages/ apps/api/
cd apps/web && pnpm build                # typecheck via Next build
```

## Slash commands

The chat composer accepts slash commands (type `/` to autocomplete):

- `/help` — list commands
- `/results` — jump to the dashboard
- `/compare v2 v3` — side-by-side compare two backtested versions
- `/export` — open the runnable Python export
- `/chat` — back to chat view
- `/clear` — wipe the conversation and start fresh

## Anti-overfit views in the dashboard

When a backtest completes, the dashboard renders (in this order):

1. Strategy header (asset · timeframe · period)
2. Metrics strip — IS → OOS deltas, color-coded
3. Equity curve — IS / validation / OOS regions tinted, OOS in accent
4. **Sensitivity halo** — baseline + ±20% per-param envelope, fragility-tinted
5. Drawdown
6. **Cost stress** — same backtest at 1.0× / 1.5× / 2× fees
7. **Regime decomposition** — Sharpe per (low-vol, high-vol, trending, sideways)
8. Trade log (with summary strip + paginated rows)
9. AI critique (streams in via SSE, drop-cap on the first letter)

## Code export

Click the **Code** sidebar item. The platform generates a self-contained
Python script that depends only on `ccxt`, `numpy`, and `pandas` — no
StratLab dependency. Copy or download the file; `pip install -r
requirements.txt && python strategy.py` reproduces the headline metrics.

## Deploy

### Backend → Render (or Fly.io)

The API runs as a single FastAPI service with a small persistent disk for
the parquet OHLCV cache. Either Render or Fly works — pick a **non-US
region** (Render: Frankfurt/Singapore; Fly: `lhr`/`ams`) so Binance.com
doesn't geo-block your OHLCV calls. If you must run from the US, swap
`binance` for `binanceus` in `scripts/backfill.py`.

**Render:**
1. New → Web Service → connect this repo, root directory `apps/api`.
2. Runtime: Python 3.13. Build: `uv sync --frozen`. Start:
   `uv run uvicorn stratlab_api.main:app --host 0.0.0.0 --port $PORT`.
3. Add a persistent disk (10 GB) mounted at `/opt/render/project/src/data`,
   set env `STRATLAB_DATA_DIR=/opt/render/project/src/data`.
4. Env vars: `STRATLAB_DEV_MODE=false`,
   `STRATLAB_SUPABASE_JWT_SECRET=<Supabase → Settings → API → JWT Secret>`,
   `STRATLAB_GEMINI_API_KEY=...`, `STRATLAB_SUPABASE_URL=...`,
   `STRATLAB_CORS_ORIGINS=["https://<your-vercel-domain>"]`,
   `STRATLAB_SENTRY_DSN_BACKEND=...`.
5. After first deploy: open a Render shell and run
   `uv run python scripts/backfill.py` to populate OHLCV (~10–15 min, one-time).

### Frontend → Vercel

1. Import the repo on Vercel, root directory `apps/web`.
2. Env vars: `NEXT_PUBLIC_SUPABASE_URL=...`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`,
   `STRATLAB_API_URL=https://<your-render-url>`,
   `NEXT_PUBLIC_SENTRY_DSN_FRONTEND=...` (optional).
3. In Supabase **Auth → URL Configuration**, add your Vercel domain to
   "Site URL" and "Redirect URLs" (`https://<your-vercel-domain>/auth/callback`).

That's the deploy.

## Status

V1 is feature-complete. The platform supports multi-user via Supabase Auth.
Strategies and backtests live in an in-memory store on the API service —
they survive within a single process but reset on restart. Promoting that
to durable Supabase storage (RLS-gated tables for strategies, versions,
backtests, chat) is the next step; the swap is contained to
`apps/api/stratlab_api/storage.py`.

See `IMPLEMENTATION_PLAN.md` for the full design doc and the M0–M5 build
sequence.
