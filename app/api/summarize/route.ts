import { NextResponse } from "next/server";
import { chat } from "@/lib/ai-server";
import { TEACHING_STYLE } from "@/lib/prompt";
import type { AISettings, Course } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are DocSum. The student just finished a course built from their document. Write a COMPLETE, copy-ready study summary of the document's important points.

${TEACHING_STYLE}

Output markdown only (no commentary, no code fences), in this shape:
# <course title>
For each lesson:
## <lesson title>
- bullet: key point (definitions, formulas, facts — exactly what the student needs to remember)
End with:
## Key takeaways
- 5–8 bullets with the absolute essentials.

Keep every bullet short and self-sufficient. Match the language of the course.`;

export async function POST(req: Request) {
  try {
    const { settings, course } = (await req.json()) as { settings: AISettings; course: Course };

    if (!settings?.baseUrl || !settings?.model) {
      return NextResponse.json({ error: "Missing provider settings." }, { status: 400 });
    }
    if (!course?.lessons?.length) {
      return NextResponse.json({ error: "No course to summarize." }, { status: 400 });
    }

    const compact = {
      title: course.title,
      subtitle: course.subtitle,
      lessons: course.lessons.map((l) => ({
        title: l.title,
        coverage: l.coverage.map((c) => ({ title: c.title, content: c.content.slice(0, 1200) })),
      })),
    };

    const raw = await chat(
      settings,
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Course:\n${JSON.stringify(compact)}` },
      ],
      { temperature: 0.4 }
    );

    const summary = raw.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/, "").trim();
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summary generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
