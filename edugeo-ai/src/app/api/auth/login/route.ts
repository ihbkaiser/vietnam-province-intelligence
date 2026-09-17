import { HttpError, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ username?: string; password?: string }>(request);
    const username = body.username?.trim();
    const password = body.password || "";
    if (!username || !password) throw new HttpError(400, "Vui lòng nhập username và mật khẩu.");
    const session = store.authenticate(username, password);
    if (!session) throw new HttpError(401, "Sai username hoặc mật khẩu.");
    return ok(session);
  } catch (error) {
    return toErrorResponse(error);
  }
}
