import { requireRole, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

// Return the current user's own submissions (all assignments). Students use this
// after a page refresh (F5) to restore which quizzes they already submitted and
// their scores — the data lives server-side, but the client state was lost.
export async function GET(request: Request) {
  try {
    const user = requireRole(request, ["student", "teacher", "admin"]);
    return ok({ submissions: store.submissionsForUser(user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
