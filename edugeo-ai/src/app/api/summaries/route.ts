import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { createSummary } from "@/server/services/learning";

export async function POST(request: Request) {
  try {
    const user = getCurrentUser(request);
    const body = await readJson<{ classId?: string; query: string; lessonId?: string; subject?: string }>(request);
    return ok({ summary: await createSummary(user, body) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
