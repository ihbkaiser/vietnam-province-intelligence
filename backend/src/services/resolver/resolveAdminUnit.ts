import { findCommuneForPoint, findProvinceForPoint } from '../geo/pointInPolygon.js';
import { parseLegacyAddressFields } from '../normalize/parseLegacyAddressFields.js';
import {
  resolveCommuneFromLegacyName,
  resolveCommuneFromNames
} from '../crosswalk/communeCrosswalk.js';
import { getProvinceByCode, resolveProvinceFromName } from '../crosswalk/provinceCrosswalk.js';
import { normalizeVietnameseAdminName } from '../normalize/normalizeVietnameseAdminName.js';
import type {
  CommuneType,
  CurrentMatch,
  ParsedLegacyAddress,
  ResolveAdminUnitRequest,
  ResolveAdminUnitResponse
} from '../../types/admin.js';
import type { ReverseGeocodeProvider } from '../reverseGeocode/provider.js';

function inferCommuneType(name: string): CommuneType {
  const lower = name.toLowerCase();
  if (/^(phường|thị trấn)\b/.test(lower)) return 'phuong';
  if (/^đặc khu\b/.test(lower)) return 'dac_khu';
  return 'xa';
}

const EMPTY_LEGACY: ParsedLegacyAddress = {
  legacy_commune_or_ward: null,
  legacy_district: null,
  legacy_province: null,
  normalized_commune_or_ward: null,
  normalized_district: null,
  normalized_province: null
};

function validateCoordinates(input: ResolveAdminUnitRequest) {
  if (typeof input.lat !== 'number' || Number.isNaN(input.lat)) {
    throw new Error('Vĩ độ phải là số hợp lệ.');
  }

  if (typeof input.lon !== 'number' || Number.isNaN(input.lon)) {
    throw new Error('Kinh độ phải là số hợp lệ.');
  }

  if (input.lat < -90 || input.lat > 90) {
    throw new Error('Vĩ độ phải nằm trong khoảng từ -90 đến 90.');
  }

  if (input.lon < -180 || input.lon > 180) {
    throw new Error('Kinh độ phải nằm trong khoảng từ -180 đến 180.');
  }
}

export async function resolveAdminUnit(
  input: ResolveAdminUnitRequest,
  provider: ReverseGeocodeProvider
): Promise<ResolveAdminUnitResponse> {
  validateCoordinates(input);

  const resolutionPath: string[] = ['province_polygon'];
  const debugNotes: string[] = [];

  // Bước 1: Xác định tỉnh/thành bằng point-in-polygon (34 đơn vị mới)
  const provincePolygon = findProvinceForPoint(input.lat, input.lon);
  const provinceFromPolygon = provincePolygon
    ? getProvinceByCode(provincePolygon.properties.province_code)
    : null;

  if (!provinceFromPolygon) {
    debugNotes.push('Point-in-polygon không tìm thấy tỉnh/thành phù hợp trong tập polygon hiện có.');
  }

  // Bước 2: Reverse geocoding để lấy tên xã/phường
  const rawReverseGeocode = await provider.reverseGeocode(input);
  resolutionPath.push(`${provider.providerName}_reverse_geocode`);
  resolutionPath.push('normalize_names');

  // Bước 3: Phân tích địa chỉ cũ – chỉ khi provider có trả về legacy
  const legacyMatch: ParsedLegacyAddress = rawReverseGeocode.legacy
    ? parseLegacyAddressFields(rawReverseGeocode.legacy)
    : EMPTY_LEGACY;

  const normalizedCurrentCommune = rawReverseGeocode.current.raw_commune_or_ward_name
    ? normalizeVietnameseAdminName(rawReverseGeocode.current.raw_commune_or_ward_name)
    : null;
  const normalizedCurrentProvince = rawReverseGeocode.current.raw_province_name
    ? normalizeVietnameseAdminName(rawReverseGeocode.current.raw_province_name)
    : null;
  const provinceFromProvider = resolveProvinceFromName(rawReverseGeocode.current.raw_province_name);
  const providerConflict = Boolean(
    provinceFromPolygon &&
    provinceFromProvider &&
    provinceFromPolygon.province_code !== provinceFromProvider.province_code
  );

  if (providerConflict) {
    debugNotes.push(
      `Provider trả về ${provinceFromProvider?.province_name}, nhưng point-in-polygon xác định ${provinceFromPolygon?.province_name}; ưu tiên point-in-polygon.`
    );
  }

  const resolvedProvince = provinceFromPolygon ?? provinceFromProvider;
  const communePolygon = resolvedProvince
    ? findCommuneForPoint(input.lat, input.lon, resolvedProvince.province_code)
    : null;

  // Khởi tạo commune_name ngay từ geocoder — luôn hiển thị dù không có trong seeds local
  const geocoderCommuneName = rawReverseGeocode.current.raw_commune_or_ward_name ?? null;

  let currentMatch: CurrentMatch = {
    province_code: resolvedProvince?.province_code ?? null,
    province_name: resolvedProvince?.province_name ?? null,
    commune_code: null,
    commune_name: geocoderCommuneName,
    commune_type: geocoderCommuneName ? inferCommuneType(geocoderCommuneName) : null
  };

  let alternatives = [] as ResolveAdminUnitResponse['alternatives'];
  let confidence: ResolveAdminUnitResponse['confidence'] = resolvedProvince
    ? geocoderCommuneName ? 'medium' : 'low'
    : 'low';
  let crosswalkUsed = false;

  // Bước 4: Tra cứu xã/phường theo tên hiện tại trong seeds local — nâng confidence lên 'high'
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
  } else if (!geocoderCommuneName && communePolygon) {
    // Không có tên từ provider → dùng polygon commune làm fallback
    currentMatch = {
      province_code: resolvedProvince?.province_code ?? null,
      province_name: resolvedProvince?.province_name ?? null,
      commune_code: communePolygon.properties.commune_code,
      commune_name: communePolygon.properties.commune_name,
      commune_type: communePolygon.properties.commune_type
    };
    confidence = 'medium';
    debugNotes.push('Provider không trả về tên xã/phường rõ ràng nên dùng polygon commune làm gợi ý phụ.');
  }

  alternatives = communeResolution.alternatives;
  debugNotes.push(...communeResolution.explanation);

  // Bước 5: Thử crosswalk từ tên xã/phường cũ nếu chưa có commune_code
  if (!currentMatch.commune_code && rawReverseGeocode.legacy) {
    const crosswalkMatch = resolveCommuneFromLegacyName({
      legacyCommuneName: legacyMatch.legacy_commune_or_ward,
      legacyDistrictName: legacyMatch.legacy_district,
      legacyProvinceName: legacyMatch.legacy_province
    });

    if (crosswalkMatch) {
      currentMatch = {
        province_code: resolvedProvince?.province_code ?? null,
        province_name: resolvedProvince?.province_name ?? null,
        commune_code: crosswalkMatch.commune_code,
        commune_name: crosswalkMatch.commune_name,
        commune_type: crosswalkMatch.commune_type
      };
      crosswalkUsed = true;
      resolutionPath.push('legacy_commune_crosswalk');
      debugNotes.push('Xã/phường hiện tại được xác định qua crosswalk từ tên địa giới cũ.');
    }
  }

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
      crosswalk_used: crosswalkUsed,
      provider_conflict: providerConflict,
      notes: debugNotes
    }
  };
}
