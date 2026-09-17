import { getCurrentUser, HttpError, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function POST(request: Request) {
  try {
    const user = getCurrentUser(request);
    const body = await readJson<{ currentPassword?: string; nextPassword?: string }>(request);
    const currentPassword = body.currentPassword || "";
    const nextPassword = body.nextPassword || "";
    if (nextPassword.length < 6) throw new HttpError(400, "Mật khẩu mới cần ít nhất 6 ký tự.");
    store.changePassword(user, currentPassword, nextPassword);
    return ok({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
