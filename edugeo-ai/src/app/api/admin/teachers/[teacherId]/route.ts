import { requireRole, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function DELETE(request: Request, { params }: { params: Promise<{ teacherId: string }> }) {
  try {
    requireRole(request, ["admin"]);
    const { teacherId } = await params;
    store.deleteTeacher(teacherId);
    return ok({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
