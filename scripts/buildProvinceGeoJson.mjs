/**
 * Downloads the 63-province Vietnam GeoJSON and merges features into the
 * 34 new province-level units (effective June 2025).
 * Outputs: backend/src/data/realProvinceFeatures.json
 */
import { union, featureCollection } from '@turf/turf';
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Mapping: GeoJSON feature name → new province_code ──────────────────────
const NAME_TO_CODE = {
  'Hà Nội': 'hanoi',
  'Thừa Thiên - Huế': 'hue',
  'Quảng Ninh': 'quang-ninh',
  'Cao Bằng': 'cao-bang',
  'Lạng Sơn': 'lang-son',
  'Lai Châu': 'lai-chau',
  'Điện Biên': 'dien-bien',
  'Sơn La': 'son-la',
  'Thanh Hóa': 'thanh-hoa',
  'Nghệ An': 'nghe-an',
  'Hà Tĩnh': 'ha-tinh',
  // Merged provinces
  'Tuyên Quang': 'tuyen-quang',
  'Hà Giang': 'tuyen-quang',
  'Lào Cai': 'lao-cai',
  'Yên Bái': 'lao-cai',
  'Thái Nguyên': 'thai-nguyen',
  'Bắc Kạn': 'thai-nguyen',
  'Phú Thọ': 'phu-tho',
  'Vĩnh Phúc': 'phu-tho',
  'Hòa Bình': 'phu-tho',
  'Bắc Ninh': 'bac-ninh',
  'Bắc Giang': 'bac-ninh',
  'Hưng Yên': 'hung-yen',
  'Thái Bình': 'hung-yen',
  'Hải Phòng': 'hai-phong',
  'Hải Dương': 'hai-phong',
  'Ninh Bình': 'ninh-binh',
  'Hà Nam': 'ninh-binh',
  'Nam Định': 'ninh-binh',
  'Quảng Trị': 'quang-tri',
  'Quảng Bình': 'quang-tri',
  'Đà Nẵng': 'da-nang',
  'Quảng Nam': 'da-nang',
  'Quảng Ngãi': 'quang-ngai',
  'Kon Tum': 'quang-ngai',
  'Gia Lai': 'gia-lai',
  'Bình Định': 'gia-lai',
  'Khánh Hòa': 'khanh-hoa',
  'Ninh Thuận': 'khanh-hoa',
  'Lâm Đồng': 'lam-dong',
  'Đăk Nông': 'lam-dong',
  'Bình Thuận': 'lam-dong',
  'Đắk Lắk': 'dak-lak',
  'Phú Yên': 'dak-lak',
  'Hồ Chí Minh City': 'ho-chi-minh-city',
  'Hồ Chí Minh city': 'ho-chi-minh-city',
  'Bình Dương': 'ho-chi-minh-city',
  'Bà Rịa - Vũng Tàu': 'ho-chi-minh-city',
  'Đồng Nai': 'dong-nai',
  'Bình Phước': 'dong-nai',
  'Tây Ninh': 'tay-ninh',
  'Long An': 'tay-ninh',
  'Cần Thơ': 'can-tho',
  'Sóc Trăng': 'can-tho',
  'Hậu Giang': 'can-tho',
  'Vĩnh Long': 'vinh-long',
  'Bến Tre': 'vinh-long',
  'Trà Vinh': 'vinh-long',
  'Đồng Tháp': 'dong-thap',
  'Tiền Giang': 'dong-thap',
  'Cà Mau': 'ca-mau',
  'Bạc Liêu': 'ca-mau',
  'An Giang': 'an-giang',
  'Kiên Giang': 'an-giang',
};

// ── Province metadata (code → name + kind) ─────────────────────────────────
const PROVINCE_META = {
  'hanoi':            { name: 'Hà Nội',                    kind: 'city' },
  'hue':              { name: 'Huế',                       kind: 'city' },
  'quang-ninh':       { name: 'Quảng Ninh',                kind: 'province' },
  'cao-bang':         { name: 'Cao Bằng',                  kind: 'province' },
  'lang-son':         { name: 'Lạng Sơn',                  kind: 'province' },
  'lai-chau':         { name: 'Lai Châu',                  kind: 'province' },
  'dien-bien':        { name: 'Điện Biên',                 kind: 'province' },
  'son-la':           { name: 'Sơn La',                    kind: 'province' },
  'thanh-hoa':        { name: 'Thanh Hóa',                 kind: 'province' },
  'nghe-an':          { name: 'Nghệ An',                   kind: 'province' },
  'ha-tinh':          { name: 'Hà Tĩnh',                   kind: 'province' },
  'tuyen-quang':      { name: 'Tuyên Quang',               kind: 'province' },
  'lao-cai':          { name: 'Lào Cai',                   kind: 'province' },
  'thai-nguyen':      { name: 'Thái Nguyên',               kind: 'province' },
  'phu-tho':          { name: 'Phú Thọ',                   kind: 'province' },
  'bac-ninh':         { name: 'Bắc Ninh',                  kind: 'province' },
  'hung-yen':         { name: 'Hưng Yên',                  kind: 'province' },
  'hai-phong':        { name: 'Hải Phòng',                 kind: 'city' },
  'ninh-binh':        { name: 'Ninh Bình',                 kind: 'province' },
  'quang-tri':        { name: 'Quảng Trị',                 kind: 'province' },
  'da-nang':          { name: 'Đà Nẵng',                   kind: 'city' },
  'quang-ngai':       { name: 'Quảng Ngãi',                kind: 'province' },
  'gia-lai':          { name: 'Gia Lai',                   kind: 'province' },
  'khanh-hoa':        { name: 'Khánh Hòa',                 kind: 'province' },
  'lam-dong':         { name: 'Lâm Đồng',                  kind: 'province' },
  'dak-lak':          { name: 'Đắk Lắk',                   kind: 'province' },
  'ho-chi-minh-city': { name: 'Thành phố Hồ Chí Minh',    kind: 'city' },
  'dong-nai':         { name: 'Đồng Nai',                  kind: 'province' },
  'tay-ninh':         { name: 'Tây Ninh',                  kind: 'province' },
  'can-tho':          { name: 'Cần Thơ',                   kind: 'city' },
  'vinh-long':        { name: 'Vĩnh Long',                 kind: 'province' },
  'dong-thap':        { name: 'Đồng Tháp',                 kind: 'province' },
  'ca-mau':           { name: 'Cà Mau',                    kind: 'province' },
  'an-giang':         { name: 'An Giang',                  kind: 'province' },
};

async function main() {
  console.log('Fetching 63-province GeoJSON...');
  const res = await fetch('https://raw.githubusercontent.com/Vizzuality/growasia_calculator/master/public/vietnam.geojson');
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const raw = await res.json();

  // Group features by new province code
  const groups = {};
  let unmatched = [];
  for (const feature of raw.features) {
    const name = feature.properties.name;
    const code = NAME_TO_CODE[name];
    if (!code) {
      unmatched.push(name);
      continue;
    }
    if (!groups[code]) groups[code] = [];
    groups[code].push(feature);
  }

  if (unmatched.length > 0) {
    console.warn('⚠ Unmatched province names:', unmatched);
  }

  // Union geometries per new province
  const mergedFeatures = [];
  for (const [code, features] of Object.entries(groups)) {
    const meta = PROVINCE_META[code];
    if (!meta) { console.warn(`No metadata for code: ${code}`); continue; }

    let geometry;
    if (features.length === 1) {
      geometry = features[0].geometry;
    } else {
      try {
        const fc = featureCollection(features);
        const merged = union(fc);
        geometry = merged.geometry;
      } catch (e) {
        console.warn(`Union failed for ${code}, using first feature:`, e.message);
        geometry = features[0].geometry;
      }
    }

    mergedFeatures.push({
      type: 'Feature',
      properties: {
        province_id: `p-${String(mergedFeatures.length + 1).padStart(3, '0')}`,
        province_code: code,
        province_name: meta.name,
        province_kind: meta.kind,
      },
      geometry,
    });
  }

  const result = { type: 'FeatureCollection', features: mergedFeatures };
  const outPath = path.join(__dirname, '../backend/src/data/realProvinceFeatures.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`✓ Written ${mergedFeatures.length} province features to ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
