import { readFile } from "node:fs/promises";
import path from "node:path";
import { toErrorResponse } from "@/server/auth";
import { notebookAssetPath } from "@/server/services/notebookLocal";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: parts } = await context.params;
    const filePath = notebookAssetPath(parts);
    if (!filePath) return Response.json({ error: "Asset not found" }, { status: 404 });
    const buffer = await readFile(filePath);
    return new Response(buffer, {
      headers: {
        "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "cache-control": "public, max-age=86400"
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
