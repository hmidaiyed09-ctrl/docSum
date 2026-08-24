import { idbDel, idbGet, idbSet } from "./idb";
import type { Asset, Course } from "./types";

/**
 * Course library — lets the student save every generated course (the "workflow")
 * and come back to it later. Heavy data (course JSON, assets, progress) lives in
 * IndexedDB under per-course keys; a lightweight index lives under `library`.
 */
export interface LibraryEntry {
  id: string;
  title: string;
  subtitle: string;
  createdAt: number;
  updatedAt: number;
}

const LIB_KEY = "library";

export async function getLibrary(): Promise<LibraryEntry[]> {
  return (await idbGet<LibraryEntry[]>(LIB_KEY)) ?? [];
}

export async function saveCourseToLibrary(course: Course, assets: Asset[]): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const entry: LibraryEntry = {
    id,
    title: course.title,
    subtitle: course.subtitle,
    createdAt: now,
    updatedAt: now,
  };
  await idbSet(`course:${id}`, course);
  await idbSet(`assets:${id}`, assets);
  await idbSet(`progress:${id}`, 0);
  await idbSet(LIB_KEY, [entry, ...(await getLibrary())]);
  return id;
}

export async function loadCourse(
  id: string
): Promise<{ course: Course; assets: Asset[]; progress: number } | null> {
  const course = await idbGet<Course>(`course:${id}`);
  if (!course) return null;
  const assets = (await idbGet<Asset[]>(`assets:${id}`)) ?? [];
  const progress = (await idbGet<number>(`progress:${id}`)) ?? 0;
  return { course, assets, progress };
}

export async function saveProgress(id: string, stepIdx: number): Promise<void> {
  await idbSet(`progress:${id}`, stepIdx);
}

export async function deleteCourse(id: string): Promise<void> {
  await idbSet(LIB_KEY, (await getLibrary()).filter((e) => e.id !== id));
  await idbDel(`course:${id}`);
  await idbDel(`assets:${id}`);
  await idbDel(`progress:${id}`);
}

/** One-time migration: move the pre-library single course into the library. */
export async function migrateLegacy(): Promise<void> {
  if (typeof window === "undefined") return;
  const lib = await getLibrary();
  if (lib.length > 0) return;
  const raw = window.localStorage.getItem("docsum.course.v2");
  if (!raw) return;
  try {
    const course = JSON.parse(raw) as Course;
    const assets = (await idbGet<Asset[]>("assets")) ?? [];
    const progress = Number(window.localStorage.getItem("docsum.progress") ?? 0);
    const id = crypto.randomUUID();
    const now = Date.now();
    await idbSet(`course:${id}`, course);
    await idbSet(`assets:${id}`, assets);
    await idbSet(`progress:${id}`, progress);
    await idbSet(LIB_KEY, [
      { id, title: course.title, subtitle: course.subtitle, createdAt: now, updatedAt: now },
    ]);
    window.localStorage.removeItem("docsum.course.v2");
    window.localStorage.removeItem("docsum.progress");
  } catch {
    /* corrupt legacy data — ignore */
  }
}
