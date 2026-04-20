import type {
  ResolveAdminUnitRequest,
  ReverseGeocodeBundle,
  ReverseGeocodeCandidate
} from '../../types/admin.js';
import type { ReverseGeocodeProvider } from './provider.js';
import { findDistrict, findProvince, findWard } from './openProvinceApiClient.js';

interface OpenMapProviderOptions {
  apiKey: string;
  baseUrl?: string;
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface AutocompleteTerm {
  value: string;
}

interface AutocompletePrediction {
  description: string;
  terms: AutocompleteTerm[];
}

const COMMUNE_PREFIX = /^(phường|xã|thị trấn)\s+/i;
const DISTRICT_PREFIX = /^(quận|huyện|thị xã|thành phố)\s+/i;
const PROVINCE_PREFIX = /^(tỉnh|thành phố)\s+/i;

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(...values: unknown[]): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim()) as string | undefined;
}

function extractComponents(payload: Record<string, unknown>): AddressComponent[] {
  const results = asArray(payload.results);
  const first = asObject(results[0]);
  const raw = asArray(first?.address_components);

  return raw
    .map((item) => {
      const obj = asObject(item);
      if (!obj) return null;
      const long_name = pickString(obj.long_name);
      const short_name = pickString(obj.short_name) ?? long_name ?? '';
      const types = asArray(obj.types).filter((t): t is string => typeof t === 'string');
      return long_name ? { long_name, short_name, types } : null;
    })
    .filter((c): c is AddressComponent => c !== null);
}

function findByType(components: AddressComponent[], ...types: string[]): string | undefined {
  for (const type of types) {
    const found = components.find((c) => c.types.includes(type));
    if (found) return found.long_name;
  }
  return undefined;
}

function parseAutocompleteParts(prediction: AutocompletePrediction) {
  const terms = prediction.terms.map((t) => t.value);
  const commune = terms.find((v) => COMMUNE_PREFIX.test(v)) ?? null;
  const district = terms.find((v) => DISTRICT_PREFIX.test(v) && !PROVINCE_PREFIX.test(v)) ?? null;
  const provinceTerms = terms.filter((v) => PROVINCE_PREFIX.test(v));
  const province =
    provinceTerms.find((v) => /^tỉnh\s+/i.test(v)) ??
    provinceTerms[provinceTerms.length - 1] ??
    null;
  return { commune, district, province };
}

export class OpenMapReverseGeocodeProvider implements ReverseGeocodeProvider {
  public readonly providerName = 'openmap';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenMapProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://mapapis.openmap.vn/v1';
  }

  private async autocomplete(input: string, adminV2: boolean): Promise<AutocompletePrediction | null> {
    const params = new URLSearchParams({ input, apikey: this.apiKey });
    if (adminV2) params.set('admin_v2', 'true');
    try {
      const res = await fetch(`${this.baseUrl}/place/autocomplete?${params}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { predictions?: AutocompletePrediction[] };
      return data.predictions?.[0] ?? null;
    } catch {
      return null;
    }
  }

  async reverseGeocode(input: ResolveAdminUnitRequest): Promise<ReverseGeocodeBundle> {
    const params = new URLSearchParams({
      latlng: `${input.lat},${input.lon}`,
      apikey: this.apiKey
    });
    const url = `${this.baseUrl}/geocode/reverse?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Dịch vụ bản đồ trả về lỗi HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as Record<string, unknown>;

    const results = asArray(payload.results);
    const first = asObject(results[0]) ?? payload;
    // fullFormattedAddress từ reverse geocode là địa chỉ CŨ (có huyện)
    const fullFormattedAddress =
      pickString(first.formatted_address, payload.formatted_address) ?? '';

    const components = extractComponents(payload);

    // Lấy commune từ components của reverse geocode (làm fallback)
    const geocodeCommune = findByType(
      components,
      'sublocality_level_1',
      'sublocality',
      'administrative_area_level_3'
    );
    const geocodeProvince = findByType(components, 'administrative_area_level_1', 'locality');

    // ── Địa chỉ MỚI: dùng place/autocomplete?admin_v2=true với query là địa chỉ cũ ──
    const newPrediction = fullFormattedAddress
      ? await this.autocomplete(fullFormattedAddress, true)
      : null;

    let newCommune: string | null | undefined = geocodeCommune;
    let newProvince: string | null | undefined = geocodeProvince;
    let newFormattedAddress = [geocodeCommune, geocodeProvince].filter(Boolean).join(', ');

    if (newPrediction) {
      const parts = parseAutocompleteParts(newPrediction);
      newCommune = parts.commune ?? geocodeCommune;
      newProvince = parts.province ?? geocodeProvince;
      newFormattedAddress = newPrediction.description;
    }

    const current: ReverseGeocodeCandidate = {
      formatted_address: newFormattedAddress,
      raw_commune_or_ward_name: newCommune ?? undefined,
      raw_district_name: undefined,
      raw_province_name: newProvince ?? undefined,
      provider_name: newPrediction ? `${this.providerName}-admin-v2` : this.providerName,
      raw_payload: payload
    };

    // ── Địa chỉ CŨ: fullFormattedAddress từ reverse geocode (xã + huyện + tỉnh) ──
    const rawOldDistrict = findByType(components, 'administrative_area_level_2');

    let legacy: ReverseGeocodeCandidate | null = fullFormattedAddress
      ? {
          formatted_address: fullFormattedAddress,
          raw_commune_or_ward_name: geocodeCommune,
          raw_district_name: rawOldDistrict,
          raw_province_name: geocodeProvince,
          provider_name: `${this.providerName}-legacy-derived`,
          raw_payload: payload
        }
      : null;

    // Nếu có district cũ, enrich thêm qua open-api.vn để chuẩn hóa tên
    if (rawOldDistrict) {
      try {
        const province = await findProvince(geocodeProvince ?? '');
        const district = await findDistrict(rawOldDistrict, province?.code);
        const ward = await findWard(geocodeCommune ?? '', district?.code);

        const legacyProvince = province?.name ?? geocodeProvince;
        const legacyDistrict = district?.name ?? rawOldDistrict;
        const legacyWard = ward?.name ?? geocodeCommune;

        legacy = {
          formatted_address: [legacyWard, legacyDistrict, legacyProvince]
            .filter(Boolean)
            .join(', '),
          raw_commune_or_ward_name: legacyWard,
          raw_district_name: legacyDistrict,
          raw_province_name: legacyProvince,
          provider_name: 'openmap+open-api-vn',
          raw_payload: { province, district, ward }
        };
      } catch {
        // Giữ nguyên legacy đã khởi tạo từ fullFormattedAddress
      }
    }

    return { current, legacy };
  }
}
