import type { ChatTurnResponse, CritiqueResponse } from "./types";

class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
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

export { ApiError };
