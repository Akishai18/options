/* Compact mono rendering of a StrategySchema's entry/exit rules.
 *
 * Examples:
 *   {type:"comparison", op:"cross_above",
 *     left:{type:"indicator", name:"ema", params:{period:20}},
 *     right:{type:"indicator", name:"ema", params:{period:50}}}
 *   → "ema(20) ↗ ema(50)"
 *
 *   {type:"logical", op:"and", operands:[a, b]}
 *   → "<a> ∧ <b>"
 *
 * Returns null if the input doesn't look like a valid ExprNode. */

type Node = Record<string, unknown>;

const OP_SYMBOL: Record<string, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
  cross_above: "↗",
  cross_below: "↘",
  and: "∧",
  or: "∨",
  not: "¬",
};

export function fingerprint(node: unknown): string | null {
  try {
    return render(node as Node);
  } catch {
    return null;
  }
}

function render(node: Node): string {
  const t = node["type"];
  if (t === "constant") {
    const v = Number(node["value"]);
    return Number.isFinite(v) ? formatNumber(v) : String(node["value"]);
  }
  if (t === "indicator") {
    const name = String(node["name"] ?? "?");
    const params = node["params"] as Record<string, unknown> | undefined;
    const args: string[] = [];
    if (params) {
      for (const key of ["period", "num_std"] as const) {
        if (key in params) {
          args.push(formatNumber(Number(params[key])));
        }
      }
    }
    return args.length ? `${name}(${args.join(",")})` : name;
  }
  if (t === "comparison") {
    const op = String(node["op"]);
    const sym = OP_SYMBOL[op] ?? op;
    return `${render(node["left"] as Node)} ${sym} ${render(node["right"] as Node)}`;
  }
  if (t === "logical") {
    const op = String(node["op"]);
    const sym = OP_SYMBOL[op] ?? op;
    const ops = (node["operands"] as Node[]) ?? [];
    if (op === "not") {
      return `${sym}${render(ops[0])}`;
    }
    return ops.map((o) => render(o)).join(` ${sym} `);
  }
  return "?";
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "?";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
