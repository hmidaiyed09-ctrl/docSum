"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SlideRenderer, { type Step } from "@/components/SlideRenderer";
import Markdown from "@/components/Markdown";
import ProgressRing from "@/components/ProgressRing";
import { idbGet } from "@/lib/idb";
import { loadSettings } from "@/lib/settings";
import type { Asset, ChatMessage, Course } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

function narrationFor(step: Step, course: Course): string {
  if (step.kind === "cover") {
    return `Welcome! This course — **${course.title}** — was built from your documents. ${
      course.subtitle || ""
    }\n\nHit **Continue** to start.`;
  }
  if (step.kind === "done") {
    return "🎉 That's everything! You've covered the whole material. Use the arrows to review any slide, or head back to the home page to upload another document.";
  }
  if (step.kind === "lesson-intro") {
    return `## ${step.lesson.title}\n\n${step.lesson.intro}`;
  }
  return step.coverage.content;
}

function buildContext(step: Step, course: Course, assets: Asset[]): string {
  const lines = [
    `You are DocSum, a patient tutor. The student is taking the course "${course.title}" and asks for a deeper explanation.`,
    `Answer concisely in markdown (short paragraphs, bold key terms). Match the student's language.`,
  ];
  if (step.kind === "lesson-intro") {
    lines.push(`Current lesson: "${step.lesson.title}". Intro: ${step.lesson.intro}`);
  } else if (step.kind === "coverage") {
    lines.push(`Current lesson: "${step.lesson.title}" — coverage: "${step.coverage.title}".`);
    lines.push(`Coverage content: ${step.coverage.content.slice(0, 2500)}`);
    const srcs = step.coverage.source
      .map((s) => {
        const a = assets.find((x) => x.index === s.assetId);
        return a?.text ? `[${a.name}] ${a.text.slice(0, 1200)}` : null;
      })
      .filter(Boolean);
    if (srcs.length) lines.push(`Source material: ${srcs.join("\n")}`);
    if (step.coverage.visual?.why) lines.push(`Slide decision: ${step.coverage.visual.why}`);
  }
  return lines.join("\n");
}

export default function LearnPage() {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const steps = useMemo<Step[]>(() => {
    if (!course) return [];
    const s: Step[] = [{ kind: "cover" }];
    course.lessons.forEach((lesson) => {
      s.push({ kind: "lesson-intro", lesson });
      lesson.coverage.forEach((coverage) => s.push({ kind: "coverage", lesson, coverage }));
    });
    s.push({ kind: "done" });
    return s;
  }, [course]);

  // Load course + assets (v2 format)
  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = window.localStorage.getItem("docsum.course.v2");
      if (!raw) {
        router.replace("/");
        return;
      }
      try {
        const c = JSON.parse(raw) as Course;
        const a = (await idbGet<Asset[]>("assets")) ?? [];
        if (!alive) return;
        setCourse(c);
        setAssets(a);
        const saved = Number(window.localStorage.getItem("docsum.progress") ?? "0");
        setStepIdx(Number.isFinite(saved) ? saved : 0);
      } catch {
        router.replace("/");
        return;
      }
      if (alive) setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  // New narration whenever the step changes
  useEffect(() => {
    if (!course || steps.length === 0) return;
    const step = steps[Math.min(stepIdx, steps.length - 1)];
    setMessages([{ role: "assistant", content: narrationFor(step, course) }]);
    setInput("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, loaded]);

  // Persist progress + autoscroll chat
  useEffect(() => {
    if (loaded) window.localStorage.setItem("docsum.progress", String(stepIdx));
  }, [stepIdx, loaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const progress = steps.length > 1 ? (stepIdx / (steps.length - 1)) * 100 : 0;
  const currentStep = steps[Math.min(stepIdx, Math.max(steps.length - 1, 0))];
  const isLast = stepIdx >= steps.length - 1;

  const goNext = useCallback(() => {
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const goPrev = useCallback(() => {
    setStepIdx((i) => Math.max(i - 1, 0));
  }, []);

  const sendExplain = async () => {
    const q = input.trim();
    if (!q || streaming || !course) return;
    setInput("");
    setError("");

    const history: ChatMessage[] = [
      { role: "system", content: buildContext(currentStep, course, assets) },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: "user", content: q },
    ];
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: loadSettings(), messages: history }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "The AI could not respond.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") {
            finished = true;
            break;
          }
          try {
            const j = JSON.parse(payload);
            const delta: string | undefined = j?.choices?.[0]?.delta?.content;
            if (delta) {
              setMessages((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") last.content += delta;
                return copy;
              });
            }
          } catch {
            /* partial SSE line — ignore */
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI could not respond.");
    } finally {
      setStreaming(false);
    }
  };

  // Loading screen
  if (!loaded || !course || !currentStep) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          <p className="text-sm text-slate-400">Loading your course…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-ink">
      {/* ---------- left: chat panel ---------- */}
      <aside className="flex h-full w-[420px] shrink-0 flex-col border-r border-white/10 bg-panel">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <button
            onClick={() => router.push("/")}
            className="text-sm font-semibold text-white"
            title="Back to home"
          >
            Doc<span className="text-accent">Sum</span>
          </button>
          <span className="truncate text-xs text-slate-400">
            {currentStep.kind === "coverage"
              ? `Lesson: ${currentStep.lesson.title} · ${currentStep.coverage.title}`
              : currentStep.kind === "lesson-intro"
                ? `Lesson: ${currentStep.lesson.title}`
                : currentStep.kind === "cover"
                  ? "Course cover"
                  : "Finished"}
          </span>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className="fade-up">
                {m.content ? (
                  <Markdown>{m.content}</Markdown>
                ) : (
                  <span className="typing-dot inline-block h-2 w-2 rounded-full bg-accent" />
                )}
              </div>
            ) : (
              <div key={i} className="fade-up flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/25 px-4 py-2.5 text-[15px] text-slate-100">
                  {m.content}
                </div>
              </div>
            )
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-white/10 p-4">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendExplain();
                }
              }}
              placeholder="Ask for a deeper explanation…"
              disabled={streaming}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-[15px] text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={sendExplain}
              disabled={streaming || !input.trim()}
              className="rounded-xl border border-white/15 px-3.5 py-2.5 text-sm text-slate-200 transition enabled:hover:border-accent enabled:hover:text-white disabled:opacity-40"
              title="Explain deeper"
            >
              {streaming ? "…" : "✨"}
            </button>
          </div>
          <button
            onClick={goNext}
            disabled={isLast}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-medium text-white transition enabled:hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
            <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-xs">
              {stepIdx}/{steps.length - 1}
            </span>
          </button>
        </footer>
      </aside>

      {/* ---------- center: slide area ---------- */}
      <section className="relative flex-1 p-6">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={goPrev}
            disabled={stepIdx === 0}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-30"
          >
            ← Back
          </button>
          <button
            onClick={goNext}
            disabled={isLast}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-30"
          >
            Next →
          </button>
          <span className="ml-auto text-xs text-slate-500">
            Slide {stepIdx + 1} of {steps.length}
          </span>
        </div>
        <div className="h-[calc(100%-3.25rem)]">
          <SlideRenderer step={currentStep} course={course} assets={assets} />
        </div>
      </section>

      {/* ---------- right: sidebar ---------- */}
      <nav className="flex w-24 shrink-0 flex-col items-center gap-8 border-l border-white/10 bg-panel py-8">
        <div className="flex flex-col items-center gap-1">
          <ProgressRing value={progress} />
          <span className="text-xs text-slate-400">Progress</span>
        </div>
        <button
          className="flex flex-col items-center gap-1 text-slate-400 transition hover:text-white"
          title="Notes (coming soon)"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/90 text-xl">📝</span>
          <span className="text-xs">Notes</span>
        </button>
        <button
          onClick={() => router.push("/")}
          className="mt-auto flex flex-col items-center gap-1 text-slate-400 transition hover:text-white"
          title="New course"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-lg">＋</span>
          <span className="text-xs">New</span>
        </button>
      </nav>
    </div>
  );
}
