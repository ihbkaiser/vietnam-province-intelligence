import { findCommuneForPoint, findProvinceForPoint } from '../geo/pointInPolygon.js';
import { parseLegacyAddressFields } from '../normalize/parseLegacyAddressFields.js';
import { resolveCommuneFromNames } from '../crosswalk/communeCrosswalk.js';
import { getProvinceByCode, resolveProvinceFromName } from '../crosswalk/provinceCrosswalk.js';
import { normalizeVietnameseAdminName } from '../normalize/normalizeVietnameseAdminName.js';
import type {
  CurrentMatch,
  ResolveAdminUnitRequest,
  ResolveAdminUnitResponse
} from '../../types/admin.js';
import type { ReverseGeocodeProvider } from '../reverseGeocode/provider.js';

function validateCoordinates(input: ResolveAdminUnitRequest) {
  if (typeof input.lat !== 'number' || Number.isNaN(input.lat)) {
    throw new Error('`lat` must be a valid number.');
  }

  if (typeof input.lon !== 'number' || Number.isNaN(input.lon)) {
    throw new Error('`lon` must be a valid number.');
  }

  if (input.lat < -90 || input.lat > 90) {
    throw new Error('`lat` must be between -90 and 90.');
  }

  if (input.lon < -180 || input.lon > 180) {
    throw new Error('`lon` must be between -180 and 180.');
  }
}

export async function resolveAdminUnit(
  input: ResolveAdminUnitRequest,
  provider: ReverseGeocodeProvider
): Promise<ResolveAdminUnitResponse> {
  validateCoordinates(input);

  const resolutionPath: string[] = ['province_polygon'];
  const debugNotes: string[] = [];

  const provincePolygon = findProvinceForPoint(input.lat, input.lon);
  const provinceFromPolygon = provincePolygon
    ? getProvinceByCode(provincePolygon.properties.province_code)
    : null;

  if (!provinceFromPolygon) {
    debugNotes.push('Point-in-polygon không tìm thấy tỉnh/thành phù hợp trong tập polygon hiện có.');
  }

  const rawReverseGeocode = await provider.reverseGeocode(input);
  resolutionPath.push('openmap_reverse_geocode_admin_v2');
  resolutionPath.push('normalize_names');

  const legacyMatch = parseLegacyAddressFields(rawReverseGeocode.legacy ?? rawReverseGeocode.current);
  const normalizedCurrentCommune = rawReverseGeocode.current.raw_commune_or_ward_name
    ? normalizeVietnameseAdminName(rawReverseGeocode.current.raw_commune_or_ward_name)
    : null;
  const normalizedCurrentProvince = rawReverseGeocode.current.raw_province_name
    ? normalizeVietnameseAdminName(rawReverseGeocode.current.raw_province_name)
    : null;
  const provinceFromProvider = resolveProvinceFromName(rawReverseGeocode.current.raw_province_name);
  const providerConflict = Boolean(provinceFromPolygon && provinceFromProvider
    && provinceFromPolygon.province_code !== provinceFromProvider.province_code);

  if (providerConflict) {
    debugNotes.push(
      `OpenMap trả về ${provinceFromProvider?.province_name}, nhưng point-in-polygon xác định ${provinceFromPolygon?.province_name}; ưu tiên point-in-polygon.`
    );
  }

  const resolvedProvince = provinceFromPolygon ?? provinceFromProvider;
  const communePolygon = resolvedProvince
    ? findCommuneForPoint(input.lat, input.lon, resolvedProvince.province_code)
    : null;

  let currentMatch: CurrentMatch = {
    province_code: resolvedProvince?.province_code ?? null,
    province_name: resolvedProvince?.province_name ?? null,
    commune_code: null,
    commune_name: null,
    commune_type: null
  };

  let alternatives = [] as ResolveAdminUnitResponse['alternatives'];
  let confidence: ResolveAdminUnitResponse['confidence'] = resolvedProvince ? 'medium' : 'low';
  const communeResolution = resolveCommuneFromNames({
    rawCommuneName: rawReverseGeocode.current.raw_commune_or_ward_name,
    resolvedProvinceCode: resolvedProvince?.province_code
  });
  resolutionPath.push('current_ward_lookup_within_resolved_province');

  if (communeResolution.match && communeResolution.isUnique) {
    currentMatch = {
      province_code: resolvedProvince?.province_code ?? null,
      province_name: resolvedProvince?.province_name ?? null,
      commune_code: communeResolution.match.commune_code,
      commune_name: communeResolution.match.commune_name,
      commune_type: communeResolution.match.commune_type
    };
    confidence = 'high';
  } else if (communePolygon && rawReverseGeocode.current.raw_commune_or_ward_name === undefined) {
    currentMatch = {
      province_code: resolvedProvince?.province_code ?? null,
      province_name: resolvedProvince?.province_name ?? null,
      commune_code: communePolygon.properties.commune_code,
      commune_name: communePolygon.properties.commune_name,
      commune_type: communePolygon.properties.commune_type
    };
    confidence = 'medium';
    debugNotes.push('OpenMap không trả về tên xã/phường rõ ràng nên dùng polygon xã/phường làm gợi ý phụ.');
  } else if (resolvedProvince) {
    confidence = 'low';
  }

  alternatives = communeResolution.alternatives;
  debugNotes.push(...communeResolution.explanation);

  if (!resolvedProvince) {
    confidence = 'low';
    debugNotes.push('Không xác định được tỉnh/thành hiện tại cho điểm đã chọn.');
  }

  return {
    input,
    raw_reverse_geocode: rawReverseGeocode,
    normalized: {
      current_commune_or_ward: normalizedCurrentCommune,
      current_province: normalizedCurrentProvince,
      legacy_commune_or_ward: legacyMatch.normalized_commune_or_ward,
      legacy_province: legacyMatch.normalized_province
    },
    legacy_match: {
      legacy_commune_or_ward: legacyMatch.legacy_commune_or_ward,
      legacy_district: legacyMatch.legacy_district,
      legacy_province: legacyMatch.legacy_province
    },
    current_match: currentMatch,
    alternatives,
    confidence,
    resolution_path: resolutionPath,
    debug: {
      province_polygon_match: Boolean(provinceFromPolygon),
      commune_polygon_match: Boolean(communePolygon),
      unique_commune_match: Boolean(communeResolution.match && communeResolution.isUnique),
      crosswalk_used: false,
      provider_conflict: providerConflict,
      notes: debugNotes
    }
  };
}
