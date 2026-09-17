import { readFile } from "node:fs/promises";
import path from "node:path";
import { toErrorResponse } from "@/server/auth";

const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint"
};

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params;
    const decoded = decodeURIComponent(filename);
    const filePath = path.resolve(UPLOAD_DIR, decoded);
    if (!filePath.startsWith(path.resolve(UPLOAD_DIR))) return Response.json({ error: "Invalid file" }, { status: 400 });
    const buffer = await readFile(filePath);
    return new Response(buffer, {
      headers: {
        "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "content-disposition": `inline; filename="${decoded.replace(/"/g, "")}"`
      }
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
