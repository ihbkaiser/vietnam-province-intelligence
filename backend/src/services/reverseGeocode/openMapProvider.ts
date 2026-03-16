import type {
  ResolveAdminUnitRequest,
  ReverseGeocodeBundle,
  ReverseGeocodeCandidate
} from '../../types/admin.js';
import type { ReverseGeocodeProvider } from './provider.js';

interface OpenMapProviderOptions {
  apiKey: string;
  baseUrl?: string;
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

function extractGoogleLikeComponents(payload: Record<string, unknown>): string[] {
  const results = asArray(payload.results);
  const first = asObject(results[0]);
  const components = asArray(first?.address_components);

  return components
    .map((component) => {
      const record = asObject(component);
      return pickString(record?.long_name, record?.short_name);
    })
    .filter((value): value is string => Boolean(value));
}

function parseAddressParts(candidate: ReverseGeocodeCandidate, payload: Record<string, unknown>) {
  const components = extractGoogleLikeComponents(payload);
  const formatted = candidate.formatted_address.split(',').map((item) => item.trim()).filter(Boolean);
  const parts = components.length ? components : formatted;

  const commune = parts.find((part) => /^(xã|phường|đặc khu)\b/i.test(part));
  const district = parts.find((part) => /^(quận|huyện|thị xã|thành phố)\b/i.test(part));
  const province = [...parts]
    .reverse()
    .find((part) => /^(tỉnh|thành phố)\b/i.test(part));

  return {
    raw_commune_or_ward_name: commune,
    raw_district_name: district,
    raw_province_name: province
  };
}

function toCandidate(payload: Record<string, unknown>, adminV2: boolean): ReverseGeocodeCandidate {
  const results = asArray(payload.results);
  const first = asObject(results[0]) ?? payload;
  const formattedAddress = pickString(first.formatted_address, first.address, payload.formatted_address) ?? '';
  const baseCandidate: ReverseGeocodeCandidate = {
    formatted_address: formattedAddress,
    provider_name: 'openmap',
    raw_payload: payload
  };

  const parsed = parseAddressParts(baseCandidate, payload);

  return {
    ...baseCandidate,
    ...parsed,
    raw_payload: {
      ...payload,
      admin_v2: adminV2
    }
  };
}

export class OpenMapReverseGeocodeProvider implements ReverseGeocodeProvider {
  public readonly providerName = 'openmap';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenMapProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://mapapis.openmap.vn/v1';
  }

  private async fetchCandidate(input: ResolveAdminUnitRequest, adminV2: boolean): Promise<ReverseGeocodeCandidate> {
    const params = new URLSearchParams({
      latlng: `${input.lat},${input.lon}`,
      apikey: this.apiKey,
      admin_v2: String(adminV2)
    });
    const url = `${this.baseUrl}/geocode/reverse?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OpenMap reverse geocode failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return toCandidate(payload, adminV2);
  }

  async reverseGeocode(input: ResolveAdminUnitRequest): Promise<ReverseGeocodeBundle> {
    const [current, legacy] = await Promise.all([
      this.fetchCandidate(input, true),
      this.fetchCandidate(input, false).catch(() => null)
    ]);

    return { current, legacy };
  }
}

