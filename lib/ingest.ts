import type { Asset, AssetKind } from "./types";

const TEXT_EXTS = new Set(["txt", "md", "markdown", "csv", "log", "rst"]);
const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "py", "java", "c", "h", "cpp", "hpp", "cs", "go",
  "rb", "rs", "php", "html", "htm", "css", "scss", "sql", "sh", "bat", "ps1",
  "yml", "yaml", "xml", "json", "kt", "swift", "dart", "lua", "ipynb", "vue", "svelte",
]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function classifyFile(file: File): AssetKind | "pdf" | "unsupported" {
  const ext = extOf(file.name);
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (TEXT_EXTS.has(ext)) return "text";
  if (CODE_EXTS.has(ext)) return "code";
  if (file.type.startsWith("text/")) return "text";
  return "unsupported";
}

export function isSupported(file: File): boolean {
  return classifyFile(file) !== "unsupported";
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}

/**
 * Client-side ingestion:
 * - txt / code files -> text assets
 * - images -> visual assets (vision-captioned later)
 * - PDFs -> one asset per page; text pages extracted directly,
 *   pages with no extractable text are rendered to JPEG (vision-transcribed later).
 */
export async function ingestFiles(
  files: File[],
  onStatus?: (msg: string) => void
): Promise<Asset[]> {
  const assets: Asset[] = [];
  let index = 0;

  for (const file of files) {
    const kind = classifyFile(file);
    if (kind === "unsupported") {
      onStatus?.(`Skipped (unsupported): ${file.name}`);
      continue;
    }

    if (kind === "pdf") {
      onStatus?.(`Extracting PDF: ${file.name}`);
      const pages = await ingestPdf(file, () => index++, onStatus);
      assets.push(...pages);
    } else if (kind === "image") {
      onStatus?.(`Reading image: ${file.name}`);
      assets.push({
        index: index++,
        name: file.name,
        kind: "image",
        mime: file.type || "image/png",
        dataUrl: await fileToDataUrl(file),
        needsVision: true, // captioned by the vision model so the planner knows what it shows
      });
    } else {
      onStatus?.(`Reading ${kind} file: ${file.name}`);
      assets.push({
        index: index++,
        name: file.name,
        kind: kind === "code" ? "code" : "text",
        mime: "text/plain",
        text: await file.text(),
      });
    }
  }
  return assets;
}

async function ingestPdf(
  file: File,
  nextIndex: () => number,
  onStatus?: (msg: string) => void
): Promise<Asset[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: Asset[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    onStatus?.(`Extracting PDF: ${file.name} (page ${p}/${doc.numPages})`);
    const page = await doc.getPage(p);

    const tc = await page.getTextContent();
    const text = (tc.items as Array<{ str?: string }>)
      .map((it) => it.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Render EVERY page to an image so any page can be displayed as a scrollable source.
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1500 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    await page.render({ canvasContext: ctx, viewport } as never).promise;

    out.push({
      index: nextIndex(),
      name: `${file.name} · page ${p}`,
      kind: "pdf-page",
      mime: "image/jpeg",
      dataUrl: canvas.toDataURL("image/jpeg", 0.82),
      text: text.length >= 40 ? text : undefined,
      needsVision: text.length < 40,
    });
  }

  return out;
}

/** Compact manifest (no data URLs) that is sent to the course generator. */
export function buildManifest(assets: Asset[]) {
  return {
    assets: assets.map((a) => ({
      index: a.index,
      name: a.name,
      kind: a.kind,
      hasVisual: Boolean(a.dataUrl),
      text: a.text ? a.text.slice(0, 6000) : undefined,
    })),
  };
}
