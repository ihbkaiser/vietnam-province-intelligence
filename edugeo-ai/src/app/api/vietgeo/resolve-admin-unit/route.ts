import { ok, readJson } from "@/server/http";
import { resolveVietGeoPoint } from "@/server/services/vietgeoLocal";

export async function POST(request: Request) {
  const body = await readJson<{ lat?: number; lon?: number }>(request);
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json({ error: "Tọa độ không hợp lệ." }, { status: 400 });
  return ok(resolveVietGeoPoint(lat, lon));
}
