import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { listNotebookLessons } from "@/server/services/notebookLocal";

export async function GET(request: Request) {
  try {
    getCurrentUser(request);
    return ok({ lessons: listNotebookLessons() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
