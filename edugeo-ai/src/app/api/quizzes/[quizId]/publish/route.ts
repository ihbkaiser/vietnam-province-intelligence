import { requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { publishQuizToClass } from "@/server/services/quizzes";

export async function POST(request: Request, context: { params: Promise<{ quizId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { quizId } = await context.params;
    const body = await readJson<{ classId: string; dueAt?: string; durationMinutes?: number }>(request);
    return ok(publishQuizToClass(user, quizId, body));
  } catch (error) {
    return toErrorResponse(error);
  }
}
