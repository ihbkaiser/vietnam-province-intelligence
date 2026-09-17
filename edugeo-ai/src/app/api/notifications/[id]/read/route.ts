import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getCurrentUser(_request);
    const { id } = await context.params;
    const notification = store.markNotificationRead(user.id, id);
    if (!notification) return ok({ ok: false }, { status: 404 });
    return ok({ ok: true, notification });
  } catch (error) {
    return toErrorResponse(error);
  }
}
