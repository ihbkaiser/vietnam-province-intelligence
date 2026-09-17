import { HttpError, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ username?: string; displayName?: string; password?: string; email?: string }>(request);
    const username = body.username?.trim();
    const displayName = body.displayName?.trim();
    const password = body.password || "";
    if (!username || !displayName || password.length < 6) {
      throw new HttpError(400, "Học sinh cần nhập họ tên, username và mật khẩu ít nhất 6 ký tự.");
    }
    const session = store.registerStudent({ username, displayName, password, email: body.email?.trim() || undefined });
    return ok(session, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
