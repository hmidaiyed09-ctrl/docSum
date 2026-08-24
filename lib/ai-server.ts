import type { ChatMessage, AISettings } from "./types";

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

function headers(settings: AISettings): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) h["Authorization"] = `Bearer ${settings.apiKey}`;
  return h;
}

/** Non-streaming chat completion -> returns the assistant text. */
export async function chat(
  settings: AISettings,
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; model?: string } = {}
): Promise<string> {
  const res = await fetch(joinUrl(settings.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify({
      model: opts.model ?? settings.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Provider error ${res.status}: ${body.slice(0, 500) || res.statusText}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Provider returned an unexpected response shape (no message content).");
  }
  return text;
}

/** Streaming chat completion -> returns the raw upstream Response (SSE body) for passthrough. */
export async function chatStream(
  settings: AISettings,
  messages: ChatMessage[],
  opts: { temperature?: number; model?: string } = {}
): Promise<Response> {
  return fetch(joinUrl(settings.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify({
      model: opts.model ?? settings.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    }),
  });
}

/** Multimodal (vision) request: instruction + one image (data URL). */
export async function visionChat(
  settings: AISettings,
  imageDataUrl: string,
  instruction: string,
  model: string
): Promise<string> {
  return chat(
    settings,
    [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    { temperature: 0.2, maxTokens: 2500, model }
  );
}
