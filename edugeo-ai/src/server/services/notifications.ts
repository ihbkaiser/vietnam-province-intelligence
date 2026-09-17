import type { User } from "@/lib/types";
import { store } from "../repositories/memoryStore";

export function listNotifications(user: User) {
  return store.notificationsForUser(user.id);
}
