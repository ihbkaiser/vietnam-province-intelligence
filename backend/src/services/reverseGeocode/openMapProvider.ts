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

export class OpenMapReverseGeocodeProvider implements ReverseGeocodeProvider {
  public readonly providerName = 'openmap';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenMapProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://mapapis.openmap.vn/v1';
  }

  async reverseGeocode(input: ResolveAdminUnitRequest): Promise<ReverseGeocodeBundle> {
    const params = new URLSearchParams({
      latlng: `${input.lat},${input.lon}`,
      apikey: this.apiKey
    });
    const url = `${this.baseUrl}/geocode/reverse?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OpenMap reverse geocode failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as Record<string, unknown>;

    const results = asArray(payload.results);
    const first = asObject(results[0]) ?? payload;
    const fullFormattedAddress =
      pickString(first.formatted_address, payload.formatted_address) ?? '';

    const components = extractComponents(payload);

    // ── Địa chỉ MỚI (2 cấp: phường/xã + tỉnh/thành phố) ─────────────────
    // phường → sublocality_level_1 ; xã/thị trấn → administrative_area_level_3
    const newCommune = findByType(
      components,
      'sublocality_level_1',
      'sublocality',
      'administrative_area_level_3'
    );
    const newProvince = findByType(
      components,
      'administrative_area_level_1',
      'locality'
    );

    const current: ReverseGeocodeCandidate = {
      // Địa chỉ mới chỉ gồm xã/phường + tỉnh/thành (không quận/huyện)
      formatted_address: [newCommune, newProvince].filter(Boolean).join(', '),
      raw_commune_or_ward_name: newCommune,
      raw_district_name: undefined,
      raw_province_name: newProvince,
      provider_name: this.providerName,
      raw_payload: payload
    };

    // ── Địa chỉ CŨ — dùng provinces.open-api.vn để resolve 3 cấp ──────────
    // administrative_area_level_2 = quận/huyện cũ (bị xóa sau cải cách 2025)
    const rawOldDistrict = findByType(components, 'administrative_area_level_2');

    let legacy: ReverseGeocodeCandidate | null = null;
    if (rawOldDistrict) {
      try {
        const province = await findProvince(newProvince ?? '');
        const district = await findDistrict(rawOldDistrict, province?.code);
        const ward = await findWard(newCommune ?? '', district?.code);

        const legacyProvince = province?.name ?? newProvince;
        const legacyDistrict = district?.name ?? rawOldDistrict;
        const legacyWard = ward?.name ?? newCommune;

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
        // Nếu open-api.vn không trả lời, fallback về dữ liệu thô từ address_components
        legacy = {
          formatted_address: fullFormattedAddress,
          raw_commune_or_ward_name: newCommune,
          raw_district_name: rawOldDistrict,
          raw_province_name: newProvince,
          provider_name: `${this.providerName}-legacy-derived`,
          raw_payload: payload
        };
      }
    }

    return { current, legacy };
  }
}
