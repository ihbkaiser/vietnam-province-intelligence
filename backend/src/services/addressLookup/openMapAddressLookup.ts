/**
 * Dùng OpenMap place/autocomplete với admin_v2=true để chuyển đổi địa chỉ cũ → mới.
 *
 * Hai lần gọi song song:
 *  1. Không có admin_v2 → địa chỉ cũ chuẩn hóa (tiếng Việt có dấu, loại hành chính)
 *  2. Với admin_v2=true → địa chỉ mới theo cơ cấu 34 tỉnh/thành sau 12/6/2025
 */

const BASE = 'https://mapapis.openmap.vn/v1';

export interface AddressParts {
  commune: string | null;
  district: string | null;
  province: string | null;
  formatted_address: string;
}

export interface ResolveAddressResult {
  old_address: AddressParts;
  new_address: AddressParts;
  found: boolean;
  source: 'openmap-admin-v2';
}

interface AutocompleteTerm {
  offset: number;
  value: string;
}

interface AutocompletePrediction {
  description: string;
  terms: AutocompleteTerm[];
}

interface AutocompleteResponse {
  predictions: AutocompletePrediction[];
}

const COMMUNE_PREFIX = /^(phường|xã|thị trấn)\s+/i;
const DISTRICT_PREFIX = /^(quận|huyện|thị xã|thành phố)\s+/i;
const PROVINCE_PREFIX = /^(tỉnh|thành phố)\s+/i;

function extractParts(prediction: AutocompletePrediction): AddressParts {
  // Bỏ term đầu (thường là tên địa điểm/query), chỉ lấy các term hành chính
  const terms = prediction.terms.map((t) => t.value);

  const commune = terms.find((v) => COMMUNE_PREFIX.test(v)) ?? null;
  const district = terms.find((v) => DISTRICT_PREFIX.test(v) && !PROVINCE_PREFIX.test(v)) ?? null;

  // Province: term cuối cùng có prefix "tỉnh" hoặc "thành phố X" mà không phải cấp quận
  const provinceTerms = terms.filter((v) => PROVINCE_PREFIX.test(v));
  // Ưu tiên "tỉnh ..." nếu có, không thì lấy term cuối có prefix
  const province =
    provinceTerms.find((v) => /^tỉnh\s+/i.test(v)) ??
    provinceTerms[provinceTerms.length - 1] ??
    null;

  return {
    commune,
    district,
    province,
    formatted_address: prediction.description
  };
}

async function autocomplete(input: string, adminV2: boolean, apiKey: string): Promise<AutocompletePrediction | null> {
  const params = new URLSearchParams({ input, apikey: apiKey });
  if (adminV2) params.set('admin_v2', 'true');

  try {
    const res = await fetch(`${BASE}/place/autocomplete?${params}`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AutocompleteResponse;
    return data.predictions?.[0] ?? null;
  } catch {
    return null;
  }
}

async function resolveByQuery(query: string, apiKey: string, fallback: AddressParts): Promise<ResolveAddressResult | null> {
  const [oldPrediction, newPrediction] = await Promise.all([
    autocomplete(query, false, apiKey),
    autocomplete(query, true, apiKey)
  ]);

  if (!oldPrediction && !newPrediction) return null;

  const old_address = oldPrediction ? extractParts(oldPrediction) : fallback;
  const new_address = newPrediction
    ? extractParts(newPrediction)
    : { commune: null, district: null, province: null, formatted_address: '' };

  return {
    old_address,
    new_address,
    found: Boolean(newPrediction && new_address.province),
    source: 'openmap-admin-v2'
  };
}

/** Chế độ nhập theo từng trường (tỉnh / quận / xã) */
export async function resolveAddressViaOpenMap(params: {
  commune?: string | null;
  district?: string | null;
  province: string;
  apiKey: string;
}): Promise<ResolveAddressResult | null> {
  const query = [params.commune, params.district, params.province].filter(Boolean).join(' ');
  const fallback: AddressParts = {
    commune: params.commune ?? null,
    district: params.district ?? null,
    province: params.province,
    formatted_address: query
  };
  return resolveByQuery(query, params.apiKey, fallback);
}

/** Chế độ nhập địa chỉ tự do */
export async function resolveAddressTextViaOpenMap(params: {
  address_text: string;
  apiKey: string;
}): Promise<ResolveAddressResult | null> {
  const fallback: AddressParts = {
    commune: null,
    district: null,
    province: null,
    formatted_address: params.address_text
  };
  return resolveByQuery(params.address_text, params.apiKey, fallback);
}
