export type AssetKind = "image" | "pdf-page" | "text" | "code";

/** One uploaded/referenced piece of material. Assets are indexed (0,1,2...) so the AI can reference them. */
export interface Asset {
  index: number;
  name: string;
  kind: AssetKind;
  mime: string;
  /** data URL — every PDF page is rendered to an image so any page can be a slide source */
  dataUrl?: string;
  /** extracted text, vision transcription, or caption */
  text?: string;
  /** true until the vision model has transcribed/captioned it */
  needsVision?: boolean;
}

/** What the course generator sees (no heavy data URLs). */
export interface CourseAssetInfo {
  index: number;
  name: string;
  kind: AssetKind;
  text?: string;
  hasVisual: boolean;
}

/** A source page the AI chose to display on a coverage slide — always with its forced reasoning. */
export interface SourceRef {
  assetId: number;
  why: string;
}

/** Call #2 verdict: what the slide shows and why. */
export interface VisualResult {
  showSource: boolean;
  layout: "source-primary" | "visual-primary" | "split";
  why: string;
  html?: { html: string; css?: string; caption?: string };
}

/** Lesson → Coverage. Each coverage = its own text + chosen scrollable source page(s) + why + generated visual. */
export interface Coverage {
  id: string;
  title: string;
  order: number;
  /** markdown narration displayed in the chat panel */
  content: string;
  /** 0–3 source pages chosen by the AI, each with a mandatory "why" */
  source: SourceRef[];
  /** true when an AI-generated graphic would help beyond the source pages */
  needsVisual: boolean;
  /** filled by the per-coverage visual loop (call #2) */
  visual?: VisualResult;
}

export interface Lesson {
  id: string;
  title: string;
  intro: string;
  coverage: Coverage[];
}

export interface Course {
  title: string;
  subtitle: string;
  lessons: Lesson[];
}

/** Connection to any OpenAI-compatible provider. */
export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** optional separate vision model; falls back to `model` */
  visionModel?: string;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}
