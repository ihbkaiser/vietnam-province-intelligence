import { unlink } from "node:fs/promises";
import path from "node:path";
import { HttpError, requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { store } from "@/server/repositories/memoryStore";

const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

export async function PATCH(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { documentId } = await context.params;
    const document = store.documentById(documentId);
    if (!document) throw new HttpError(404, "Document not found");
    // Only the uploader (or an admin) may edit a document.
    if (user.role !== "admin" && document.uploadedById !== user.id) {
      throw new HttpError(403, "Forbidden");
    }
    const body = await readJson<{ knowledgeTags?: string[] }>(request);
    const tags = Array.isArray(body.knowledgeTags)
      ? body.knowledgeTags.map(String).filter((tag) => tag.trim().length > 0).slice(0, 12)
      : undefined;
    if (!tags) throw new HttpError(400, "knowledgeTags must be a non-empty array of strings");
    const updated = store.updateDocumentKnowledgeTags(documentId, tags);
    return ok({ document: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const user = requireRole(request, ["teacher"]);
    const { documentId } = await context.params;
    const document = store.documentById(documentId);
    if (!document) throw new HttpError(404, "Document not found");
    // Only the uploader (or an admin) may remove a document.
    if (user.role !== "admin" && document.uploadedById !== user.id) {
      throw new HttpError(403, "Forbidden");
    }
    store.deleteDocument(documentId);
    // Best-effort cleanup of the stored upload; a missing file is fine.
    if (document.storagePath) {
      const filePath = path.resolve(UPLOAD_DIR, document.storagePath);
      if (filePath.startsWith(path.resolve(UPLOAD_DIR))) {
        await unlink(filePath).catch(() => undefined);
      }
    }
    return ok({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
