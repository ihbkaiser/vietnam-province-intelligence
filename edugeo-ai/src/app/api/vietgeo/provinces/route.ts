import { ok } from "@/server/http";
import { loadVietGeoProvinces } from "@/server/services/vietgeoLocal";

export async function GET() {
  return ok(loadVietGeoProvinces());
}
