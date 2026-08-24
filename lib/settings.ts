import type { AISettings } from "./types";

const KEY = "docsum.settings";

export const DEFAULT_SETTINGS: AISettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  visionModel: "",
};

export function loadSettings(): AISettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AISettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AISettings) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function visionModelOf(s: AISettings): string {
  return s.visionModel && s.visionModel.trim() ? s.visionModel.trim() : s.model;
}
