import type { ChatMessage, Flashcard, QuizQuestion, SummaryResult, User } from "@/lib/types";
import { assertClassAccess } from "../auth";
import { newId, store } from "../repositories/memoryStore";
import {
  answerNotebook as answerNotebookFallback,
  generateNotebookSummary as generateNotebookSummaryFallback,
  type NotebookFilters
} from "./notebookLocal";
import {
  answerNotebookWithBridge,
  answerNotebookWithHttp,
  generateNotebookFlashcardsWithBridge,
  generateNotebookFlashcardsWithHttp,
  generateNotebookQuizWithBridge,
  generateNotebookQuizWithHttp,
  generateNotebookSummaryWithBridge,
  generateNotebookSummaryWithHttp
} from "./notebookBridge";

function filtersForClassScope(
  input: { classId?: string; lessonId?: string; subject?: string; classLevel?: number },
  user?: User
): NotebookFilters | undefined {
  const filters: NotebookFilters = {};
  if (input.classLevel) {
    filters.class_level = input.classLevel;
  } else if (input.classId) {
    if (user) assertClassAccess(user, input.classId);
    const classRoom = store.classById(input.classId);
    if (classRoom?.grade) filters.class_level = classRoom.grade;
  }
  if (input.lessonId) filters.lesson_id = input.lessonId;
  if (input.subject) filters.subject = input.subject;
  return Object.keys(filters).length ? filters : undefined;
}

export async function ragChat(
  user: User,
  input: { query: string; classId?: string; lessonId?: string; subject?: string; classLevel?: number; topK?: number }
): Promise<ChatMessage> {
  const filters = filtersForClassScope(input, user);
  try {
    const result = await answerNotebookWithHttp({
      query: input.query,
      topK: input.topK || 10,
      filters,
      provider: "openai_compatible"
    });
    return {
      id: newId("msg"),
      role: "ai",
      content: result.answer,
      citations: result.citations || [],
      sources: result.chunks || [],
      provider: result.provider,
      model: result.model
    };
  } catch (httpError) {
    console.warn("NotebookLM HTTP (port 8020) ask failed, trying bridge fallback:", httpError);
    try {
      const result = await answerNotebookWithBridge({
        query: input.query,
        topK: input.topK || 10,
        filters,
        provider: "openai_compatible"
      });
      return {
        id: newId("msg"),
        role: "ai",
        content: result.answer,
        citations: result.citations || [],
        sources: result.chunks || [],
        provider: result.provider,
        model: result.model
      };
    } catch (bridgeFallbackError) {
      console.warn("NotebookLM extractive bridge fallback failed, using local TS fallback:", bridgeFallbackError);
    }
    const result = await answerNotebookFallback({
      query: input.query,
      topK: input.topK || 10,
      filters,
      provider: "openai_compatible"
    });
    return {
      id: newId("msg"),
      role: "ai",
      content: result.answer,
      sources: result.chunks,
      provider: result.provider
    };
  }
}

export async function generateQuizQuestions(input: {
  count: number;
  query: string;
  classId?: string;
  lessonId?: string;
  subject?: string;
}): Promise<QuizQuestion[]> {
  const filters = filtersForClassScope(input);
  try {
    const result = await generateNotebookQuizWithHttp({
      query: input.query,
      count: input.count,
      topK: 5,
      filters,
      provider: "openai_compatible"
    });
    if (result.questions.length) return result.questions;
  } catch (httpError) {
    console.warn("NotebookLM HTTP (port 8020) quiz failed, trying bridge fallback:", httpError);
    try {
      const result = await generateNotebookQuizWithBridge({
        query: input.query,
        count: input.count,
        topK: 5,
        filters,
        provider: "openai_compatible"
      });
      if (result.questions.length) return result.questions;
    } catch (error) {
      console.warn("NotebookLM bridge quiz failed:", error);
      throw error;
    }
  }
  throw new Error("DeepSeek không tạo được câu hỏi đủ chuẩn cho phạm vi đang chọn.");
}

export async function generateFlashcards(input: {
  query: string;
  classId?: string;
  lessonId?: string;
  subject?: string;
  count?: number;
}): Promise<Flashcard[]> {
  const filters = filtersForClassScope(input);
  try {
    const result = await generateNotebookFlashcardsWithHttp({
      query: input.query,
      count: input.count,
      topK: 10,
      filters,
      provider: "openai_compatible"
    });
    if (result.cards.length) return result.cards;
  } catch (httpError) {
    console.warn("NotebookLM HTTP (port 8020) flashcards failed, trying bridge fallback:", httpError);
    try {
      const result = await generateNotebookFlashcardsWithBridge({
        query: input.query,
        count: input.count,
        topK: 10,
        filters,
        provider: "openai_compatible"
      });
      if (result.cards.length) return result.cards;
    } catch (bridgeError) {
      console.warn("NotebookLM bridge flashcards failed:", bridgeError);
      throw bridgeError;
    }
  }
  throw new Error("DeepSeek không tạo được flashcard đủ chuẩn cho phạm vi đang chọn.");
}

export async function generateSummary(input: {
  query: string;
  classId?: string;
  lessonId?: string;
  subject?: string;
}): Promise<SummaryResult> {
  const filters = filtersForClassScope(input);
  try {
    const result = await generateNotebookSummaryWithHttp({
      query: input.query,
      topK: 10,
      filters,
      provider: "openai_compatible"
    });
    return result.result;
  } catch (httpError) {
    console.warn("NotebookLM HTTP (port 8020) summary failed, trying bridge fallback:", httpError);
    try {
      const result = await generateNotebookSummaryWithBridge({
        query: input.query,
        topK: 10,
        filters,
        provider: "openai_compatible"
      });
      return result.result;
    } catch (bridgeError) {
      console.warn("NotebookLM bridge summary failed, trying extractive bridge fallback:", bridgeError);
      try {
        return (
          await generateNotebookSummaryWithBridge({
            query: input.query,
            topK: 10,
            filters,
            provider: "extractive"
          })
        ).result;
      } catch (bridgeFallbackError) {
        console.warn("NotebookLM extractive bridge summary fallback failed, using local TS fallback:", bridgeFallbackError);
      }
      return (
        await generateNotebookSummaryFallback({
          query: input.query,
          topK: 10,
          filters,
          provider: "openai_compatible"
        })
      ).result;
    }
  }
}
