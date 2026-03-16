import type {
  ResolveAdminUnitRequest,
  ReverseGeocodeBundle
} from '../../types/admin.js';
import type { ReverseGeocodeProvider } from './provider.js';

interface MockZone {
  name: string;
  match: (input: ResolveAdminUnitRequest) => boolean;
  result: ReverseGeocodeBundle;
}

const zones: MockZone[] = [
  {
    name: 'Hanoi core',
    match: ({ lat, lon }) => lat >= 21 && lat <= 21.12 && lon >= 105.76 && lon <= 105.9,
    result: {
      current: {
        formatted_address: 'phường Ba Đình, thành phố Hà Nội, Việt Nam',
        raw_commune_or_ward_name: 'phường Ba Đình',
        raw_district_name: 'quận Ba Đình',
        raw_province_name: 'thành phố Hà Nội',
        provider_name: 'mock',
        raw_payload: { zone: 'hanoi-core', mode: 'current' }
      },
      legacy: {
        formatted_address: 'phường Ba Đình, quận Ba Đình, thành phố Hà Nội, Việt Nam',
        raw_commune_or_ward_name: 'phường Ba Đình',
        raw_district_name: 'quận Ba Đình',
        raw_province_name: 'thành phố Hà Nội',
        provider_name: 'mock',
        raw_payload: { zone: 'hanoi-core', mode: 'legacy' }
      }
    }
  },
  {
    name: 'Ho Chi Minh legacy edge',
    match: ({ lat, lon }) => lat >= 10.86 && lat <= 11.08 && lon >= 106.63 && lon <= 106.84,
    result: {
      current: {
        formatted_address: 'phường Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam',
        raw_commune_or_ward_name: 'phường Thủ Đức',
        raw_district_name: undefined,
        raw_province_name: 'Thành phố Hồ Chí Minh',
        provider_name: 'mock',
        raw_payload: { zone: 'hcm-legacy-binh-duong', mode: 'current' }
      },
      legacy: {
        formatted_address: 'phường Phú Hòa, thành phố Thủ Dầu Một, tỉnh Bình Dương, Việt Nam',
        raw_commune_or_ward_name: 'phường Phú Hòa',
        raw_district_name: 'thành phố Thủ Dầu Một',
        raw_province_name: 'tỉnh Bình Dương',
        provider_name: 'mock',
        raw_payload: { zone: 'hcm-legacy-binh-duong', mode: 'legacy' }
      }
    }
  },
  {
    name: 'Ho Chi Minh center',
    match: ({ lat, lon }) => lat >= 10.72 && lat <= 10.82 && lon >= 106.65 && lon <= 106.75,
    result: {
      current: {
        formatted_address: 'phường Bến Thành, Thành phố Hồ Chí Minh, Việt Nam',
        raw_commune_or_ward_name: 'phường Bến Thành',
        raw_district_name: undefined,
        raw_province_name: 'Thành phố Hồ Chí Minh',
        provider_name: 'mock',
        raw_payload: { zone: 'hcm-center', mode: 'current' }
      },
      legacy: {
        formatted_address: 'phường Bến Thành, Quận 1, Thành phố Hồ Chí Minh, Việt Nam',
        raw_commune_or_ward_name: 'phường Bến Thành',
        raw_district_name: 'Quận 1',
        raw_province_name: 'Thành phố Hồ Chí Minh',
        provider_name: 'mock',
        raw_payload: { zone: 'hcm-center', mode: 'legacy' }
      }
    }
  },
  {
    name: 'Da Nang legacy province',
    match: ({ lat, lon }) => lat >= 15.98 && lat <= 16.12 && lon >= 108.16 && lon <= 108.32,
    result: {
      current: {
        formatted_address: 'phường Hải Châu, thành phố Đà Nẵng, Việt Nam',
        raw_commune_or_ward_name: 'phường Hải Châu',
        raw_district_name: undefined,
        raw_province_name: 'thành phố Đà Nẵng',
        provider_name: 'mock',
        raw_payload: { zone: 'da-nang-legacy', mode: 'current' }
      },
      legacy: {
        formatted_address: 'phường Hòa Hải, quận Ngũ Hành Sơn, tỉnh Quảng Nam, Việt Nam',
        raw_commune_or_ward_name: 'phường Hòa Hải',
        raw_district_name: 'quận Ngũ Hành Sơn',
        raw_province_name: 'tỉnh Quảng Nam',
        provider_name: 'mock',
        raw_payload: { zone: 'da-nang-legacy', mode: 'legacy' }
      }
    }
  },
  {
    name: 'Hue core',
    match: ({ lat, lon }) => lat >= 16.42 && lat <= 16.5 && lon >= 107.54 && lon <= 107.67,
    result: {
      current: {
        formatted_address: 'phường Phú Hội, thành phố Huế, Việt Nam',
        raw_commune_or_ward_name: 'phường Phú Hội',
        raw_district_name: undefined,
        raw_province_name: 'thành phố Huế',
        provider_name: 'mock',
        raw_payload: { zone: 'hue-core', mode: 'current' }
      },
      legacy: {
        formatted_address: 'phường Phú Hội, thành phố Huế, Việt Nam',
        raw_commune_or_ward_name: 'phường Phú Hội',
        raw_district_name: 'thành phố Huế',
        raw_province_name: 'thành phố Huế',
        provider_name: 'mock',
        raw_payload: { zone: 'hue-core', mode: 'legacy' }
      }
    }
  },
  {
    name: 'Can Tho legacy province',
    match: ({ lat, lon }) => lat >= 9.95 && lat <= 10.1 && lon >= 105.72 && lon <= 105.86,
    result: {
      current: {
        formatted_address: 'phường Ninh Kiều, thành phố Cần Thơ, Việt Nam',
        raw_commune_or_ward_name: 'phường Ninh Kiều',
        raw_district_name: undefined,
        raw_province_name: 'thành phố Cần Thơ',
        provider_name: 'mock',
        raw_payload: { zone: 'can-tho-legacy', mode: 'current' }
      },
      legacy: {
        formatted_address: 'Phường 1, thành phố Sóc Trăng, tỉnh Sóc Trăng, Việt Nam',
        raw_commune_or_ward_name: 'Phường 1',
        raw_district_name: 'thành phố Sóc Trăng',
        raw_province_name: 'tỉnh Sóc Trăng',
        provider_name: 'mock',
        raw_payload: { zone: 'can-tho-legacy', mode: 'legacy' }
      }
    }
  }
];

export class MockReverseGeocodeProvider implements ReverseGeocodeProvider {
  public readonly providerName = 'mock';

  async reverseGeocode(input: ResolveAdminUnitRequest): Promise<ReverseGeocodeBundle> {
    const match = zones.find((zone) => zone.match(input));

    if (match) {
      return match.result;
    }

    return {
      current: {
        formatted_address: `Mock reverse geocode near ${input.lat.toFixed(4)}, ${input.lon.toFixed(4)}`,
        raw_commune_or_ward_name: undefined,
        raw_district_name: undefined,
        raw_province_name: undefined,
        provider_name: this.providerName,
        raw_payload: { zone: 'fallback', input, mode: 'current' }
      },
      legacy: null
    };
  }
}
