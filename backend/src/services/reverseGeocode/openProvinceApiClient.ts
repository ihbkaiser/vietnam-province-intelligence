/**
 * Client cho provinces.open-api.vn/api/v1/ — dữ liệu hành chính CŨ (63 tỉnh/thành).
 * Dùng để resolve tên tỉnh/quận/xã cũ → code + tên chuẩn.
 */

const BASE = 'https://provinces.open-api.vn/api/v1';

interface ProvinceResult {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  phone_code: number;
}

interface DistrictResult {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  province_code: number;
}

interface WardResult {
  code: number;
  name: string;
  division_type: string;
  codename: string;
  district_code: number;
}

// ── Simple in-memory cache ────────────────────────────────────────────────
const cache = new Map<string, unknown>();

async function fetchJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url, { headers: { 'User-Agent': 'VietnamProvinceIntelligence/1.0' } });
  if (!res.ok) throw new Error(`provinces.open-api.vn returned ${res.status} for ${url}`);
  const data = await res.json() as T;
  cache.set(url, data);
  return data;
}

// ── Normalize helper — bỏ prefix "Tỉnh", "Thành phố", "Quận", "Huyện", ... ─
function stripAdminPrefix(name: string): string {
  return name
    .replace(/^(tỉnh|thành phố|thị xã|thành thị|quận|huyện|thị trấn|phường|xã)\s+/i, '')
    .trim();
}

function nameMatches(candidate: string, query: string): boolean {
  const normalize = (s: string) =>
    stripAdminPrefix(s).toLowerCase().normalize('NFC');
  return normalize(candidate).includes(normalize(query)) ||
    normalize(query).includes(normalize(candidate));
}

// ── Public API ────────────────────────────────────────────────────────────

export async function findProvince(name: string): Promise<ProvinceResult | null> {
  if (!name) return null;
  const results = await fetchJson<ProvinceResult[]>(
    `${BASE}/p/search/?q=${encodeURIComponent(name)}`
  );
  if (!results.length) return null;
  // Prefer exact (after stripping prefix) — otherwise take first result
  return results.find((r) => nameMatches(r.name, name)) ?? results[0];
}

export async function findDistrict(
  name: string,
  provinceCode?: number
): Promise<DistrictResult | null> {
  if (!name) return null;
  const results = await fetchJson<DistrictResult[]>(
    `${BASE}/d/search/?q=${encodeURIComponent(name)}`
  );
  if (!results.length) return null;
  const filtered = provinceCode
    ? results.filter((r) => r.province_code === provinceCode)
    : results;
  const pool = filtered.length ? filtered : results;
  return pool.find((r) => nameMatches(r.name, name)) ?? pool[0];
}

export async function findWard(
  name: string,
  districtCode?: number
): Promise<WardResult | null> {
  if (!name) return null;
  const results = await fetchJson<WardResult[]>(
    `${BASE}/w/search/?q=${encodeURIComponent(name)}`
  );
  if (!results.length) return null;
  const filtered = districtCode
    ? results.filter((r) => r.district_code === districtCode)
    : results;
  const pool = filtered.length ? filtered : results;
  return pool.find((r) => nameMatches(r.name, name)) ?? pool[0];
}
