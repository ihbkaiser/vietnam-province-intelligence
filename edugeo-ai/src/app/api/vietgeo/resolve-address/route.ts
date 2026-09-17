import { ok, readJson } from "@/server/http";
import { resolveVietGeoAddress } from "@/server/services/vietgeoLocal";

export async function POST(request: Request) {
  const body = await readJson<{ address_text?: string }>(request);
  const addressText = body.address_text?.trim();
  if (!addressText) return Response.json({ error: "Vui lòng nhập địa chỉ." }, { status: 400 });
  return ok(resolveVietGeoAddress(addressText));
}
