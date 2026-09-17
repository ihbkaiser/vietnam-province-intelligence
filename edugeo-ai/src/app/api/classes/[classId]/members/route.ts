import { requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { addStudentByUsername } from "@/server/services/classes";

export async function POST(request: Request, context: { params: Promise<{ classId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { classId } = await context.params;
    const body = await readJson<{ username: string }>(request);
    return ok(addStudentByUsername(user, classId, body.username), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
