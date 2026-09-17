import { requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function POST(request: Request, context: { params: Promise<{ setId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { setId } = await context.params;
    const body = await readJson<{ classId: string }>(request);
    return ok({ flashcardSet: store.broadcastFlashcards(setId, body.classId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
