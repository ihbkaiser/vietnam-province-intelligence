import { requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { updateQuizDraft } from "@/server/services/quizzes";
import type { QuizQuestion, QuizStatus } from "@/lib/types";

export async function PATCH(request: Request, context: { params: Promise<{ quizId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { quizId } = await context.params;
    const body = await readJson<{ questions: QuizQuestion[]; status?: QuizStatus }>(request);
    return ok({ quiz: updateQuizDraft(user, quizId, body.questions, body.status) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
