import type { FlashcardSet } from "@/lib/types";
import { getCurrentUser, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";
import { createFlashcardSet } from "@/server/services/learning";

/** Derive the broadcast state for a set. Sets created before the `broadcasted` flag
 *  existed only have a flashcardAssignments entry to prove they were broadcast. */
function withBroadcastState(set: FlashcardSet): FlashcardSet {
  if (set.broadcasted !== undefined) return set;
  const hasAssignment = store.flashcardAssignmentsForSet(set.id).length > 0;
  return hasAssignment ? { ...set, broadcasted: true } : set;
}

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    const url = new URL(request.url);
    const classId = url.searchParams.get("classId");
    let sets: FlashcardSet[];
    if (classId) {
      sets = user.role === "teacher"
        ? store.flashcardSetsForClass(classId)
        : store.flashcardSetsForUser(user).filter((set) => set.classId === classId);
    } else {
      sets = store.flashcardSetsForUser(user);
    }
    return ok({ flashcardSets: sets.map(withBroadcastState) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = getCurrentUser(request);
    const body = await readJson<{ classId?: string; title?: string; query: string; lessonId?: string; subject?: string; count?: number }>(request);
    return ok({ flashcardSet: await createFlashcardSet(user, body) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
