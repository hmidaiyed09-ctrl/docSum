import { NextResponse } from "next/server";
import { chat } from "@/lib/ai-server";
import { TEACHING_STYLE } from "@/lib/prompt";
import type { AISettings, Coverage, Course, CourseAssetInfo, Lesson, SourceRef } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are DocSum, an AI tutor that converts a student's uploaded material into a complete course structure.

You receive a JSON manifest of assets: PDF pages (text-extracted or image-transcribed), images, text and code files. Every asset has an "index" — use it as "assetId" when referencing it.

Your job: build the WHOLE subject now — every lesson and, inside each lesson, every coverage (sub-topic). For each coverage you produce:
- "content": the markdown text displayed and narrated to the student. Teach clearly and completely, always following this pattern: Concept → Example (real-life) → Why it matters → Quick recap. Short paragraphs, **bold** key terms.
- "source": the page(s) of the student's material to DISPLAY on this coverage's slide. 0 to 3 entries: {"assetId": <exact index>, "why": "<what it shows> + <why it is the right one>"}. The "why" is MANDATORY — you are forced to reason about the choice. If no page genuinely helps, use an empty array.
- "needsVisual": true when an AI-generated diagram/graphic would help (weak or missing source, abstract concept), false when the source pages already teach it well.

${TEACHING_STYLE}

Apply this style to every "content", "intro" and "why" you write. The most important ideas come first (80/20); mark optional challenges clearly as optional.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "title": string,
  "subtitle": string,
  "lessons": [
    {
      "id": "l1",
      "title": string,
      "intro": string,
      "coverage": [
        { "id": "l1c1", "title": string, "order": 1, "content": string,
          "source": [ { "assetId": number, "why": string } ],
          "needsVisual": boolean }
      ]
    }
  ]
}

Rules:
- 3–8 lessons, each with 2–6 coverages, ordered from basics to depth.
- Cover ALL key topics of the material — nothing important skipped.
- Do NOT reuse the same source page in multiple coverages; every important page is used exactly once, by the coverage it fits best.
- Each coverage's "content" stays focused (~80–200 words); depth comes from many coverages, not giant walls of text.
- The course language must match the language of the material.`;

function extractJson(raw: string): unknown {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
  return JSON.parse(s.slice(start, end + 1));
}

function sanitizeCourse(parsed: unknown, validIds: Set<number>): Course {
  const o = (parsed ?? {}) as Record<string, unknown>;
  const rawLessons = Array.isArray(o.lessons) ? o.lessons : [];
  const lessons: Lesson[] = [];

  rawLessons.forEach((rl, li) => {
    const lo = (rl ?? {}) as Record<string, unknown>;
    const rawCoverages = Array.isArray(lo.coverage) ? lo.coverage : [];
    const coverage: Coverage[] = [];

    rawCoverages.forEach((rc, ci) => {
      const co = (rc ?? {}) as Record<string, unknown>;
      const rawSource = Array.isArray(co.source) ? co.source : [];
      const source: SourceRef[] = [];

      for (const rs of rawSource) {
        const so = (rs ?? {}) as Record<string, unknown>;
        const assetId = typeof so.assetId === "number" ? Math.floor(so.assetId) : NaN;
        if (!Number.isFinite(assetId) || !validIds.has(assetId)) continue;
        if (source.some((s) => s.assetId === assetId)) continue;
        source.push({ assetId, why: typeof so.why === "string" ? so.why : "" });
        if (source.length >= 3) break;
      }

      coverage.push({
        id: typeof co.id === "string" && co.id ? co.id : `l${li + 1}c${ci + 1}`,
        title: typeof co.title === "string" && co.title ? co.title : `Coverage ${ci + 1}`,
        order: typeof co.order === "number" ? co.order : ci + 1,
        content: typeof co.content === "string" ? co.content : "",
        source,
        needsVisual: Boolean(co.needsVisual),
      });
    });

    if (coverage.length === 0) return;
    lessons.push({
      id: typeof lo.id === "string" && lo.id ? lo.id : `l${li + 1}`,
      title: typeof lo.title === "string" && lo.title ? lo.title : `Lesson ${li + 1}`,
      intro: typeof lo.intro === "string" ? lo.intro : "",
      coverage,
    });
  });

  if (lessons.length === 0) throw new Error("Generated course contained no lessons.");

  return {
    title: typeof o.title === "string" && o.title ? o.title : "Course",
    subtitle: typeof o.subtitle === "string" ? o.subtitle : "",
    lessons,
  };
}

export async function POST(req: Request) {
  try {
    const { settings, manifest, focus } = (await req.json()) as {
      settings: AISettings;
      manifest: { assets: CourseAssetInfo[] };
      focus: string;
    };

    if (!settings?.baseUrl || !settings?.model) {
      return NextResponse.json({ error: "Missing provider settings. Open Settings and configure your AI provider." }, { status: 400 });
    }

    const validIds = new Set((manifest?.assets ?? []).map((a) => a.index));

    const user = [
      focus ? `Student focus: ${focus}` : "Student focus: (none — cover the material fully)",
      "",
      "Materials manifest:",
      JSON.stringify(manifest),
    ].join("\n");

    const raw = await chat(
      settings,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      { temperature: 0.4 }
    );

    const course = sanitizeCourse(extractJson(raw), validIds);
    return NextResponse.json({ course });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Course generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
