import { spawn } from "node:child_process";
import path from "node:path";
import { isDisplayableImageUrl, normalizeAssetUrl } from "@/lib/assets";
import type { NotebookSource, NotebookSourceImage } from "@/lib/types";
import { newId } from "../repositories/memoryStore";

export type NotebookProvider = "extractive" | "ollama" | "hf_local" | "openai_compatible";

export interface NotebookFilters {
  lesson_id?: string;
  subject?: string;
  subject_label?: string;
  class_level?: number;
}

interface BridgeEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  kind?: string;
  traceback?: string;
}

interface NotebookAnswerPayload {
  answer: string;
  chunks?: NotebookSource[];
  citations?: Array<{
    source_index: number;
    source_marker: string;
    filename: string;
    page: number;
    section?: string | null;
    chunk_id?: string | null;
    lesson_title?: string | null;
  }>;
  provider?: string;
  model?: string | null;
}

interface NotebookQuizItem {
  question?: string;
  options?: string[];
  correct_index?: number;
  explanation?: string;
  source_markers?: string[];
  images?: NotebookSourceImage[];
  evidence?: {
    text?: string;
    images?: NotebookSourceImage[];
    sources?: unknown[];
  };
}

interface NotebookQuizPayload {
  items?: NotebookQuizItem[];
  chunks?: NotebookSource[];
  provider?: string;
  model?: string | null;
}

interface NotebookFlashcardItem {
  front?: string;
  back?: string;
  hint?: string;
  source_markers?: string[];
  images?: NotebookSourceImage[];
  evidence?: {
    text?: string;
    images?: NotebookSourceImage[];
    sources?: unknown[];
  };
}

interface NotebookFlashcardPayload {
  cards?: NotebookFlashcardItem[];
  chunks?: NotebookSource[];
  provider?: string;
  model?: string | null;
}

interface NotebookSummaryPayload {
  target?: string | null;
  summary?: string;
  key_points?: string[];
  visuals?: NotebookSourceImage[];
  chunks?: NotebookSource[];
  provider?: string;
  model?: string | null;
}

const APP_DIR = process.cwd();
const BRIDGE_PATH = path.join(APP_DIR, "scripts", "notebooklm_bridge.py");
const PYTHON_BIN = process.env.PYTHON_BIN || process.env.PYTHON || "python";
const HTTP_BASE = process.env.NOTEBOOKLM_HTTP_URL || "http://127.0.0.1:8020";

function parseBridgeOutput<T>(stdout: string): BridgeEnvelope<T> {
  const trimmed = stdout.trim();
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => line.startsWith("{") && line.endsWith("}")) || trimmed;
  return JSON.parse(jsonLine) as BridgeEnvelope<T>;
}

// Preferred transport: the long-running Simple NotebookLM FastAPI server on port
// 8020 (scripts/serve.py). Reusing one warm Python process avoids the cold-start
// + model-load cost of spawning the bridge per request.
//
// We never require the user to start it manually: every call first does a cheap
// /health check (a few ms on localhost) and, if nothing is listening on 8020,
// spawns the server as a child process and waits until it answers before
// sending the request. Concurrent callers share the same start promise so we
// never launch two servers.

async function isNotebookServerUp(timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${HTTP_BASE}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function startNotebookServer(): Promise<boolean> {
  const notebookRoot = process.env.NOTEBOOKLM_ROOT || path.resolve(APP_DIR, "..", "notebooklm");
  const child = spawn(
    PYTHON_BIN,
    [
      path.join(notebookRoot, "scripts", "serve.py"),
      "--config", path.join(notebookRoot, "config.yaml"),
      "--host", "127.0.0.1",
      "--port", "8020"
    ],
    {
      cwd: notebookRoot,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  child.on("error", (error) => console.warn("NotebookLM auto-start spawn error:", error.message));

  // FastAPI answers /health as soon as the process is up (model warm-up happens
  // lazily on the first real request, which we tolerate via the long timeout).
  const deadline = Date.now() + 90_000;
  const waitReady = async (): Promise<boolean> => {
    if (await isNotebookServerUp(1500)) return true;
    if (Date.now() > deadline) {
      console.warn("NotebookLM auto-start: server not ready within 90s.");
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return waitReady();
  };
  return waitReady();
}

async function ensureNotebookServer(): Promise<boolean> {
  if (await isNotebookServerUp()) return true;
  if (!serverStartPromise) {
    console.log("NotebookLM server not running — auto-starting on port 8020…");
    serverStartPromise = startNotebookServer().finally(() => {
      serverStartPromise = null;
    });
  }
  return serverStartPromise;
}

let serverStartPromise: Promise<boolean> | null = null;

export async function callNotebookHttp<T>(action: string, body: Record<string, unknown> = {}, timeoutMs = 520_000): Promise<T> {
  const ready = await ensureNotebookServer();
  if (!ready) {
    throw new Error("NotebookLM server (port 8020) could not be started; using fallback.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${HTTP_BASE}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`NotebookLM server ${response.status} on /${action}${detail ? `: ${detail}` : ""}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// Fallback: spawn the Python bridge directly (cold start per request).
export function callNotebookBridge<T>(action: string, body: Record<string, unknown> = {}, timeoutMs = 420_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [BRIDGE_PATH, action], {
      cwd: APP_DIR,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1"
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`NotebookLM bridge timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const envelope = parseBridgeOutput<T>(stdout);
        if (!envelope.ok || !envelope.data) {
          reject(new Error(envelope.error || stderr || `NotebookLM bridge exited with code ${code}`));
          return;
        }
        resolve(envelope.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reject(new Error(`${message}${stderr ? `\n${stderr}` : ""}`));
      }
    });

    child.stdin.end(JSON.stringify(body));
  });
}

function cleanMarkdown(value?: string | null): string {
  return String(value || "").trim();
}

function imageCaption(image: NotebookSourceImage, fallback = "Ảnh SGK") {
  return (
    image.derivedCaption ||
    image.caption ||
    image.label ||
    (image.page || image.page_number ? `Trang ${image.page || image.page_number}` : fallback)
  );
}

function toImageRefs(images?: NotebookSourceImage[] | null) {
  const seen = new Set<string>();
  return (images || [])
    .map((image) => ({
      url: normalizeAssetUrl(image.url || image.path),
      caption: imageCaption(image)
    }))
    .filter((image) => isDisplayableImageUrl(image.url))
    .filter((image) => {
      if (seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    })
    .slice(0, 4);
}

function firstSourceImages(sources?: NotebookSource[]) {
  const images: NotebookSourceImage[] = [];
  for (const source of sources || []) {
    images.push(...(source.images || []));
    if (images.length >= 4) break;
  }
  return images;
}

function buildRequestBody(input: {
  query?: string | null;
  count?: number;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}): Record<string, unknown> {
  return {
    query: input.query ?? null,
    count: input.count,
    topK: input.topK || 10,
    filters: input.filters || undefined,
    provider: input.provider || "openai_compatible"
  };
}

export async function answerNotebookWithBridge(input: {
  query: string;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  return callNotebookBridge<NotebookAnswerPayload>(
    "ask",
    buildRequestBody(input),
    420_000
  );
}

function mapQuizPayload(payload: NotebookQuizPayload) {
  const chunks = payload.chunks || [];
  const questions = (payload.items || [])
    .filter((item) => item.question && Array.isArray(item.options) && item.options.length >= 4)
    .map((item, index) => {
      const prompt = cleanMarkdown(item.question).replace(/^Câu\s+\d+\.\s*/iu, "");
      const images = toImageRefs(item.images?.length ? item.images : item.evidence?.images);
      return {
        id: newId("q"),
        prompt: `Câu ${index + 1}. ${prompt}`,
        explanation: cleanMarkdown(item.explanation || item.evidence?.text),
        sourceMarkers: item.source_markers || [],
        imageRefs: images,
        options: item.options!.slice(0, 4).map((text, optionIndex) => ({
          id: newId("opt"),
          label: String.fromCharCode(65 + optionIndex),
          text,
          isCorrect: optionIndex === Number(item.correct_index || 0)
        }))
      };
    });
  return { questions, chunks, provider: payload.provider || "openai_compatible", model: payload.model };
}

function mapFlashcardPayload(payload: NotebookFlashcardPayload) {
  const chunks = payload.chunks || [];
  const cards = (payload.cards || [])
    .filter((card) => card.front && card.back)
    .map((card) => ({
      id: newId("card"),
      front: cleanMarkdown(card.front).replace(/^Bài\s+\d+[^:]*:\s*/iu, ""),
      back: cleanMarkdown(card.back),
      hint: cleanMarkdown(card.hint) || undefined,
      imageRefs: toImageRefs(card.images?.length ? card.images : card.evidence?.images)
    }));
  return { cards, chunks, provider: payload.provider || "openai_compatible", model: payload.model };
}

function mapSummaryPayload(payload: NotebookSummaryPayload) {
  const chunks = payload.chunks || [];
  const title = cleanMarkdown(payload.target) || chunks[0]?.metadata?.lesson_title || "Tóm tắt bài học";
  const markdown = cleanMarkdown(payload.summary) || "Chưa tạo được tóm tắt từ nguồn đã chọn.";
  return {
    result: {
      id: newId("summary"),
      title,
      markdown,
      keyPoints: payload.key_points || [],
      imageRefs: toImageRefs(payload.visuals?.length ? payload.visuals : firstSourceImages(chunks))
    },
    chunks,
    provider: payload.provider || "openai_compatible",
    model: payload.model
  };
}

export async function generateNotebookQuizWithBridge(input: {
  query?: string;
  count?: number;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  const payload = await callNotebookBridge<NotebookQuizPayload>(
    "quiz",
    {
      query: input.query || null,
      count: input.count || 6,
      topK: input.topK || 5,
      filters: input.filters || undefined,
      provider: input.provider || "openai_compatible"
    },
    520_000
  );
  return mapQuizPayload(payload);
}

export async function generateNotebookFlashcardsWithBridge(input: {
  query?: string;
  count?: number;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  const payload = await callNotebookBridge<NotebookFlashcardPayload>(
    "flashcards",
    {
      query: input.query || null,
      count: input.count || undefined,
      topK: input.topK || 10,
      filters: input.filters || undefined,
      provider: input.provider || "openai_compatible"
    },
    520_000
  );
  return mapFlashcardPayload(payload);
}

export async function generateNotebookSummaryWithBridge(input: {
  query?: string;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  const payload = await callNotebookBridge<NotebookSummaryPayload>(
    "summarize",
    {
      query: input.query || null,
      topK: input.topK || 10,
      filters: input.filters || undefined,
      provider: input.provider || "openai_compatible"
    },
    520_000
  );
  return mapSummaryPayload(payload);
}

// HTTP variants: talk to the long-running Simple NotebookLM FastAPI server (port
// 8020) instead of spawning Python per request.
export async function answerNotebookWithHttp(input: {
  query: string;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  return callNotebookHttp<NotebookAnswerPayload>("ask", buildRequestBody(input));
}

export async function generateNotebookQuizWithHttp(input: {
  query?: string;
  count?: number;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  const payload = await callNotebookHttp<NotebookQuizPayload>(
    "quiz",
    {
      query: input.query || null,
      count: input.count || 6,
      topK: input.topK || 5,
      filters: input.filters || undefined,
      provider: input.provider || "openai_compatible"
    }
  );
  return mapQuizPayload(payload);
}

export async function generateNotebookFlashcardsWithHttp(input: {
  query?: string;
  count?: number;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  const payload = await callNotebookHttp<NotebookFlashcardPayload>(
    "flashcards",
    {
      query: input.query || null,
      count: input.count || undefined,
      topK: input.topK || 10,
      filters: input.filters || undefined,
      provider: input.provider || "openai_compatible"
    }
  );
  return mapFlashcardPayload(payload);
}

export async function generateNotebookSummaryWithHttp(input: {
  query?: string;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: NotebookProvider;
}) {
  const payload = await callNotebookHttp<NotebookSummaryPayload>(
    "summarize",
    {
      query: input.query || null,
      topK: input.topK || 10,
      filters: input.filters || undefined,
      provider: input.provider || "openai_compatible"
    }
  );
  return mapSummaryPayload(payload);
}
