"use client";

import { useState } from "react";
import type { AISettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const PRESETS: Array<{ label: string; baseUrl: string; model: string }> = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", model: "llama3.2-vision" },
  { label: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", model: "local-model" },
];

export default function SettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: AISettings;
  onSave: (s: AISettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AISettings>(settings);

  const set = (patch: Partial<AISettings>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="fade-up w-full max-w-lg rounded-2xl border border-white/10 bg-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">AI Provider Settings</h2>
          <button onClick={onClose} className="text-slate-400 transition hover:text-white">
            ✕
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-400">
          DocSum works with any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Ollama, LM Studio…).
          Keys are stored only in your browser and sent only to your own backend routes.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set({ baseUrl: p.baseUrl, model: p.model })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                draft.baseUrl === p.baseUrl
                  ? "border-accent bg-accent/20 text-white"
                  : "border-white/15 text-slate-300 hover:border-white/40"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Base URL</span>
            <input
              value={draft.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">API Key</span>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder="(leave empty for local providers)"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Model</span>
            <input
              value={draft.model}
              onChange={(e) => set({ model: e.target.value })}
              placeholder="gpt-4o"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">
              Vision model <span className="text-slate-500">(optional — used to read images / scanned PDF pages)</span>
            </span>
            <input
              value={draft.visionModel ?? ""}
              onChange={(e) => set({ visionModel: e.target.value })}
              placeholder="defaults to the model above"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setDraft({ ...DEFAULT_SETTINGS })}
            className="text-sm text-slate-400 transition hover:text-white"
          >
            Reset defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-deep"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
