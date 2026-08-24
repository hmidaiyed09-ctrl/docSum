"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SettingsModal from "@/components/SettingsModal";
import { loadSettings, saveSettings } from "@/lib/settings";
import { ingestFiles, isSupported, buildManifest } from "@/lib/ingest";
import { idbSet } from "@/lib/idb";
import type { AISettings, Asset, Course } from "@/lib/types";

const ACCEPTED =
  ".pdf,image/*,.txt,.md,.markdown,.csv,.log,.json,.xml,.yml,.yaml," +
  ".js,.jsx,.ts,.tsx,.py,.java,.c,.h,.cpp,.cs,.go,.rb,.rs,.php,.html,.css,.sql,.sh,.ipynb";

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [focus, setFocus] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AISettings>({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o",
    visionModel: "",
  });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setSettings(loadSettings()), []);

  const log = useCallback((msg: string) => {
    setLogs((l) => [...l.slice(-8), msg]);
  }, []);


  const addFiles = (incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter((f) => {
      if (isSupported(f)) return true;
      log(`Skipped (unsupported): ${f.name}`);
      return false;
    });
    setFiles((prev) => [...prev, ...valid]);
  };

  const start = async () => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!settings.baseUrl) throw new Error("Configure your AI provider in Settings first.");

      // 1. Ingest files (extract PDF text, render non-extractable pages to images)
      log("Reading your files…");
      const assets: Asset[] = await ingestFiles(files, log);
      if (assets.length === 0) throw new Error("No usable material found in the uploaded files.");
      log(`Prepared ${assets.length} assets.`);

      // 2. Vision pass: transcribe scanned PDF pages, caption images
      const visual = assets.filter((a) => a.needsVision && a.dataUrl);
      for (const a of visual) {
        log(`AI reading: ${a.name}…`);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings,
            imageDataUrl: a.dataUrl,
            instruction:
              a.kind === "pdf-page"
                ? "This is a page from a student's document that has no extractable text. Transcribe ALL visible text content faithfully, preserving structure (headings, lists, tables). If it is mostly a diagram, describe it precisely instead."
                : "Describe this image precisely and concisely: what it shows, any visible text, diagrams or data. This will be used to teach a student.",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Vision transcription failed.");
        a.text = data.text;
        a.needsVision = false;
      }

      // 3. Call #1 — build the full subject: lessons + coverage + chosen sources (with why)
      log("Planning your course…");
      const res = await fetch("/api/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, manifest: buildManifest(assets), focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Course generation failed.");
      const course: Course = data.course;
      const totalCov = course.lessons.reduce((n, l) => n + l.coverage.length, 0);
      log(`Plan ready: ${course.lessons.length} lessons · ${totalCov} coverage slides.`);

      // 4. Call #2 — the visual loop: one request per coverage, with veto + used-ledger
      const usedSourceIds: number[] = [];
      const recentVisuals: string[] = [];
      let done = 0;
      for (const lesson of course.lessons) {
        for (const cov of lesson.coverage) {
          done++;
          log(`Visual ${done}/${totalCov}: "${cov.title}"`);
          const sourceItems = cov.source
            .map((s) => assets.find((a) => a.index === s.assetId))
            .filter((a): a is Asset => Boolean(a))
            .map((a) => ({
              assetId: a.index,
              name: a.name,
              dataUrl: a.dataUrl,
              text: a.text ? a.text.slice(0, 1500) : undefined,
            }));

          const vres = await fetch("/api/generate-visual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              settings,
              courseMap: {
                title: course.title,
                lessons: course.lessons.map((l) => ({
                  id: l.id,
                  title: l.title,
                  coverage: l.coverage.map((c) => c.title),
                })),
              },
              lessonTitle: lesson.title,
              coverage: { id: cov.id, title: cov.title, content: cov.content, source: cov.source },
              sourceItems,
              usedSourceIds,
              recentVisuals,
            }),
          });
          const vdata = await vres.json();
          if (!vres.ok) throw new Error(vdata.error || "Visual generation failed.");
          cov.visual = vdata.visual;

          for (const s of cov.source) {
            if (!usedSourceIds.includes(s.assetId)) usedSourceIds.push(s.assetId);
          }
          const cap = cov.visual?.html?.caption;
          if (cap) {
            recentVisuals.push(cap);
            if (recentVisuals.length > 3) recentVisuals.shift();
          }
        }
      }
      log("Course ready!");

      // 5. Persist & navigate
      await idbSet("assets", assets);
      window.localStorage.setItem("docsum.course.v2", JSON.stringify(course));
      window.localStorage.removeItem("docsum.progress");
      router.push("/learn");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* ambient background */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />

      <button
        onClick={() => setShowSettings(true)}
        className="absolute right-5 top-5 rounded-lg border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
        title="AI provider settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <div className="relative w-full max-w-xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Doc<span className="text-accent">Sum</span>
        </h1>
        <p className="mt-3 text-slate-400">
          Upload your subject&apos;s documents — the AI turns them into a step-by-step interactive course.
        </p>

        {/* upload box */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`mt-8 cursor-pointer rounded-2xl border-2 border-dashed p-10 transition ${
            dragOver
              ? "border-accent bg-accent/10"
              : "border-white/15 bg-white/[0.03] hover:border-white/30"
          }`}
        >
          <div className="text-4xl">📄</div>
          <p className="mt-3 font-medium text-white">Drop your documents here</p>
          <p className="mt-1 text-sm text-slate-400">
            PDF, images, TXT, Markdown or code files — or click to browse
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* selected files */}
        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1.5 text-xs text-slate-200"
              >
                {f.name.length > 32 ? f.name.slice(0, 29) + "…" : f.name}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((prev) => prev.filter((_, j) => j !== i));
                  }}
                  className="rounded-full px-1.5 text-slate-500 transition hover:text-white"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* focus prompt */}
        <textarea
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="What do you want to focus on? (optional) — e.g. “Focus on chapters 2–4, skip the history”"
          rows={2}
          className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-accent"
        />

        <button
          onClick={start}
          disabled={files.length === 0 || busy}
          className="mt-4 w-full rounded-xl bg-accent py-3 font-semibold text-white transition enabled:hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Working…" : "Start learning →"}
        </button>

        {/* status / errors */}
        {logs.length > 0 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-left font-mono text-xs text-slate-400">
            {logs.map((l, i) => (
              <div key={i} className="truncate">
                <span className="text-accent">›</span> {l}
              </div>
            ))}
            {busy && (
              <div className="mt-1 flex gap-1 px-1">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: "0.2s" }} />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: "0.4s" }} />
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  );
}
