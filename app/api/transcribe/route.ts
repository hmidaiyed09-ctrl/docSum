import { NextResponse } from "next/server";
import { visionChat } from "@/lib/ai-server";
import { visionModelOf } from "@/lib/settings";
import type { AISettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { settings, imageDataUrl, instruction } = (await req.json()) as {
      settings: AISettings;
      imageDataUrl: string;
      instruction: string;
    };

    if (!settings?.baseUrl || !settings?.model) {
      return NextResponse.json({ error: "Missing provider settings." }, { status: 400 });
    }

    const text = await visionChat(
      settings,
      imageDataUrl,
      instruction,
      visionModelOf(settings)
    );

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
