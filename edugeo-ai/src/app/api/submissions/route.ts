import { HttpError, requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";
import { submitQuiz } from "@/server/services/quizzes";

export async function GET(request: Request) {
  try {
    const user = requireRole(request, ["teacher"]);
    const url = new URL(request.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) throw new HttpError(400, "assignmentId required");
    return ok({ submissions: store.submissionsForAssignment(assignmentId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = requireRole(request, ["student"]);
    const body = await readJson<{ assignmentId: string; answers: Record<string, string> }>(request);
    return ok({ submission: submitQuiz(user, body) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
