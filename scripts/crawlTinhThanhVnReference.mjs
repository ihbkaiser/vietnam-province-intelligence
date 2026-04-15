import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const LOCAL_PROVINCE_DIR = path.join(ROOT_DIR, 'provinces_data', 'Province_in4');
const OUTPUT_PATH = path.join(ROOT_DIR, 'backend', 'src', 'data', 'tinhThanhVnProvinceReference.json');
const SOURCE_NAME = 'TinhThanhVN.com';
const SOURCE_BASE_URL = 'https://tinhthanhvn.com';
const SOURCE_TERMS_URL = `${SOURCE_BASE_URL}/dieu-khoan`;

function stripDiacritics(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeKey(value) {
  return stripDiacritics(value.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugifyProvinceName(value) {
  return stripDiacritics(value.toLowerCase())
    .replace(/^thanh pho\s+/u, '')
    .replace(/^tinh\s+/u, '')
    .replace(/^thu do\s+/u, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanHtml(value) {
  return value
    .replace(/<!--.*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumeric(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value).trim();
  if (!raw || raw === 'null' || raw === 'undefined') return null;

  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  if (cleaned.includes('.') && cleaned.includes(',')) {
    const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (cleaned.includes(',') && !cleaned.includes('.')) {
    const parts = cleaned.split(',');
    const parsed = parts.length > 1 && parts.at(-1)?.length === 3
      ? Number(parts.join(''))
      : Number(cleaned.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (cleaned.includes('.') && !cleaned.includes(',')) {
    const parts = cleaned.split('.');
    const parsed = parts.length > 1 && parts.slice(1).every((part) => part.length === 3)
      ? Number(parts.join(''))
      : Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseList(serialized) {
  if (!serialized) return [];
  return [...serialized.matchAll(/"([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
}

function extractFirstMatch(text, regex) {
  const match = text.match(regex);
  return match?.[1]?.trim() ?? null;
}

function extractMetaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property="${escaped}"[^>]+content="([^"]+)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${escaped}"`, 'i'),
    new RegExp(`<meta[^>]+name="${escaped}"[^>]+content="([^"]+)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]+)"[^>]+name="${escaped}"`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractSectionParagraph(decodedHtml, headingText) {
  const escapedHeading = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<h3[^>]*>${escapedHeading}<\\/h3><p>(.*?)<\\/p>`);
  const raw = extractFirstMatch(decodedHtml, regex);
  return raw ? cleanHtml(raw) : null;
}

function extractProvinceSummary(decodedHtml, slug) {
  const pattern =
    /\{"id":\d+,"province_name":"[^"]+","type":"[^"]+","province_code":"[^"]+","province_name_full":"[^"]+".*?"public_service_id":"?[^"}]+"?\}/g;

  for (const match of decodedHtml.matchAll(pattern)) {
    const parsed = JSON.parse(match[0]);
    if (parsed.short_name !== slug) {
      continue;
    }

    return {
      province_name: parsed.province_name ?? null,
      province_code_text: parsed.province_code ?? null,
      province_name_full: parsed.province_name_full ?? null,
      area_km2: parseNumeric(parsed.area),
      population: parseNumeric(parsed.population),
      administrative_center: parsed.administrative_center ?? null,
      phone_code: parsed.phone_code ?? null,
      region: parsed.region ?? null,
      economic_region: parsed.economic_region ?? null,
      total_ward: parseNumeric(parsed.total_ward),
      total_commune: parseNumeric(parsed.total_commune),
      total_unit: parseNumeric(parsed.total_unit),
      border_with_provinces: Array.isArray(parsed.border_with_provinces) ? parsed.border_with_provinces : [],
      border_description: parsed.border_description ?? null,
      border_with_country: parsed.border_with_country ?? null,
      has_sea: parsed.has_sea ?? null,
      secretary: parsed.leader_bi_thu ?? parsed.leader_secretary ?? null,
      chairman: parsed.leader_chu_tich ?? parsed.leader_chairman ?? null,
      grdp_billion_vnd: parseNumeric(parsed.grdp_billion_vnd),
      income_per_capita_million_vnd: parseNumeric(parsed.per_capita_million_vnd),
      revenue_billion_vnd: parseNumeric(parsed.revenue_billion_vnd),
      vehicle_plates: Array.isArray(parsed.vehicle_license_codes)
        ? parsed.vehicle_license_codes.map((item) => String(item).trim()).filter(Boolean)
        : parsed.car_plate
          ? String(parsed.car_plate)
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : []
    };
  }

  {
    throw new Error(`Could not extract province summary for slug: ${slug}`);
  }
}

function extractVehiclePlates(decodedHtml) {
  const fromNarrative = extractFirstMatch(
    decodedHtml,
    /các biển số xe:<strong[^>]*>(?:\s*<!-- -->\s*)*([^<]+)</i
  );
  if (!fromNarrative) return [];
  return fromNarrative.split(',').map((item) => item.trim()).filter(Boolean);
}

function extractProvinceUnits(decodedHtml) {
  const unitRegex =
    /\{"id":\d+,"created_at":"[^"]+","ward_order":(\d+),"ward_name":"([^"]+)","ward_code":"([^"]+)","ward_type":"([^"]+)","admin_center":"([^"]*)","merger_from":"([^"]*)","province_id_ref":\d+,"province_code":\d+,"province_name":"([^"]+)","population":"?([^",]+)"?,"area":([^,}]+),"longitude":[^,}]+,"latitude":[^,}]+,"ward_ref_code":\d+,"tree_code":\d+,"district":"[^"]*","search_normalized":"[^"]*","ward_slug":"([^"]+)","province_slug":"([^"]+)","updated_at":"[^"]+","old_province_name":(?:null|"[^"]*"),"old_province_slug":(?:null|"[^"]*"),"old_district":"([^"]*)"\}/g;

  const units = new Map();

  for (const match of decodedHtml.matchAll(unitRegex)) {
    const wardCode = match[3];
    if (units.has(wardCode)) {
      continue;
    }

    const population = parseNumeric(match[7]);
    const areaKm2 = parseNumeric(match[8]);
    const density = population != null && areaKm2 ? Number((population / areaKm2).toFixed(2)) : null;

    units.set(wardCode, {
      ward_order: Number(match[1]),
      ward_name: match[2],
      ward_code: wardCode,
      ward_type: match[4],
      admin_center: match[5] || null,
      merger_from: match[6] || null,
      population,
      area_km2: areaKm2,
      density_per_km2: density,
      ward_slug: match[9],
      old_district: match[11] || null
    });
  }

  return [...units.values()].sort((left, right) => left.ward_order - right.ward_order);
}

async function loadLocalProvinceNames() {
  const files = (await readdir(LOCAL_PROVINCE_DIR)).filter((file) => file.endsWith('.json')).sort();
  const provinces = [];

  for (const file of files) {
    const filePath = path.join(LOCAL_PROVINCE_DIR, file);
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const provinceName = parsed?.name?.value;

    if (!provinceName) {
      throw new Error(`Missing province name in ${file}`);
    }

    provinces.push({
      file,
      province_name: provinceName,
      source_slug: slugifyProvinceName(provinceName)
    });
  }

  return provinces;
}

async function fetchProvinceReference({ province_name: provinceName, source_slug: sourceSlug }) {
  const url = `${SOURCE_BASE_URL}/province/${sourceSlug}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'VietnamProvinceIntelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }

  const html = await response.text();
  const decodedHtml = html.replace(/\\"/g, '"');
  const summary = extractProvinceSummary(decodedHtml, sourceSlug);

  return {
    province_name: provinceName,
    province_name_full: summary.province_name_full,
    source_slug: sourceSlug,
    hero_image_url: extractMetaContent(html, 'og:image'),
    hero_image_alt: extractMetaContent(html, 'og:image:alt'),
    province_code_text: summary.province_code_text,
    administrative_center: summary.administrative_center,
    phone_code: summary.phone_code,
    vehicle_plates: summary.vehicle_plates.length > 0 ? summary.vehicle_plates : extractVehiclePlates(decodedHtml),
    region: summary.region,
    economic_region: summary.economic_region,
    area_km2: summary.area_km2,
    population: summary.population,
    total_ward: summary.total_ward,
    total_commune: summary.total_commune,
    total_unit: summary.total_unit,
    border_with_provinces: summary.border_with_provinces,
    overview_summary: extractSectionParagraph(decodedHtml, `Tổng quan về ${summary.province_name_full}`),
    boundary_summary: summary.border_description ?? extractSectionParagraph(decodedHtml, 'Thông tin hành chính và biên giới'),
    update_note: extractFirstMatch(
      decodedHtml,
      /Cập nhật theo quyết định sáp nhập 34 tỉnh thành<\/h3><p[^>]*>(.*?)<\/p>/
    ) ? cleanHtml(
      extractFirstMatch(decodedHtml, /Cập nhật theo quyết định sáp nhập 34 tỉnh thành<\/h3><p[^>]*>(.*?)<\/p>/)
    ) : null,
    secretary:
      summary.secretary ??
      extractFirstMatch(decodedHtml, /Bí thư(?:\s*<!-- -->\s*)*(?:Tỉnh ủy)?(?:\s|<[^>]+>)*là<strong[^>]*>(?:\s*<!-- -->\s*)*([^<]+)/i),
    chairman:
      summary.chairman ??
      extractFirstMatch(decodedHtml, /Chủ tịch UBND(?:\s|<[^>]+>)*là<strong[^>]*>(?:\s*<!-- -->\s*)*([^<]+)/i),
    grdp_billion_vnd:
      summary.grdp_billion_vnd ??
      parseNumeric(extractFirstMatch(decodedHtml, /GRDP:<\/span><span class="font-medium">([^<]+)/)),
    income_per_capita_million_vnd:
      summary.income_per_capita_million_vnd ??
      parseNumeric(extractFirstMatch(decodedHtml, /Thu nhập BQ:<\/span><span class="font-medium">([^<]+)/)),
    revenue_billion_vnd:
      summary.revenue_billion_vnd ??
      parseNumeric(extractFirstMatch(decodedHtml, /Doanh thu:<\/span><span class="font-medium">([^<]+)/)),
    units: extractProvinceUnits(decodedHtml),
    source: {
      name: SOURCE_NAME,
      url,
      terms_url: SOURCE_TERMS_URL,
      crawled_at: new Date().toISOString(),
      note: 'Public reference snapshot transformed into an internal schema with attribution.'
    }
  };
}

async function main() {
  const localProvinces = await loadLocalProvinceNames();
  const snapshots = [];

  for (const province of localProvinces) {
    process.stdout.write(`Fetching ${province.province_name} (${province.source_slug})... `);
    const snapshot = await fetchProvinceReference(province);
    snapshots.push(snapshot);
    process.stdout.write(`ok (${snapshot.units.length} units)\n`);
  }

  snapshots.sort((left, right) => normalizeKey(left.province_name).localeCompare(normalizeKey(right.province_name)));

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: {
          name: SOURCE_NAME,
          url: SOURCE_BASE_URL,
          terms_url: SOURCE_TERMS_URL,
          note: 'Reference snapshots crawled from public province pages and remapped into this app.'
        },
        provinces: snapshots
      },
      null,
      2
    )
  );

  console.log(`Saved ${snapshots.length} province snapshots to ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
