/**
 * Lấy toàn bộ xã/phường/thị trấn của Việt Nam từ OSM Overpass API (admin_level=8),
 * xác định tỉnh/thành mới (34 đơn vị) bằng point-in-polygon với realProvinceFeatures.json,
 * rồi ghi ra backend/src/data/communeSeeds.ts.
 *
 * Cách dùng:
 *   node scripts/fetchCommuneSeeds.mjs
 *
 * Yêu cầu: Node.js 18+ (native fetch), @turf/turf đã cài trong backend/
 */

import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load province GeoJSON để point-in-polygon ─────────────────────────────
const provinceGeoJson = require('../backend/src/data/realProvinceFeatures.json');

// Turf.js dùng để point-in-polygon
const { booleanPointInPolygon, point: turfPoint } = await import('@turf/turf');

// ── Hàm tìm province_code từ tọa độ ──────────────────────────────────────
function findProvinceCode(lat, lon) {
  const pt = turfPoint([lon, lat]);

  for (const feature of provinceGeoJson.features) {
    if (booleanPointInPolygon(pt, feature)) {
      return feature.properties.province_code;
    }
  }

  return null;
}

// ── Hàm xác định commune_type từ tên ─────────────────────────────────────
function inferCommuneType(name) {
  const lower = name.toLowerCase();

  if (/^(phường|phuong)\b/.test(lower) || /\bphường$/.test(lower)) return 'phuong';
  if (/^(thị trấn|thi tran)\b/.test(lower)) return 'phuong';
  if (/^(đặc khu|dac khu)\b/.test(lower)) return 'dac_khu';

  return 'xa';
}

// ── Chuẩn hóa tên thành commune_code ─────────────────────────────────────
function toCode(provinceCode, name) {
  return (
    provinceCode +
    '-' +
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

// ── Gọi Overpass API ──────────────────────────────────────────────────────
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const OVERPASS_QUERY = `
[out:json][timeout:300];
area["ISO3166-1"="VN"][admin_level=2]->.vn;
(
  relation["boundary"="administrative"]["admin_level"="8"](area.vn);
);
out center tags;
`.trim();

console.log('Đang truy vấn Overpass API cho tất cả xã/phường Việt Nam (admin_level=8)…');
console.log('Có thể mất 1–3 phút, vui lòng chờ.\n');

const response = await fetch(OVERPASS_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'VietnamProvinceIntelligence/1.0 (scripts/fetchCommuneSeeds.mjs)'
  },
  body: `data=${encodeURIComponent(OVERPASS_QUERY)}`
});

if (!response.ok) {
  console.error(`Overpass API trả lỗi HTTP ${response.status}`);
  process.exit(1);
}

const data = await response.json();
const elements = data.elements ?? [];
console.log(`Nhận được ${elements.length} đối tượng từ Overpass.\n`);

// ── Xử lý từng commune ────────────────────────────────────────────────────
const byProvince = {};
let skipped = 0;

for (const el of elements) {
  const name = el.tags?.['name:vi'] ?? el.tags?.name;
  if (!name) { skipped++; continue; }

  const lat = el.center?.lat;
  const lon = el.center?.lon;
  if (lat == null || lon == null) { skipped++; continue; }

  const provinceCode = findProvinceCode(lat, lon);
  if (!provinceCode) { skipped++; continue; }

  const communeType = inferCommuneType(name);
  const communeCode = toCode(provinceCode, name);

  if (!byProvince[provinceCode]) byProvince[provinceCode] = [];

  byProvince[provinceCode].push({
    commune_code: communeCode,
    commune_name: name,
    commune_type: communeType,
    center: [lon, lat]
  });
}

const totalProvinces = Object.keys(byProvince).length;
const totalCommunes = Object.values(byProvince).reduce((sum, arr) => sum + arr.length, 0);
console.log(`Xử lý xong: ${totalCommunes} xã/phường thuộc ${totalProvinces} tỉnh/thành.`);
if (skipped) console.log(`Bỏ qua ${skipped} phần tử thiếu thông tin.\n`);

// ── Sinh TypeScript source ────────────────────────────────────────────────
function buildSeedEntry(c, bbox) {
  return `    {
      commune_code: ${JSON.stringify(c.commune_code)},
      commune_name: ${JSON.stringify(c.commune_name)},
      commune_type: ${JSON.stringify(c.commune_type)},
      aliases: []
    }`;
}

const provinceEntries = Object.entries(byProvince)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([code, communes]) => {
    const entries = communes
      .sort((a, b) => a.commune_name.localeCompare(b.commune_name, 'vi'))
      .map((c) => buildSeedEntry(c))
      .join(',\n');

    return `  ${JSON.stringify(code)}: [\n${entries}\n  ]`;
  })
  .join(',\n');

const ts = `// Tệp này được tạo tự động bởi scripts/fetchCommuneSeeds.mjs
// Nguồn: OpenStreetMap Overpass API (admin_level=8), ngày ${new Date().toISOString().slice(0, 10)}
// Tổng số: ${totalCommunes} xã/phường/thị trấn thuộc ${totalProvinces} tỉnh/thành
// KHÔNG chỉnh sửa tay – chạy lại script để cập nhật.

import { provinceSeeds } from './provinceSeeds.js';
import type { CommuneSeed, CommuneType, ProvinceSeed } from '../types/admin.js';

interface CommuneSeedInput {
  commune_code: string;
  commune_name: string;
  commune_type: CommuneType;
  aliases?: string[];
}

const verifiedCommunes: Record<string, CommuneSeedInput[]> = {
${provinceEntries}
};

function generateBboxes(province: ProvinceSeed, count: number): CommuneSeed['bbox'][] {
  const [west, south, east, north] = province.bbox;
  const latStep = (north - south) / Math.max(count, 1);

  return Array.from({ length: count }, (_, i): CommuneSeed['bbox'] => [
    west,
    Number((south + i * latStep).toFixed(5)),
    east,
    Number((south + (i + 1) * latStep).toFixed(5))
  ]);
}

export const communeSeeds: CommuneSeed[] = provinceSeeds.flatMap((province) => {
  const seedInputs = verifiedCommunes[province.province_code];

  if (!seedInputs || seedInputs.length === 0) return [];

  const boxes = generateBboxes(province, seedInputs.length);

  return seedInputs.map((seed, index) => ({
    commune_code: seed.commune_code,
    commune_name: seed.commune_name,
    commune_type: seed.commune_type,
    province_code: province.province_code,
    aliases: seed.aliases ?? [],
    bbox: boxes[index]
  }));
});
`;

const outPath = path.join(__dirname, '../backend/src/data/communeSeeds.ts');
writeFileSync(outPath, ts, 'utf8');
console.log(`Đã ghi ${outPath}`);
console.log('Xong! Khởi động lại backend để áp dụng.');
