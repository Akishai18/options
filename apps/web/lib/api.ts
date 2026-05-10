import { createSupabaseBrowserClient } from "./supabase/client";
import type { ChatTurnResponse, CritiqueResponse } from "./types";

class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

/** Returns the current Supabase access token, or null if not signed in
 * (or Supabase isn't configured — dev mode keeps things working). */
async function getAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const auth = await authHeaders();
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...auth,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, detail, body);
  }
  return res.json() as Promise<T>;
}

export async function chatTurn(args: {
  message: string;
  strategy_id?: string;
}): Promise<ChatTurnResponse> {
  return request<ChatTurnResponse>("/api/v1/chat/turn", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function getCritique(backtestId: string): Promise<CritiqueResponse> {
  return request<CritiqueResponse>(`/api/v1/critique/${backtestId}`, {
    method: "POST",
  });
}

/** Stream a critique via SSE. Calls `onChunk` per token, `onDone` at the end,
 * `onError` on any failure. Returns an `AbortController` so the caller can
 * cancel an in-flight stream (e.g., when switching versions). */
export function streamCritique(
  backtestId: string,
  handlers: {
    onChunk: (text: string) => void;
    onDone: () => void;
    onError: (err: string) => void;
  },
): AbortController {
  const ctrl = new AbortController();
  (async () => {
    try {
      const auth = await authHeaders();
      const res = await fetch(`/api/v1/critique/${backtestId}/stream`, {
        signal: ctrl.signal,
        headers: auth,
      });
      if (!res.ok || !res.body) {
        const detail = (await res.text().catch(() => "")) || `HTTP ${res.status}`;
        handlers.onError(detail);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = parseSseBlock(block);
          if (!event) continue;
          if (event.type === "token") {
            try {
              const j = JSON.parse(event.data) as { text?: string };
              if (j.text) handlers.onChunk(j.text);
            } catch {
              /* ignore malformed chunk */
            }
          } else if (event.type === "error") {
            try {
              const j = JSON.parse(event.data) as { error?: string };
              handlers.onError(j.error ?? "stream error");
            } catch {
              handlers.onError("stream error");
            }
            return;
          } else if (event.type === "done") {
            handlers.onDone();
            return;
          }
        }
      }
      handlers.onDone();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      handlers.onError(e instanceof Error ? e.message : String(e));
    }
  })();
  return ctrl;
}

function parseSseBlock(block: string): { type: string; data: string } | null {
  let type = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { type, data: dataLines.join("\n") };
}

export type ExportBundleResponse = {
  strategy_id: string;
  version_id: string;
  files: Record<string, string>;
};

export async function getExportBundle(
  strategyId: string,
  versionId: string,
): Promise<ExportBundleResponse> {
  return request<ExportBundleResponse>(
    `/api/v1/strategies/${strategyId}/versions/${versionId}/export`,
  );
}

export { ApiError };
