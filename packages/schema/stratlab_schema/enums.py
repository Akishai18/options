"""Closed vocabularies for the strategy DSL.

Enums for the human-facing axes (Asset, Timeframe, Side). The Literal-typed
vocabularies for indicators, operators, and price fields live in `strategy.py`
because Pydantic's JSON Schema generation needs them as Literal values for
Anthropic tool-use to produce a proper enum constraint.
"""

from enum import StrEnum


class Asset(StrEnum):
    BTC = "BTC"
    ETH = "ETH"
    SOL = "SOL"


class Timeframe(StrEnum):
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"


class Side(StrEnum):
    LONG = "long"
    SHORT = "short"
    BOTH = "both"
