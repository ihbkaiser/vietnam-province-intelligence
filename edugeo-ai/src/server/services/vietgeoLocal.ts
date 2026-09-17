import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type FeatureCollection = { type: "FeatureCollection"; features: ProvinceFeature[] };
type ProvinceFeature = {
  type: "Feature";
  properties: {
    province_id?: string;
    province_code: string;
    province_name: string;
    province_kind?: string;
  };
  geometry?: unknown;
};

const ROOT_DIR = path.resolve(process.cwd(), "..");
const GEOJSON_PATH = path.join(ROOT_DIR, "backend", "src", "data", "realProvinceFeatures.json");
const INFO_DIR = path.join(ROOT_DIR, "backend", "src", "data", "province_in4");
const REFERENCE_PATH = path.join(ROOT_DIR, "backend", "src", "data", "tinhThanhVnProvinceReference.json");

const LEGACY_MAPPINGS: Array<{ legacy: string; currentCode: string }> = [
  { legacy: "Ha Giang", currentCode: "tuyen-quang" },
  { legacy: "Yen Bai", currentCode: "lao-cai" },
  { legacy: "Bac Kan", currentCode: "thai-nguyen" },
  { legacy: "Vinh Phuc", currentCode: "phu-tho" },
  { legacy: "Hoa Binh", currentCode: "phu-tho" },
  { legacy: "Bac Giang", currentCode: "bac-ninh" },
  { legacy: "Thai Binh", currentCode: "hung-yen" },
  { legacy: "Hai Duong", currentCode: "hai-phong" },
  { legacy: "Ha Nam", currentCode: "ninh-binh" },
  { legacy: "Nam Dinh", currentCode: "ninh-binh" },
  { legacy: "Quang Binh", currentCode: "quang-tri" },
  { legacy: "Quang Nam", currentCode: "da-nang" },
  { legacy: "Kon Tum", currentCode: "quang-ngai" },
  { legacy: "Binh Dinh", currentCode: "gia-lai" },
  { legacy: "Ninh Thuan", currentCode: "khanh-hoa" },
  { legacy: "Dak Nong", currentCode: "lam-dong" },
  { legacy: "Binh Thuan", currentCode: "lam-dong" },
  { legacy: "Phu Yen", currentCode: "dak-lak" },
  { legacy: "Binh Duong", currentCode: "ho-chi-minh-city" },
  { legacy: "Ba Ria Vung Tau", currentCode: "ho-chi-minh-city" },
  { legacy: "Long An", currentCode: "tay-ninh" },
  { legacy: "Soc Trang", currentCode: "can-tho" },
  { legacy: "Hau Giang", currentCode: "can-tho" },
  { legacy: "Ben Tre", currentCode: "vinh-long" },
  { legacy: "Tra Vinh", currentCode: "vinh-long" },
  { legacy: "Tien Giang", currentCode: "dong-thap" },
  { legacy: "Bac Lieu", currentCode: "ca-mau" },
  { legacy: "Kien Giang", currentCode: "an-giang" }
];

let cachedGeoJson: FeatureCollection | null = null;
let cachedReference: Record<string, unknown> | null = null;

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as T;
}

function normalize(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/^(tinh|thanh pho|tp)\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugFromName(value: string): string {
  return normalize(value).replace(/\s+/g, "-");
}

export function loadVietGeoProvinces(): FeatureCollection {
  if (!cachedGeoJson) cachedGeoJson = readJson<FeatureCollection>(GEOJSON_PATH, { type: "FeatureCollection", features: [] });
  return cachedGeoJson;
}

function loadReference() {
  if (!cachedReference) cachedReference = readJson<Record<string, unknown>>(REFERENCE_PATH, {});
  return cachedReference;
}

export function findProvinceByCodeOrName(value: string | null | undefined): ProvinceFeature | undefined {
  const norm = normalize(value);
  return loadVietGeoProvinces().features.find((feature) => {
    const props = feature.properties;
    return props.province_code === value || normalize(props.province_code) === norm || normalize(props.province_name) === norm;
  });
}

function loadProvinceInfo(feature: ProvinceFeature): Record<string, unknown> | null {
  if (!existsSync(INFO_DIR)) return null;
  const wanted = new Set([
    slugFromName(feature.properties.province_name),
    slugFromName(feature.properties.province_code),
    slugFromName(feature.properties.province_code.replace(/-city$/, ""))
  ]);
  const file = readdirSync(INFO_DIR).find((name) => wanted.has(slugFromName(path.basename(name, ".json"))));
  return file ? readJson<Record<string, unknown>>(path.join(INFO_DIR, file), {}) : null;
}

function loadProvinceReference(feature: ProvinceFeature) {
  const reference = loadReference() as { provinces?: Array<Record<string, unknown>> };
  const norm = normalize(feature.properties.province_name);
  return (reference.provinces || []).find((item) => normalize(String(item.province_name || item.province_name_full || "")) === norm) || null;
}

export function getVietGeoProvince(code: string) {
  const feature = findProvinceByCodeOrName(code);
  if (!feature) return null;
  return {
    ...feature.properties,
    province_info: loadProvinceInfo(feature),
    reference_snapshot: loadProvinceReference(feature)
  };
}

export function resolveVietGeoAddress(addressText: string) {
  const norm = normalize(addressText);
  const currentDirect = loadVietGeoProvinces().features.find((feature) => norm.includes(normalize(feature.properties.province_name)));
  const legacy = LEGACY_MAPPINGS.find((mapping) => norm.includes(normalize(mapping.legacy)));
  const current = legacy ? findProvinceByCodeOrName(legacy.currentCode) : currentDirect;
  return {
    input: { address_text: addressText },
    found: Boolean(current),
    legacy_match: legacy ? { legacy_province: legacy.legacy } : null,
    current_match: current
      ? {
          province_code: current.properties.province_code,
          province_name: current.properties.province_name
        }
      : null,
    explanation: legacy
      ? `${legacy.legacy} được quy đổi sang ${current?.properties.province_name || legacy.currentCode} theo bảng sáp nhập tỉnh/thành 2025.`
      : current
        ? `Địa chỉ đã khớp trực tiếp với ${current.properties.province_name}.`
        : "Chưa tìm thấy tỉnh/thành phù hợp trong dữ liệu nội bộ.",
    source: "VietGeoAI local crosswalk"
  };
}

function flattenCoordinates(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number" && typeof value[1] === "number") return [value as number[]];
  return value.flatMap((item) => flattenCoordinates(item));
}

function bbox(feature: ProvinceFeature): [number, number, number, number] | null {
  const points = flattenCoordinates((feature.geometry as { coordinates?: unknown } | undefined)?.coordinates);
  if (!points.length) return null;
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function resolveVietGeoPoint(lat: number, lon: number) {
  const candidates = loadVietGeoProvinces().features
    .map((feature) => ({ feature, bbox: bbox(feature) }))
    .filter((item): item is { feature: ProvinceFeature; bbox: [number, number, number, number] } => Boolean(item.bbox))
    .filter((item) => lon >= item.bbox[0] && lon <= item.bbox[2] && lat >= item.bbox[1] && lat <= item.bbox[3]);
  const feature = candidates[0]?.feature;
  return {
    input: { lat, lon },
    current_match: feature
      ? {
          province_code: feature.properties.province_code,
          province_name: feature.properties.province_name
        }
      : null,
    confidence: feature ? "medium" : "low",
    debug: {
      method: "local_geojson_bbox",
      candidates: candidates.slice(0, 5).map((item) => item.feature.properties.province_name)
    }
  };
}
