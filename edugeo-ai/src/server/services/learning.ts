import type { User } from "@/lib/types";
import { assertClassAccess } from "../auth";
import { store } from "../repositories/memoryStore";
import { generateFlashcards, generateSummary } from "./ragPipeline";

export async function createFlashcardSet(user: User, input: { classId?: string; title?: string; query: string; lessonId?: string; subject?: string; count?: number }) {
  if (input.classId) assertClassAccess(user, input.classId);
  const cards = await generateFlashcards({ query: input.query, classId: input.classId, lessonId: input.lessonId, subject: input.subject, count: input.count });
  return store.saveFlashcards({
    ownerId: user.id,
    classId: input.classId,
    title: input.title || input.query || "Flashcard bài học",
    cards
  });
}

export async function createSummary(user: User, input: { classId?: string; query: string; lessonId?: string; subject?: string }) {
  if (input.classId) assertClassAccess(user, input.classId);
  const result = await generateSummary({ query: input.query, classId: input.classId, lessonId: input.lessonId, subject: input.subject });
  return store.saveSummary({ ownerId: user.id, classId: input.classId, result });
}
