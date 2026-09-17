import type { TeachingDocument, User } from "@/lib/types";
import { assertClassAccess, HttpError } from "../auth";
import { store } from "../repositories/memoryStore";

export function listDocuments(user: User): TeachingDocument[] {
  return store.documentsForUser(user);
}

export function createIndexedDocument(
  user: User,
  input: {
    classId?: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    knowledgeTags?: string[];
    fileUrl?: string;
    storagePath?: string;
  }
): TeachingDocument {
  if (user.role !== "teacher") throw new HttpError(403, "Only teachers can upload and index documents");
  if (input.classId) assertClassAccess(user, input.classId);
  return store.createDocument({
    classId: input.classId,
    filename: input.filename,
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes: input.sizeBytes,
    knowledgeTags: input.knowledgeTags || ["Slide lớp học", "Chưa index RAG"],
    uploadedById: user.id,
    fileUrl: input.fileUrl,
    storagePath: input.storagePath
  });
}
