import { ok } from "@/server/http";
import { getVietGeoProvince } from "@/server/services/vietgeoLocal";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const province = getVietGeoProvince(code);
  if (!province) return Response.json({ error: "Không tìm thấy tỉnh/thành." }, { status: 404 });
  return ok(province);
}
