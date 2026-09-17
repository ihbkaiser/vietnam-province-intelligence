import { getCurrentUser, requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";
import { createAiQuiz, listQuizzes } from "@/server/services/quizzes";

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    return ok({ quizzes: listQuizzes(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = requireRole(request, ["teacher"]);
    const body = await readJson<{ skipAI?: boolean } & Parameters<typeof createAiQuiz>[1]>(request);
    if (body.skipAI) {
      const quiz = store.createQuiz({
        title: body.title || "Quiz ôn tập",
        subject: body.subject || "mixed",
        classId: body.classId,
        documentId: body.documentId,
        lessonId: body.lessonId,
        status: "draft",
        authorId: user.id,
        durationMinutes: body.durationMinutes || 15,
        questions: []
      });
      return ok({ quiz }, { status: 201 });
    }
    return ok({ quiz: await createAiQuiz(user, body) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
