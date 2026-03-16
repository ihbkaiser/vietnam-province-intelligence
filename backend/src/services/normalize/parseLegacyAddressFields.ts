import type { ParsedLegacyAddress, ReverseGeocodeCandidate } from '../../types/admin.js';
import { normalizeVietnameseAdminName } from './normalizeVietnameseAdminName.js';

export function parseLegacyAddressFields(candidate: ReverseGeocodeCandidate): ParsedLegacyAddress {
  const legacy_commune_or_ward = candidate.raw_commune_or_ward_name ?? null;
  const legacy_district = candidate.raw_district_name ?? null;
  const legacy_province = candidate.raw_province_name ?? null;

  return {
    legacy_commune_or_ward,
    legacy_district,
    legacy_province,
    normalized_commune_or_ward: legacy_commune_or_ward
      ? normalizeVietnameseAdminName(legacy_commune_or_ward)
      : null,
    normalized_district: legacy_district ? normalizeVietnameseAdminName(legacy_district) : null,
    normalized_province: legacy_province ? normalizeVietnameseAdminName(legacy_province) : null
  };
}

