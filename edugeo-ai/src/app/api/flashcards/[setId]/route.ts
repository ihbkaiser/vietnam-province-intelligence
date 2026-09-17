import type { Flashcard } from "@/lib/types";
import { requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function PATCH(request: Request, context: { params: Promise<{ setId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { setId } = await context.params;
    const body = await readJson<{ title?: string; cards?: Flashcard[] }>(request);
    return ok({ flashcardSet: store.updateFlashcardSet(setId, body) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ setId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { setId } = await context.params;
    store.deleteFlashcardSet(setId);
    return ok({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
