import type {
  ResolveAdminUnitRequest,
  ReverseGeocodeBundle,
  ReverseGeocodeCandidate
} from '../../types/admin.js';
import type { ReverseGeocodeProvider } from './provider.js';

interface NominatimAddress {
  quarter?: string;
  suburb?: string;
  neighbourhood?: string;
  village?: string;
  hamlet?: string;
  town?: string;
  city_district?: string;
  district?: string;
  county?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
  error?: string;
}

function extractAddressParts(address: NominatimAddress): Pick<
  ReverseGeocodeCandidate,
  'raw_commune_or_ward_name' | 'raw_district_name' | 'raw_province_name'
> {
  // Xã/phường/thị trấn – ưu tiên theo độ chính xác hành chính
  const raw_commune_or_ward_name =
    address.quarter ??
    address.suburb ??
    address.village ??
    address.neighbourhood ??
    address.hamlet;

  // Quận/huyện – có thể không còn tồn tại sau cải cách 2025
  const raw_district_name =
    address.city_district ??
    address.district ??
    address.county;

  // Tỉnh/thành phố trực thuộc TW
  const raw_province_name =
    address.city ??
    address.town ??
    address.state;

  return { raw_commune_or_ward_name, raw_district_name, raw_province_name };
}

export class NominatimReverseGeocodeProvider implements ReverseGeocodeProvider {
  public readonly providerName = 'nominatim';
  private readonly userAgent: string;
  private readonly baseUrl: string;

  constructor(options?: { userAgent?: string; baseUrl?: string }) {
    this.userAgent = options?.userAgent ?? 'VietnamProvinceIntelligence/1.0 (https://github.com/your-repo)';
    this.baseUrl = options?.baseUrl ?? 'https://nominatim.openstreetmap.org';
  }

  async reverseGeocode(input: ResolveAdminUnitRequest): Promise<ReverseGeocodeBundle> {
    const params = new URLSearchParams({
      lat: String(input.lat),
      lon: String(input.lon),
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': 'vi'
    });

    const url = `${this.baseUrl}/reverse?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim reverse geocode thất bại: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as NominatimResponse;

    if (payload.error) {
      throw new Error(`Nominatim trả lỗi: ${payload.error}`);
    }

    const address = payload.address ?? {};
    const parts = extractAddressParts(address);

    const current: ReverseGeocodeCandidate = {
      formatted_address: payload.display_name ?? '',
      ...parts,
      provider_name: this.providerName,
      raw_payload: payload as Record<string, unknown>
    };

    // Nominatim chỉ trả về cấu trúc hiện tại – không có dữ liệu địa giới cũ
    return { current, legacy: null };
  }
}
