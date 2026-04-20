import { Router } from 'express';
import { resolveAddressTextViaOpenMap, resolveAddressViaOpenMap } from '../services/addressLookup/openMapAddressLookup.js';
import { NominatimReverseGeocodeProvider } from '../services/reverseGeocode/nominatimProvider.js';
import { OpenMapReverseGeocodeProvider } from '../services/reverseGeocode/openMapProvider.js';
import { resolveAdminUnit } from '../services/resolver/resolveAdminUnit.js';
import type { ReverseGeocodeProvider } from '../services/reverseGeocode/provider.js';

class FallbackReverseGeocodeProvider implements ReverseGeocodeProvider {
  readonly providerName = 'openmap-with-fallback';

  constructor(
    private readonly primary: ReverseGeocodeProvider,
    private readonly fallback: ReverseGeocodeProvider
  ) {}

  async reverseGeocode(input: { lat: number; lon: number }) {
    try {
      return await this.primary.reverseGeocode(input);
    } catch (error) {
      const fallbackResult = await this.fallback.reverseGeocode(input);

      return {
        ...fallbackResult,
        current: {
          ...fallbackResult.current,
          raw_payload: {
            ...fallbackResult.current.raw_payload,
            fallback_reason: error instanceof Error ? error.message : 'Không rõ nguyên nhân'
          }
        }
      };
    }
  }
}

const nominatimProvider = new NominatimReverseGeocodeProvider();
const provider: ReverseGeocodeProvider = process.env.OPENMAP_API_KEY
  ? new FallbackReverseGeocodeProvider(
      new OpenMapReverseGeocodeProvider({ apiKey: process.env.OPENMAP_API_KEY }),
      nominatimProvider
    )
  : nominatimProvider;

export const resolverRouter = Router();

resolverRouter.post('/resolve-admin-unit', async (request, response) => {
  try {
    const lat = Number(request.body?.lat);
    const lon = Number(request.body?.lon);

    const result = await resolveAdminUnit({ lat, lon }, provider);
    response.json(result);
  } catch {
    response.status(400).json({
      message: 'Không thể tra cứu địa chỉ tại thời điểm này.'
    });
  }
});

resolverRouter.post('/resolve-address', async (request, response) => {
  try {
    const apiKey = process.env.OPENMAP_API_KEY;
    if (!apiKey) {
      response.status(503).json({ message: 'Dịch vụ bản đồ chưa được cấu hình.' });
      return;
    }

    const addressText = typeof request.body?.address_text === 'string' ? request.body.address_text.trim() : null;
    const legacyProvince = typeof request.body?.legacy_province === 'string' ? request.body.legacy_province.trim() : null;
    const legacyDistrict = typeof request.body?.legacy_district === 'string' ? request.body.legacy_district.trim() : null;
    const legacyCommune = typeof request.body?.legacy_commune === 'string' ? request.body.legacy_commune.trim() : null;

    let result;

    if (addressText) {
      // Chế độ nhập địa chỉ tự do
      result = await resolveAddressTextViaOpenMap({ address_text: addressText, apiKey });
    } else if (legacyProvince) {
      // Chế độ nhập theo từng trường
      result = await resolveAddressViaOpenMap({
        commune: legacyCommune,
        district: legacyDistrict,
        province: legacyProvince,
        apiKey
      });
    } else {
      response.status(400).json({ message: 'Vui lòng nhập địa chỉ hoặc tỉnh/thành trước sắp xếp.' });
      return;
    }

    if (!result) {
      response.status(404).json({ message: 'Không tìm thấy địa chỉ phù hợp.' });
      return;
    }

    response.json(result);
  } catch {
    response.status(400).json({
      message: 'Không thể chuyển đổi địa chỉ tại thời điểm này.'
    });
  }
});
