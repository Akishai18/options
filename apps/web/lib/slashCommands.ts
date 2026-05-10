/* Slash command parsing — client-side only.
 * The chat handler intercepts inputs starting with "/" and dispatches them
 * locally instead of sending them to the LLM. */

export type SlashKind = "help" | "clear" | "export" | "compare" | "results" | "chat";

export type SlashCommand = {
  kind: SlashKind;
  /** Raw arguments after the command word. */
  args: string;
};

export type SlashSpec = {
  name: string;            // command keyword without the slash
  kind: SlashKind;
  args?: string;           // example arg syntax for the dropdown
  hint: string;            // human-readable hint
};

export const SLASH_SPECS: SlashSpec[] = [
  { name: "help",    kind: "help",    hint: "list available commands" },
  { name: "results", kind: "results", hint: "jump to the results dashboard" },
  { name: "compare", kind: "compare", args: "v2 v3", hint: "compare two backtested versions" },
  { name: "export",  kind: "export",  hint: "open the runnable Python export" },
  { name: "chat",    kind: "chat",    hint: "back to chat view" },
  { name: "clear",   kind: "clear",   hint: "clear the conversation and start fresh" },
];

/** Parse a raw composer input. Returns the command if it begins with "/". */
export function parseSlash(text: string): SlashCommand | null {
  const t = text.trim();
  if (!t.startsWith("/")) return null;
  const m = t.slice(1).match(/^(\w+)\s*(.*)$/);
  if (!m) return null;
  const [, name, rest] = m;
  const spec = SLASH_SPECS.find((s) => s.name === name.toLowerCase());
  if (!spec) return null;
  return { kind: spec.kind, args: (rest ?? "").trim() };
}

/** Suggestions for autocomplete dropdown — match-prefix on the command name. */
export function suggestSlash(text: string): SlashSpec[] {
  const t = text.trimStart();
  if (!t.startsWith("/")) return [];
  const head = t.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? "";
  if (head === "") return SLASH_SPECS;
  return SLASH_SPECS.filter((s) => s.name.startsWith(head));
}

/** Parse "v2 v3" → ["v2", "v3"]; ignores extras. */
export function parseCompareArgs(args: string): [string, string] | null {
  const tokens = args.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  return [tokens[0].toLowerCase(), tokens[1].toLowerCase()];
}
