import { assertClassAccess, requireRole, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function DELETE(request: Request, context: { params: Promise<{ classId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { classId } = await context.params;
    assertClassAccess(user, classId);
    store.deleteClass(classId);
    return ok({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
