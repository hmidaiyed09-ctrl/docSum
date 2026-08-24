import { NextResponse } from "next/server";
import { chat } from "@/lib/ai-server";
import { visionModelOf } from "@/lib/settings";
import type { AISettings, ContentPart, VisualResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

interface SourceItem {
  assetId: number;
  name: string;
  dataUrl?: string;
  text?: string;
}

const SYSTEM_PROMPT = `You are DocSum's visual designer. For ONE coverage of a course, you decide what appears on the slide next to the lesson text.

You receive:
- a compact map of the whole course (so you know where you are),
- the current coverage (title + teaching content),
- the source page(s) the planner chose, attached as images with their extracted text,
- a ledger of source pages and visuals already used in earlier coverages.

Decide:
- "showSource": keep the chosen source page(s) as the slide's main visual? true ONLY if they genuinely teach this coverage (readable, relevant, not already shown elsewhere).
- "layout": "source-primary" (the pages are the star), "visual-primary" (your graphic is the star), or "split" (both, side by side).
- "html": an optional self-contained HTML/CSS graphic (diagram, comparison table, timeline, flow). Provide it when the source is weak or absent, or as a compact companion in "split". No <script>, no external resources, no <img>. Base font-size 18px, never below 15px anywhere. Keep it compact and readable.
  STRICT COLOR RULES — the slide canvas is always dark (#151527); a white or light background is FORBIDDEN and will be stripped:
  * Base text: #e2e8f0. Inside a colored box: white text on dark fills, #1e293b text on bright fills.
  * Allowed accent colors (all dark-theme safe): red #ef4444, green #22c55e, blue #3b82f6, amber #f59e0b, purple #a855f7, teal #14b8a6, slate #334155, indigo #7c6ff0.
  * Use colors semantically and consistently across the whole course (e.g. green = correct/positive, red = wrong/negative, amber = warning, blue = definition, indigo = emphasis).
  * Never light text on a light fill; never dark text directly on the dark background; never a white background.
- "why": 1–2 sentences explaining your decision — shown to the student as "Why this slide".

You may VETO the planner: if a chosen page is poor (unreadable, off-topic, duplicate), set showSource=false and generate the visual instead — and say why.

Never repeat a visual idea or a source page that appears in the ledger.

Output STRICT JSON only — no markdown fences, no commentary:
{ "showSource": boolean, "layout": "source-primary" | "visual-primary" | "split", "why": string, "html": { "caption": string, "css": string, "html": string } | null }`;

function extractJson(raw: string): unknown {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
  return JSON.parse(s.slice(start, end + 1));
}

function sanitizeVisual(parsed: unknown, hasSources: boolean): VisualResult {
  const o = (parsed ?? {}) as Record<string, unknown>;
  const htmlObj = (o.html ?? null) as Record<string, unknown> | null;
  const html =
    htmlObj && typeof htmlObj.html === "string" && htmlObj.html.trim()
      ? {
          html: htmlObj.html,
          ...(typeof htmlObj.css === "string" ? { css: htmlObj.css } : {}),
          ...(typeof htmlObj.caption === "string" ? { caption: htmlObj.caption } : {}),
        }
      : undefined;

  let showSource = typeof o.showSource === "boolean" ? o.showSource : hasSources;
  if (!hasSources) showSource = false;

  let layout: VisualResult["layout"] = "source-primary";
  const l = typeof o.layout === "string" ? o.layout : "";
  if (l === "visual-primary" || l === "split") layout = l;
  if (!showSource) layout = "visual-primary";
  if (showSource && !html && layout === "split") layout = "source-primary";
  // nothing usable at all -> fall back to whatever exists
  if (!showSource && !html) showSource = hasSources;
  if (showSource && layout === "visual-primary" && !html) layout = "source-primary";

  return {
    showSource,
    layout,
    why: typeof o.why === "string" ? o.why : "",
    ...(html ? { html } : {}),
  };
}

export async function POST(req: Request) {
  try {
    const {
      settings,
      courseMap,
      lessonTitle,
      coverage,
      sourceItems,
      usedSourceIds,
      recentVisuals,
    } = (await req.json()) as {
      settings: AISettings;
      courseMap: unknown;
      lessonTitle: string;
      coverage: { id: string; title: string; content: string; source: unknown[] };
      sourceItems: SourceItem[];
      usedSourceIds: number[];
      recentVisuals: string[];
    };

    if (!settings?.baseUrl || !settings?.model) {
      return NextResponse.json({ error: "Missing provider settings." }, { status: 400 });
    }

    const items = Array.isArray(sourceItems) ? sourceItems : [];
    const context = JSON.stringify({
      course: courseMap,
      currentLesson: lessonTitle,
      currentCoverage: {
        id: coverage?.id,
        title: coverage?.title,
        content: coverage?.content,
      },
      plannerChosenSources: coverage?.source ?? [],
      sourcePageTexts: items.map((s) => ({
        assetId: s.assetId,
        name: s.name,
        text: (s.text ?? "").slice(0, 1200),
      })),
      alreadyUsedSourceIds: usedSourceIds ?? [],
      recentVisualCaptions: recentVisuals ?? [],
    });

    const parts: ContentPart[] = [
      {
        type: "text",
        text: `Context:\n${context}\n\nDecide the slide for coverage "${coverage?.title}".`,
      },
    ];
    for (const s of items) {
      if (s.dataUrl) parts.push({ type: "image_url", image_url: { url: s.dataUrl } });
    }

    const hasImages = items.some((s) => s.dataUrl);
    const model = hasImages ? visionModelOf(settings) : settings.model;

    const raw = await chat(
      settings,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parts },
      ],
      { temperature: 0.5, model }
    );

    const visual = sanitizeVisual(extractJson(raw), items.length > 0);
    return NextResponse.json({ visual });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Visual generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
