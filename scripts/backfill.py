"""One-shot Binance OHLCV backfill into the local parquet store.

Usage:
    uv run python scripts/backfill.py                # all 9 series, 5y default
    uv run python scripts/backfill.py --years 3 --asset BTC --tf 1d

Public Binance endpoints — no API key required. ~10–15 min for the full
universe at default 5-year history.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta

import pandas as pd
from stratlab_engine.data import CcxtClient, default_store
from stratlab_engine.data.universe import UNIVERSE
from stratlab_schema import Asset, Timeframe


def backfill_one(
    client: CcxtClient,
    asset: Asset,
    tf: Timeframe,
    since: datetime,
    until: datetime,
    incremental: bool = True,
) -> int:
    store = default_store()
    if incremental and store.has(asset, tf):
        last = store.last_update(asset, tf)
        if last is not None:
            since = max(since, (last + pd.Timedelta(seconds=1)).to_pydatetime())

    if since >= until:
        print(f"  ({asset.value}, {tf.value}) already current.")
        return 0

    df = client.fetch_ohlcv(
        asset, tf,
        since_ms=int(since.timestamp() * 1000),
        until_ms=int(until.timestamp() * 1000),
    )
    if df.empty:
        print(f"  ({asset.value}, {tf.value}) no new data.")
        return 0

    store.append(asset, tf, df)
    return len(df)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Binance OHLCV backfill")
    p.add_argument("--years", type=float, default=5.0, help="years of history (default: 5)")
    p.add_argument("--asset", type=str, default=None,
                   help="restrict to one asset (BTC|ETH|SOL); default: all")
    p.add_argument("--tf", type=str, default=None,
                   help="restrict to one timeframe (1h|4h|1d); default: all")
    p.add_argument("--full-rewrite", action="store_true",
                   help="ignore existing parquet, refetch from scratch")
    args = p.parse_args(argv)

    until = datetime.now(UTC)
    since = until - timedelta(days=int(args.years * 365.25))

    pairs = list(UNIVERSE)
    if args.asset:
        pairs = [(a, t) for (a, t) in pairs if a.value == args.asset.upper()]
    if args.tf:
        pairs = [(a, t) for (a, t) in pairs if t.value == args.tf]
    if not pairs:
        print(f"no matching (asset, tf) pairs for asset={args.asset} tf={args.tf}")
        return 2

    client = CcxtClient()
    total_bars = 0
    print(
        f"backfill: {len(pairs)} series, ~{args.years:.1f}y history "
        f"→ {since.date()}..{until.date()}"
    )
    for asset, tf in pairs:
        n = backfill_one(client, asset, tf, since, until, incremental=not args.full_rewrite)
        total_bars += n
        print(f"  ({asset.value:>3}, {tf.value:>2}) → {n:>6} bars")

    print(f"\ndone. wrote {total_bars} bars across {len(pairs)} series.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
