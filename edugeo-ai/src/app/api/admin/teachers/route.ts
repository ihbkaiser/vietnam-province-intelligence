import type { TeacherAccountInput } from "@/lib/types";
import { HttpError, requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function GET(request: Request) {
  try {
    requireRole(request, ["admin"]);
    return ok({ teachers: store.listTeachers() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireRole(request, ["admin"]);
    const body = await readJson<TeacherAccountInput>(request);
    const displayName = body.displayName?.trim();
    const username = body.username?.trim();
    const password = body.password || "";
    if (!displayName || !username || password.length < 6) {
      throw new HttpError(400, "Cần nhập tên giáo viên, username và mật khẩu ít nhất 6 ký tự.");
    }
    const teacher = store.createTeacher({ displayName, username, password, email: body.email?.trim() || undefined });
    return ok({ teacher }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
