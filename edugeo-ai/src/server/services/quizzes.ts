import { isDisplayableImageUrl, normalizeAssetUrl } from "@/lib/assets";
import type { Quiz, QuizQuestion, Subject, User } from "@/lib/types";
import { assertClassAccess, HttpError } from "../auth";
import { newId, store } from "../repositories/memoryStore";
import { generateQuizQuestions } from "./ragPipeline";

function normalizeQuizQuestions(questions: QuizQuestion[]): QuizQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    id: question.id || newId("q"),
    imageRefs: (question.imageRefs || [])
      .map((image) => ({
        ...image,
        url: normalizeAssetUrl(image.url),
        caption: image.caption || "Ảnh minh họa"
      }))
      .filter((image) => isDisplayableImageUrl(image.url)),
    options: question.options.map((option, optionIndex) => ({
      ...option,
      id: option.id || newId("opt"),
      label: option.label || String.fromCharCode(65 + optionIndex)
    })),
    prompt: question.prompt.startsWith("Câu") ? question.prompt : `Câu ${index + 1}. ${question.prompt}`
  }));
}

export function listQuizzes(user: User): Quiz[] {
  return store.quizzesForUser(user);
}

export async function createAiQuiz(
  user: User,
  input: {
    title: string;
    subject: Subject;
    classId?: string;
    documentId?: string;
    knowledgeScope?: string;
    lessonId?: string;
    count?: number;
    durationMinutes?: number;
  }
): Promise<Quiz> {
  if (user.role !== "teacher") throw new HttpError(403, "Only teachers can generate quiz drafts");
  if (input.classId) assertClassAccess(user, input.classId);
  const questions = normalizeQuizQuestions(
    await generateQuizQuestions({
      count: input.count || 6,
      query: input.knowledgeScope || input.title,
      classId: input.classId,
      lessonId: input.lessonId,
      subject: input.subject === "mixed" ? undefined : input.subject
    })
  );
  return store.createQuiz({
    title: input.title,
    subject: input.subject,
    classId: input.classId,
    documentId: input.documentId,
    knowledgeScope: input.knowledgeScope,
    lessonId: input.lessonId,
    status: "reviewing",
    authorId: user.id,
    durationMinutes: input.durationMinutes || 15,
    questions
  });
}

export function updateQuizDraft(user: User, quizId: string, questions: QuizQuestion[], status: Quiz["status"] = "reviewing") {
  const quiz = store.quizById(quizId);
  if (!quiz) throw new HttpError(404, "Quiz not found");
  if (quiz.authorId !== user.id) throw new HttpError(403, "Only the author can edit this quiz");
  return store.updateQuizQuestions(
    quizId,
    normalizeQuizQuestions(questions),
    status
  );
}

export function publishQuizToClass(user: User, quizId: string, input: { classId: string; dueAt?: string; durationMinutes?: number }) {
  const quiz = store.quizById(quizId);
  if (!quiz) throw new HttpError(404, "Quiz not found");
  if (quiz.authorId !== user.id) throw new HttpError(403, "Only the author can publish this quiz");
  assertClassAccess(user, input.classId);
  if (input.durationMinutes !== undefined && input.durationMinutes !== quiz.durationMinutes) {
    quiz.durationMinutes = input.durationMinutes;
  }
  return store.publishQuiz(quizId, input.classId, input.dueAt);
}

export function listAssignments(user: User) {
  return store.assignmentsForUser(user).map((assignment) => {
    const quiz = store.quizById(assignment.quizId);
    const author = quiz?.authorId ? store.userById(quiz.authorId) : undefined;
    return {
      ...assignment,
      quiz,
      classRoom: store.classById(assignment.classId),
      teacherName: author?.displayName || "Giáo viên"
    };
  });
}

export function submitQuiz(user: User, input: { assignmentId: string; answers: Record<string, string> }) {
  if (user.role !== "student") throw new HttpError(403, "Only students can submit quiz");
  return store.submitQuiz({ assignmentId: input.assignmentId, studentId: user.id, answers: input.answers });
}
