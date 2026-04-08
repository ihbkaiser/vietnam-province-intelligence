import { Router } from 'express';
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
            fallback_reason: error instanceof Error ? error.message : 'unknown'
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
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Lỗi không xác định trong pipeline phân giải địa chỉ.'
    });
  }
});
