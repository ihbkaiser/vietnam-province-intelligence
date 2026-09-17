import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { listAssignments } from "@/server/services/quizzes";

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    return ok({ assignments: listAssignments(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
