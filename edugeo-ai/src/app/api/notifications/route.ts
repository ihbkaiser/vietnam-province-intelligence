import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok } from "@/server/http";
import { listNotifications } from "@/server/services/notifications";

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    return ok({ notifications: listNotifications(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
