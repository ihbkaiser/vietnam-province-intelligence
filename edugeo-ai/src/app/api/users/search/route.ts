import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { searchStudents } from "@/server/services/classes";

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    return ok({ users: searchStudents(user, query) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
