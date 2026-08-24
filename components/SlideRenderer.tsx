"use client";

import { useState } from "react";
import Markdown from "./Markdown";
import { loadSettings } from "@/lib/settings";
import type { Asset, Coverage, Course, Lesson } from "@/lib/types";

export type Step =
  | { kind: "cover" }
  | { kind: "lesson-intro"; lesson: Lesson }
  | { kind: "coverage"; lesson: Lesson; coverage: Coverage }
  | { kind: "done" };

/** Safety net: the AI must never produce a white/light canvas — strip it if it tries. */
function enforceDark(s: string): string {
  return s
    .replace(
      /background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*(?:!important)?\s*;?/gi,
      "background:#1b1b2f;"
    )
    .replace(
      /background(?:-color)?\s*:\s*(?:#f5f5f5|#fafafa|#f8f8f8|#f0f0f0|#f3f4f6|#eee(?:eee)?|#e5e7eb)\s*(?:!important)?\s*;?/gi,
      "background:#1b1b2f;"
    );
}

export default function SlideRenderer({
  step,
  course,
  assets,
}: {
  step: Step;
  course: Course;
  assets: Asset[];
}) {
  const [zoom, setZoom] = useState<Asset | null>(null);

  let body: React.ReactNode;
  if (step.kind === "cover") body = <CoverSlide course={course} />;
  else if (step.kind === "done") body = <DoneSlide course={course} />;
  else if (step.kind === "lesson-intro") body = <LessonCard title={step.lesson.title} />;
  else
    body = (
      <CoverageSlide
        lessonTitle={step.lesson.title}
        coverage={step.coverage}
        assets={assets}
        onZoom={setZoom}
      />
    );

  return (
    <>
      {body}
      {zoom?.dataUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-8"
          onClick={() => setZoom(null)}
        >
          <img
            src={zoom.dataUrl}
            alt={zoom.name}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button className="absolute right-6 top-6 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20">
            ✕ Close
          </button>
        </div>
      )}
    </>
  );
}

function CoverSlide({ course }: { course: Course }) {
  return (
    <div className="fade-up relative flex h-full w-full flex-col justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#6d5df0] via-[#5b4bd6] to-[#3d2fa8] p-12 shadow-2xl">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/20 blur-3xl" />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-20"
        viewBox="0 0 800 500"
        preserveAspectRatio="none"
      >
        <path d="M0 400 C 200 300, 400 480, 800 350 L 800 500 L 0 500 Z" fill="rgba(255,255,255,0.15)" />
        <path d="M0 450 C 250 380, 500 500, 800 420 L 800 500 L 0 500 Z" fill="rgba(255,255,255,0.1)" />
      </svg>
      <p className="relative text-xl text-white/80">DocSum Course</p>
      <h1 className="relative mt-4 max-w-3xl text-5xl font-bold leading-tight text-white md:text-6xl">
        {course.title}
      </h1>
      {course.subtitle && (
        <p className="relative mt-6 max-w-2xl text-lg text-white/85">{course.subtitle}</p>
      )}
    </div>
  );
}

function DoneSlide({ course }: { course: Course }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setOpen(true);
    setBusy(true);
    setError("");
    setSummary("");
    setCopied(false);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: loadSettings(), course }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Summary generation failed.");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summary generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([summary], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${course.title || "docsum-summary"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fade-up flex h-full w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-card p-12 text-center shadow-2xl">
      <div className="text-6xl">🎉</div>
      <h1 className="mt-6 text-4xl font-bold text-white">Course complete!</h1>
      <p className="mt-4 max-w-md text-slate-300">
        You finished <strong className="text-white">{course.title}</strong>. Review any slide with
        the arrows, grab the summary of the important points, or upload a new document from the home
        page.
      </p>
      <button
        onClick={generate}
        disabled={busy}
        className="mt-6 rounded-xl bg-accent px-6 py-3 font-medium text-white transition enabled:hover:bg-accent-deep disabled:opacity-50"
      >
        {busy ? "Writing your summary…" : "📝 Generate summary"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="fade-up flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h2 className="font-semibold text-white">Document summary</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 transition hover:text-white">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 text-left">
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              {busy && (
                <p className="text-sm text-slate-400">
                  Reading the whole course and writing the summary… this takes a moment.
                </p>
              )}
              {summary && <Markdown>{summary}</Markdown>}
            </div>
            {summary && (
              <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
                <button
                  onClick={download}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                >
                  ⬇ Download .md
                </button>
                <button
                  onClick={copy}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-deep"
                >
                  {copied ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LessonCard({ title, kicker = "Lesson" }: { title: string; kicker?: string }) {
  return (
    <div className="fade-up flex h-full w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-[#232345] to-[#16162a] p-12 text-center shadow-2xl">
      <p className="text-sm uppercase tracking-widest text-accent">{kicker}</p>
      <h2 className="mt-3 max-w-xl text-4xl font-bold leading-tight text-white">{title}</h2>
    </div>
  );
}

function CoverageSlide({
  lessonTitle,
  coverage,
  assets,
  onZoom,
}: {
  lessonTitle: string;
  coverage: Coverage;
  assets: Asset[];
  onZoom: (a: Asset) => void;
}) {
  const v = coverage.visual;
  const sources = coverage.source
    .map((s) => ({ ref: s, asset: assets.find((a) => a.index === s.assetId) }))
    .filter((s): s is { ref: (typeof s)["ref"]; asset: Asset } => Boolean(s.asset?.dataUrl));

  const showSource = v ? v.showSource : sources.length > 0;
  const html = v?.html?.html ? v.html : undefined;
  const layout = v?.layout ?? (showSource ? "source-primary" : "visual-primary");

  const sourcesPane = (
    <div className="h-full min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-4">
      {sources.map(({ ref, asset }) => (
        <figure key={ref.assetId} className="mb-5 last:mb-0">
          <img
            src={asset.dataUrl}
            alt={asset.name}
            onClick={() => onZoom(asset)}
            className="mx-auto max-h-[72vh] w-auto cursor-zoom-in rounded-lg object-contain"
          />
          <figcaption className="mt-2 text-center text-[15px] leading-relaxed text-slate-400">
            <span className="text-slate-300">{asset.name}</span>
            {ref.why ? ` — ${ref.why}` : ""}
          </figcaption>
        </figure>
      ))}
      {v?.why && (
        <p className="mt-3 border-t border-white/10 pt-3 text-sm italic text-slate-500">
          Why this slide: {v.why}
        </p>
      )}
    </div>
  );

  const htmlPane = html ? (
    <div className="flex h-full min-h-0 flex-col">
      <iframe
        title="AI-generated visual"
        sandbox="allow-scripts"
        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          html,body{margin:0;padding:18px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#151527 !important;color:#e2e8f0 !important;font-size:18px;line-height:1.6;}
          ${enforceDark(html.css ?? "")}
        </style></head><body>${enforceDark(html.html)}</body></html>`}
        className="h-full w-full min-h-0 flex-1 rounded-xl bg-[#151527]"
      />
      {html.caption && (
        <p className="mt-2 shrink-0 text-center text-[15px] text-slate-400">{html.caption}</p>
      )}
    </div>
  ) : null;

  if (showSource && html && layout === "split" && sources.length > 0) {
    return (
      <figure className="fade-up grid h-full w-full grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-panel p-4 shadow-2xl">
        {sourcesPane}
        {htmlPane}
      </figure>
    );
  }

  if (showSource && sources.length > 0) {
    return (
      <figure className="fade-up h-full w-full rounded-2xl border border-white/10 bg-panel p-4 shadow-2xl">
        {sourcesPane}
      </figure>
    );
  }

  if (html) {
    return (
      <figure className="fade-up h-full w-full rounded-2xl border border-white/10 bg-[#151527] p-4 shadow-2xl">
        {htmlPane}
      </figure>
    );
  }

  // Nothing resolved (no sources kept, no visual) — show the coverage title card.
  return <LessonCard title={coverage.title || lessonTitle} kicker="Coverage" />;
}
