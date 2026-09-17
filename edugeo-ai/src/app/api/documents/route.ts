import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser, requireRole, toErrorResponse } from "@/server/auth";
import { ok, readJson } from "@/server/http";
import { createIndexedDocument, listDocuments } from "@/server/services/documents";

const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

function safeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

export async function GET(request: Request) {
  try {
    const user = getCurrentUser(request);
    return ok({ documents: listDocuments(user) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = requireRole(request, ["teacher"]);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      const body = await readJson<{
        classId?: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        knowledgeTags?: string[];
      }>(request);
      return ok({ document: createIndexedDocument(user, body) }, { status: 201 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Missing file" }, { status: 400 });
    const classId = String(form.get("classId") || "") || undefined;
    const tagsRaw = String(form.get("knowledgeTags") || "[]");
    let knowledgeTags: string[] = ["Slide lớp học", "Chưa index RAG"];
    try {
      const parsed = JSON.parse(tagsRaw);
      if (Array.isArray(parsed)) knowledgeTags = parsed.map(String);
    } catch {
      // keep defaults
    }
    await mkdir(UPLOAD_DIR, { recursive: true });
    const storedName = `${Date.now()}_${safeFilename(file.name)}`;
    const storagePath = path.join(UPLOAD_DIR, storedName);
    await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
    const document = createIndexedDocument(user, {
      classId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      knowledgeTags,
      storagePath,
      fileUrl: `/api/documents/file/${encodeURIComponent(storedName)}`
    });
    return ok({ document }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
