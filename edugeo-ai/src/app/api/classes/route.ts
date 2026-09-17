import { getCurrentUser, requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { createClassForTeacher, listClasses } from "@/server/services/classes";

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    return ok({ classes: listClasses(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = requireRole(request, ["teacher"]);
    const body = await readJson<Parameters<typeof createClassForTeacher>[1]>(request);
    return ok({ classRoom: createClassForTeacher(user, body) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
