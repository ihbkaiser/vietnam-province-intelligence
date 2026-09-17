import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { ragChat } from "@/server/services/ragPipeline";

export async function POST(request: Request) {
  try {
    const user = getCurrentUser(request);
    const body = await readJson<{ query: string; classId?: string; lessonId?: string; subject?: string; classLevel?: number; topK?: number }>(request);
    return ok({ message: await ragChat(user, body) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
