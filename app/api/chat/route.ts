import { NextResponse } from "next/server";
import { chatStream } from "@/lib/ai-server";
import { TUTOR_PERSONA } from "@/lib/prompt";
import type { AISettings, ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Streams an OpenAI-compatible SSE chat completion straight through to the client. */
export async function POST(req: Request) {
  try {
    const { settings, messages } = (await req.json()) as {
      settings: AISettings;
      messages: ChatMessage[];
    };

    if (!settings?.baseUrl || !settings?.model) {
      return NextResponse.json({ error: "Missing provider settings." }, { status: 400 });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    // Inject the tutor persona into the system message (client sends course/slide context there).
    const msgs: ChatMessage[] = [...messages];
    if (msgs[0]?.role === "system") {
      msgs[0] = { role: "system", content: `${TUTOR_PERSONA}\n\n${String(msgs[0].content)}` };
    } else {
      msgs.unshift({ role: "system", content: TUTOR_PERSONA });
    }

    const upstream = await chatStream(settings, msgs, { temperature: 0.6 });

    if (!upstream.ok || !upstream.body) {
      const body = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Provider error ${upstream.status}: ${body.slice(0, 500) || upstream.statusText}` },
        { status: 502 }
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
