import { ok } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (token) store.revokeSession(token);
  return ok({ ok: true });
}
