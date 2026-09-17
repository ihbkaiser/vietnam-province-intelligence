import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Flashcard, QuizQuestion, SummaryResult } from "@/lib/types";
import { newId } from "../repositories/memoryStore";

type Provider = "extractive" | "openai_compatible";
type LlmQuizItem = { question: string; options: string[]; correct_index: number; explanation?: string; source_markers?: string[] };
type LlmSummary = { title?: string; markdown?: string; key_points?: string[] };

export interface LessonRecord {
  lesson_id: string;
  lesson_title: string;
  subject: string;
  subject_label: string;
  lesson_number: number | null;
  start_page?: number;
  end_page?: number;
  chunk_count: number;
  class_level?: number;
}

interface RawChunk {
  doc_id: string;
  text: string;
  metadata: Record<string, unknown>;
  images?: Array<Record<string, unknown>>;
}

export interface NotebookChunk {
  id: string;
  text: string;
  snippet: string;
  score: number;
  metadata: {
    filename?: string;
    page?: number;
    chunk_id?: string;
    section?: string | null;
    class_level?: number;
    subject?: string;
    subject_label?: string;
    lesson_id?: string | null;
    lesson_title?: string | null;
    lesson_number?: number | null;
  };
  images: Array<{
    id?: string;
    path?: string;
    label?: string;
    caption?: string | null;
    page_number?: number;
    url?: string;
  }>;
}

export interface NotebookFilters {
  lesson_id?: string;
  subject?: string;
  subject_label?: string;
  class_level?: number;
}

const ROOT_DIR = path.resolve(process.cwd(), "..");
const NOTEBOOK_STORAGE_DIR = path.join(ROOT_DIR, "notebooklm", "storage", "class_6");
const EXTRACTED_DIR = path.join(ROOT_DIR, "extracted", "class_6_phase1_local_cpu_full");
const DOCS_PATH = path.join(NOTEBOOK_STORAGE_DIR, "documents.jsonl");
const LESSONS_PATH = path.join(NOTEBOOK_STORAGE_DIR, "lessons.json");
const LESSON_CLASS_LEVEL = Number(/class_(\d+)/.exec(NOTEBOOK_STORAGE_DIR)?.[1] || 6);
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash-0731";
const MOJIBAKE_MARKERS = ["Ã", "Â", "Ä", "áº", "á»", "ï¿½"];
const CP1252_REVERSE = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f]
]);

let cachedLessons: LessonRecord[] | null = null;
let cachedChunks: NotebookChunk[] | null = null;
let cachedEnv: Record<string, string> | null = null;

function mojibakeScore(value: string): number {
  const markerScore = MOJIBAKE_MARKERS.reduce((sum, marker) => sum + value.split(marker).length - 1, 0);
  const replacementScore = (value.match(/\uFFFD/g) || []).length * 4;
  const controlScore = (value.match(/[\u0080-\u009f]/g) || []).length * 2;
  return markerScore + replacementScore + controlScore;
}

function decodeCp1252AsUtf8(value: string): string | null {
  const bytes: number[] = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) return null;
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }
    const mapped = CP1252_REVERSE.get(codePoint);
    if (mapped === undefined) return null;
    bytes.push(mapped);
  }
  return Buffer.from(bytes).toString("utf8");
}

function maybeRepair(value: string): string {
  let current = value;
  for (let index = 0; index < 5; index += 1) {
    const currentScore = mojibakeScore(current);
    if (currentScore === 0) break;
    try {
      const repaired = decodeCp1252AsUtf8(current);
      if (!repaired) break;
      const repairedScore = mojibakeScore(repaired);
      if (repairedScore >= currentScore) break;
      current = repaired;
    } catch {
      break;
    }
  }
  return current;
}

function repairDeep<T>(value: T): T {
  if (typeof value === "string") return maybeRepair(value) as T;
  if (Array.isArray(value)) return value.map((item) => repairDeep(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairDeep(item)])) as T;
  }
  return value;
}

function textOnly(value: string): string {
  return maybeRepair(value)
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string, maxChars = 520): string {
  const clean = textOnly(value);
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 1).trim()}...`;
}

function normalize(value: string): string {
  return textOnly(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  return repairDeep(JSON.parse(readFileSync(filePath, "utf8"))) as T;
}

function readJsonl(filePath: string): RawChunk[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => repairDeep(JSON.parse(line)) as RawChunk);
}

function readDotEnv(): Record<string, string> {
  if (cachedEnv) return cachedEnv;
  const paths = [path.join(ROOT_DIR, ".env"), path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")];
  const values: Record<string, string> = {};
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      values[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
  cachedEnv = values;
  return values;
}

function envValue(name: string): string | undefined {
  return process.env[name] || readDotEnv()[name];
}

function imageToPublicUrl(imagePath?: string): string | undefined {
  if (!imagePath) return undefined;
  const clean = imagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolute = path.join(EXTRACTED_DIR, clean);
  if (!existsSync(absolute)) return undefined;
  try {
    if (statSync(absolute).size < 4000) return undefined;
  } catch {
    return undefined;
  }
  return `/api/source-assets/${clean.split("/").map(encodeURIComponent).join("/")}`;
}

function toChunk(raw: RawChunk): NotebookChunk {
  const metadata = raw.metadata || {};
  const images = (raw.images || [])
    .map((image) => {
      const imagePath = typeof image.path === "string" ? image.path : undefined;
      return {
        id: typeof image.id === "string" ? image.id : undefined,
        path: imagePath,
        label: typeof image.label === "string" ? image.label : undefined,
        caption: typeof image.caption === "string" ? image.caption : null,
        page_number: typeof image.page_number === "number" ? image.page_number : undefined,
        url: imageToPublicUrl(imagePath)
      };
    })
    .filter((image) => image.url);
  const text = textOnly(raw.text || "");
  return {
    id: raw.doc_id,
    text,
    snippet: compact(text),
    score: 0,
    metadata: {
      filename: typeof metadata.filename === "string" ? metadata.filename : undefined,
      page: typeof metadata.page === "number" ? metadata.page : undefined,
      chunk_id: typeof metadata.chunk_id === "string" ? metadata.chunk_id : raw.doc_id,
      section: typeof metadata.section === "string" ? metadata.section : null,
      class_level: typeof metadata.class_level === "number" ? metadata.class_level : 6,
      subject: typeof metadata.subject === "string" ? metadata.subject : undefined,
      subject_label: typeof metadata.subject_label === "string" ? metadata.subject_label : undefined,
      lesson_id: typeof metadata.lesson_id === "string" ? metadata.lesson_id : null,
      lesson_title: typeof metadata.lesson_title === "string" ? metadata.lesson_title : null,
      lesson_number: typeof metadata.lesson_number === "number" ? metadata.lesson_number : null
    },
    images
  };
}

export function listNotebookLessons(): LessonRecord[] {
  if (!cachedLessons) {
    cachedLessons = readJson<LessonRecord[]>(LESSONS_PATH, []).map((lesson) => ({
      ...lesson,
      class_level: lesson.class_level || LESSON_CLASS_LEVEL
    }));
  }
  return cachedLessons;
}

export function listNotebookChunks(): NotebookChunk[] {
  if (!cachedChunks) cachedChunks = readJsonl(DOCS_PATH).map(toChunk);
  return cachedChunks;
}

function matchesFilters(chunk: NotebookChunk, filters?: NotebookFilters | null): boolean {
  if (!filters) return true;
  if (filters.lesson_id && chunk.metadata.lesson_id !== filters.lesson_id) return false;
  if (filters.class_level && chunk.metadata.class_level !== filters.class_level) return false;
  if (filters.subject && chunk.metadata.subject !== filters.subject && chunk.metadata.subject_label !== filters.subject) return false;
  if (filters.subject_label && chunk.metadata.subject_label !== filters.subject_label) return false;
  return true;
}

export function searchNotebook(query: string, topK = 10, filters?: NotebookFilters | null): NotebookChunk[] {
  const queryTokens = tokens(query);
  const phrase = normalize(query);
  const source = listNotebookChunks().filter((chunk) => matchesFilters(chunk, filters));
  if (!queryTokens.length) return source.slice(0, topK).map((chunk) => ({ ...chunk, score: 1 }));
  const uniqueTokens = [...new Set(queryTokens)];
  return source
    .map((chunk) => {
      const haystack = normalize(`${chunk.metadata.lesson_title || ""} ${chunk.text}`);
      let score = phrase && haystack.includes(phrase) ? 8 : 0;
      for (const token of uniqueTokens) {
        const hits = haystack.split(token).length - 1;
        if (hits) score += Math.min(4, hits) + (token.length >= 6 ? 1 : 0);
      }
      if (filters?.lesson_id && chunk.metadata.lesson_id === filters.lesson_id) score += 3;
      score -= Math.min(8, mojibakeScore(chunk.text));
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || (a.metadata.page || 0) - (b.metadata.page || 0))
    .slice(0, topK);
}

function contextFromChunks(chunks: NotebookChunk[], maxChars = 9000): string {
  let used = 0;
  const parts: string[] = [];
  chunks.forEach((chunk, index) => {
    const imageLines = chunk.images
      .slice(0, 4)
      .map((image) => `- ${image.label || image.id || "image"}: ${image.caption || ""}`.trim())
      .join("\n");
    let block = `[S${index + 1}] Trang ${chunk.metadata.page || "?"} | ${chunk.metadata.lesson_title || "SGK"}\n${chunk.text}`;
    if (imageLines) block += `\nẢnh liên quan:\n${imageLines}`;
    if (used + block.length > maxChars) return;
    used += block.length;
    parts.push(block);
  });
  return maybeRepair(parts.join("\n\n---\n\n"));
}

async function callOpenRouterText(prompt: string, jsonMode = false): Promise<string | null> {
  const apiKey = envValue("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const model = envValue("OPENROUTER_MODEL") || envValue("OPENAI_MODEL") || DEFAULT_OPENROUTER_MODEL;
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://127.0.0.1:3020",
      "X-Title": "EduGeo AI"
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 2400,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      messages: [
        {
          role: "system",
          content:
            "Bạn là trợ lý giáo dục tiếng Việt. Chỉ dùng thông tin trong ngữ cảnh SGK được cung cấp. Viết rõ ràng, đúng Markdown, không bịa ngoài tài liệu."
        },
        { role: "user", content: maybeRepair(prompt) }
      ]
    })
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return maybeRepair(payload.choices?.[0]?.message?.content?.trim() || "") || null;
}

function parseJsonObject<T>(text: string | null): T | null {
  if (!text) return null;
  const repaired = maybeRepair(text);
  const fenced = repaired.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || repaired;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")) as T;
  } catch {
    return null;
  }
}

function splitSentences(text: string): string[] {
  return textOnly(text)
    .split(/(?<=[.!?])\s+|(?<=\.)\s+(?=[A-ZÀ-ỴĐ])/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 35 && mojibakeScore(item) <= 2);
}

function sourceMarkers(chunks: NotebookChunk[]): string[] {
  return chunks.map((_chunk, index) => `S${index + 1}`);
}

function selectImages(chunks: NotebookChunk[], query: string, limit = 2) {
  const queryNorm = normalize(query);
  const selected: Array<{ url: string; caption: string }> = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    for (const image of chunk.images) {
      if (!image.url || seen.has(image.url)) continue;
      const caption = image.caption || image.label || `Trang ${image.page_number || chunk.metadata.page}`;
      const imageText = normalize(caption);
      const visualCue = /hinh|ban do|luoc do|so do|bieu do|ti le|ki hieu|dia hinh|khoang cach/.test(queryNorm);
      const score = queryNorm
        .split(/\s+/)
        .filter((token) => token.length >= 4 && imageText.includes(token)).length;
      if (score > 0 || visualCue) {
        selected.push({ url: image.url, caption: `Trang ${chunk.metadata.page || image.page_number || "?"}: ${caption}` });
        seen.add(image.url);
      }
      if (selected.length >= limit) return selected;
    }
  }
  return selected;
}

function extractiveAnswer(question: string, chunks: NotebookChunk[]): string {
  const querySet = new Set(tokens(question));
  const ranked = chunks
    .flatMap((chunk, chunkIndex) =>
      splitSentences(chunk.text).map((sentence) => {
        const overlap = tokens(sentence).filter((token) => querySet.has(token)).length;
        return { sentence, overlap, chunkIndex, page: chunk.metadata.page };
      })
    )
    .sort((a, b) => b.overlap - a.overlap || a.chunkIndex - b.chunkIndex);
  const picked = ranked.filter((item) => item.overlap > 0).slice(0, 4);
  const answer = picked.length ? picked.map((item) => item.sentence).join(" ") : chunks.slice(0, 2).map((chunk) => chunk.snippet).join(" ");
  const pages = [...new Set(chunks.slice(0, 4).map((chunk) => chunk.metadata.page).filter(Boolean))].join(", ");
  return `${answer}\n\n**Nguồn:** SGK trang ${pages || "liên quan"}.`;
}

export async function answerNotebook(input: {
  query: string;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: Provider;
}) {
  const chunks = searchNotebook(input.query, input.topK || 10, input.filters);
  if (!chunks.length) {
    return { answer: "Mình chưa tìm thấy ngữ cảnh phù hợp trong nguồn SGK đã lập chỉ mục.", chunks: [], provider: "extractive" };
  }
  const provider = input.provider || "openai_compatible";
  let answer: string | null = null;
  if (provider === "openai_compatible") {
    answer = await callOpenRouterText(
      `Câu hỏi: ${input.query}\n\nNgữ cảnh:\n${contextFromChunks(chunks)}\n\nTrả lời bằng Markdown ngắn gọn, dễ hiểu. Không viết kiểu "dựa trên [S1]" trong câu mở đầu; nếu cần dẫn chứng thì ghi cuối câu dạng "Nguồn: SGK trang ...".`
    );
  }
  return {
    answer: maybeRepair(answer || extractiveAnswer(input.query, chunks)),
    chunks,
    provider: answer ? "openai_compatible" : "extractive"
  };
}

function definitionRecords(chunks: NotebookChunk[]) {
  const records: Array<{ term: string; definition: string; marker: string; sentence: string }> = [];
  chunks.forEach((chunk, index) => {
    for (const sentence of splitSentences(chunk.text)) {
      const clean = compact(sentence, 300);
      const patterns = [
        /^([^.!?:]{3,80}?)\s+là\s+(.{18,260})$/iu,
        /^([^.!?:]{3,80}?)\s+được gọi là\s+(.{18,260})$/iu,
        /^([^.!?:]{3,80}?)\s+là\s+(.{18,260})$/iu,
        /^([^.!?:]{3,80}?)\s+được gọi là\s+(.{18,260})$/iu
      ];
      for (const pattern of patterns) {
        const match = clean.match(pattern);
        if (!match) continue;
        const term = match[1].replace(/^(bài\s+\d+\.?\s*)/iu, "").replace(/^[\s:.-]+|[\s:.-]+$/g, "");
        const definition = match[2].replace(/^[\s.]+|[\s.]+$/g, "");
        if (term.length < 3 || term.length > 70 || definition.length < 18) continue;
        records.push({ term, definition, marker: `S${index + 1}`, sentence: clean });
      }
    }
  });
  return records;
}

function fallbackQuiz(chunks: NotebookChunk[], count: number): LlmQuizItem[] {
  const definitions = definitionRecords(chunks);
  const terms = [...new Set(definitions.map((item) => item.term))];
  const questions = definitions.slice(0, count).map((item, index) => {
    const distractors = terms.filter((term) => term !== item.term).slice(index, index + 3);
    while (distractors.length < 3) distractors.push(["Một mốc thời gian", "Một kí hiệu bản đồ", "Một địa danh"][distractors.length]);
    return {
      question: `Khái niệm nào phù hợp với mô tả: "${item.definition}"?`,
      options: [item.term, ...distractors].slice(0, 4),
      correct_index: 0,
      explanation: `SGK nêu: ${item.sentence}`,
      source_markers: [item.marker]
    };
  });
  const sentences = chunks.flatMap((chunk, index) => splitSentences(chunk.text).slice(0, 3).map((sentence) => ({ sentence, marker: `S${index + 1}` })));
  for (const item of sentences) {
    if (questions.length >= count) break;
    questions.push({
      question: `Nhận định nào đúng theo nội dung bài học?`,
      options: [
        compact(item.sentence, 160),
        "Nội dung này không xuất hiện trong phần bài học.",
        "Đây là thông tin ngoài phạm vi tài liệu.",
        "Nhận định này trái với nội dung SGK."
      ],
      correct_index: 0,
      explanation: item.sentence,
      source_markers: [item.marker]
    });
  }
  return questions.slice(0, count);
}

function toQuizQuestion(item: LlmQuizItem, index: number, chunks: NotebookChunk[]): QuizQuestion {
  const itemText = `${item.question} ${(item.options || []).join(" ")} ${item.explanation || ""}`;
  return {
    id: newId("q"),
    prompt: `Câu ${index + 1}. ${String(item.question || "").replace(/^Câu\s+\d+\.\s*/iu, "").trim()}`,
    explanation: item.explanation,
    sourceMarkers: item.source_markers || sourceMarkers(chunks).slice(0, 1),
    imageRefs: selectImages(chunks, itemText, 2),
    options: item.options.slice(0, 4).map((text, optionIndex) => ({
      id: newId("opt"),
      label: String.fromCharCode(65 + optionIndex),
      text: String(text),
      isCorrect: optionIndex === item.correct_index
    }))
  };
}

export async function generateNotebookQuiz(input: {
  query?: string;
  count?: number;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: Provider;
}): Promise<{ questions: QuizQuestion[]; chunks: NotebookChunk[]; provider: string }> {
  const count = Math.min(Math.max(input.count || 6, 1), 50);
  const query = input.query || "nội dung trọng tâm bài học";
  const chunks = input.filters?.lesson_id && !input.query
    ? searchNotebook("", input.topK || 12, input.filters)
    : searchNotebook(query, input.topK || 5, input.filters);
  const provider = input.provider || "openai_compatible";
  let items: LlmQuizItem[] | null = null;
  if (provider === "openai_compatible" && chunks.length) {
    const llm = await callOpenRouterText(
      `Tạo ${count} câu hỏi trắc nghiệm cho giáo viên duyệt trước khi giao học sinh.\n\nYêu cầu:\n- Bám sát ngữ cảnh SGK, không hỏi mơ hồ.\n- Câu hỏi không mở đầu bằng "Theo SGK".\n- Có 4 đáp án A-D, chỉ một đáp án đúng.\n- Phương án nhiễu hợp lý, cùng loại với đáp án đúng.\n- Nếu câu hỏi cần hình, đặt "image_hint" ngắn trong explanation.\n- Trả về JSON object duy nhất dạng {"items":[{"question":"...","options":["...","...","...","..."],"correct_index":0,"explanation":"...","source_markers":["S1"]}]}.\n\nNgữ cảnh:\n${contextFromChunks(chunks, 12000)}`,
      true
    );
    items = parseJsonObject<{ items?: LlmQuizItem[] }>(llm)?.items || null;
  }
  const validItems = (items || []).filter((item) => item.question && Array.isArray(item.options) && item.options.length >= 4);
  const supplemented = [...validItems, ...fallbackQuiz(chunks, count)].slice(0, count);
  return {
    questions: supplemented.map((item, index) => toQuizQuestion(item, index, chunks)),
    chunks,
    provider: validItems.length ? "openai_compatible" : "extractive"
  };
}

function fallbackFlashcards(chunks: NotebookChunk[], count?: number): Flashcard[] {
  const definitions = definitionRecords(chunks);
  const target = count || Math.min(30, Math.max(8, definitions.length || chunks.length * 2));
  const cards: Flashcard[] = definitions.slice(0, target).map((item) => ({
    id: newId("card"),
    front: item.term,
    back: `**Định nghĩa:** ${item.definition}.`,
    hint: compact(item.sentence, 160),
    imageRefs: selectImages(chunks, `${item.term} ${item.definition}`, 1)
  }));
  if (!cards.length) {
    for (const chunk of chunks.slice(0, target)) {
      cards.push({
        id: newId("card"),
        front: chunk.metadata.lesson_title || "Ý chính cần nhớ",
        back: compact(chunk.text, 360),
        hint: `Trang ${chunk.metadata.page || "?"}`,
        imageRefs: selectImages([chunk], chunk.text, 1)
      });
    }
  }
  return cards.slice(0, target);
}

export async function generateNotebookFlashcards(input: {
  query?: string;
  count?: number;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: Provider;
}): Promise<{ cards: Flashcard[]; chunks: NotebookChunk[]; provider: string }> {
  const query = input.query || "khái niệm trọng tâm";
  const chunks = input.filters?.lesson_id && !input.query
    ? searchNotebook("", input.topK || 10, input.filters)
    : searchNotebook(query, input.topK || 10, input.filters);
  let cards: Flashcard[] | null = null;
  if ((input.provider || "openai_compatible") === "openai_compatible" && chunks.length) {
    const target = input.count || Math.min(30, Math.max(8, chunks.length * 2));
    const llm = await callOpenRouterText(
      `Tạo flashcard ôn tập tiếng Việt cho học sinh từ ngữ cảnh SGK.\n\nYêu cầu:\n- Mặt trước là thuật ngữ hoặc một thao tác cần nhớ, không ghi tên bài.\n- Mặt sau là định nghĩa/các bước đầy đủ, Markdown rõ ràng.\n- Nếu là bài tính toán, mặt sau trình bày Bước 1, Bước 2...\n- Trả về JSON object {"cards":[{"front":"...","back":"...","hint":"...","source_markers":["S1"]}]}.\n- Tạo tối đa ${target} thẻ, chỉ lấy thẻ thật sự có ý nghĩa.\n\nNgữ cảnh:\n${contextFromChunks(chunks, 12000)}`,
      true
    );
    const payload = parseJsonObject<{ cards?: Array<{ front: string; back: string; hint?: string }> }>(llm);
    cards = payload?.cards
      ?.filter((card) => card.front && card.back)
      .map((card) => ({
        id: newId("card"),
        front: card.front.replace(/^Bài\s+\d+[^:]*:\s*/iu, "").trim(),
        back: card.back,
        hint: card.hint,
        imageRefs: selectImages(chunks, `${card.front} ${card.back}`, 1)
      })) || null;
  }
  return { cards: cards?.length ? cards : fallbackFlashcards(chunks, input.count), chunks, provider: cards?.length ? "openai_compatible" : "extractive" };
}

export async function generateNotebookSummary(input: {
  query?: string;
  topK?: number;
  filters?: NotebookFilters | null;
  provider?: Provider;
}): Promise<{ result: SummaryResult; chunks: NotebookChunk[]; provider: string }> {
  const query = input.query || "tóm tắt bài học";
  const chunks = input.filters?.lesson_id && !input.query
    ? searchNotebook("", input.topK || 10, input.filters)
    : searchNotebook(query, input.topK || 10, input.filters);
  let summary: LlmSummary | null = null;
  if ((input.provider || "openai_compatible") === "openai_compatible" && chunks.length) {
    const llm = await callOpenRouterText(
      `Tóm tắt bài học bằng Markdown đẹp, dễ học.\n\nYêu cầu:\n- Dùng heading Markdown đúng: ##, ###.\n- Có mục "Ý chính", "Khái niệm cần nhớ", "Gợi ý ôn tập".\n- Không nhắc máy móc "dựa trên S1".\n- Trả JSON object {"title":"...","markdown":"...","key_points":["..."]}.\n\nNgữ cảnh:\n${contextFromChunks(chunks, 12000)}`,
      true
    );
    summary = parseJsonObject<LlmSummary>(llm);
  }
  const fallbackPoints = chunks.flatMap((chunk) => splitSentences(chunk.text).slice(0, 2)).slice(0, 8).map((sentence) => compact(sentence, 180));
  const title = summary?.title || chunks[0]?.metadata.lesson_title || query;
  const markdown =
    summary?.markdown ||
    `## Ý chính\n\n${fallbackPoints.slice(0, 5).map((point) => `- ${point}`).join("\n")}\n\n## Gợi ý ôn tập\n\n- Đọc lại các khái niệm chính.\n- Tự kiểm tra bằng Quiz và Flashcard.`;
  return {
    result: {
      id: newId("summary"),
      title,
      markdown,
      keyPoints: summary?.key_points?.length ? summary.key_points : fallbackPoints.slice(0, 6),
      imageRefs: selectImages(chunks, `${title} ${markdown}`, 3)
    },
    chunks,
    provider: summary ? "openai_compatible" : "extractive"
  };
}

export function notebookAssetPath(parts: string[]): string | null {
  const safe = parts.map((part) => decodeURIComponent(part)).join("/");
  const resolved = path.resolve(EXTRACTED_DIR, safe);
  if (!resolved.startsWith(path.resolve(EXTRACTED_DIR)) || !existsSync(resolved)) return null;
  return resolved;
}
