import type { Role, User } from "@/lib/types";
import { store } from "./repositories/memoryStore";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getCurrentUser(request: Request): User {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (token) {
    const sessionUser = store.userBySession(token);
    if (!sessionUser) throw new HttpError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    return sessionUser;
  }
  const requestedUser = request.headers.get("x-demo-user") || "";
  if (!requestedUser) throw new HttpError(401, "Unauthenticated");
  const user = store.userById(requestedUser);
  if (!user) throw new HttpError(401, "Unauthenticated");
  return user;
}

export function requireRole(request: Request, roles: Role[]): User {
  const user = getCurrentUser(request);
  if (!roles.includes(user.role)) throw new HttpError(403, "Forbidden");
  return user;
}

export function assertClassAccess(user: User, classId: string): void {
  const classRoom = store.classById(classId);
  if (!classRoom) throw new HttpError(404, "Class not found");
  if (user.role === "admin") return;
  if (user.role === "teacher" && classRoom.teacherId === user.id) return;
  if (user.role === "student" && classRoom.studentIds.includes(user.id)) return;
  throw new HttpError(403, "No access to class");
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error) {
    const status = error.message.endsWith("_NOT_FOUND") ? 404 : 400;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}
