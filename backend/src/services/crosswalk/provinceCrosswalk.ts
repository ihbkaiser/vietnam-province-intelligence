import { aliasRecords } from '../../data/aliasRecords.js';
import { legacyProvinceMappings } from '../../data/legacyProvinceMappings.js';
import { loadProvinceSeeds } from '../../data/loaders.js';
import type { ProvinceSummary } from '../../types/admin.js';
import { normalizeVietnameseAdminName } from '../normalize/normalizeVietnameseAdminName.js';

const provinces = loadProvinceSeeds();

function provinceSummaryByCode(provinceCode: string): ProvinceSummary | null {
  const province = provinces.find((item) => item.province_code === provinceCode);

  if (!province) {
    return null;
  }

  return {
    province_id: province.province_id,
    province_code: province.province_code,
    province_name: province.province_name,
    province_kind: province.province_kind,
    aliases: province.aliases,
    description: province.description
  };
}

export function resolveProvinceFromName(rawName: string | null | undefined): ProvinceSummary | null {
  const normalized = normalizeVietnameseAdminName(rawName);

  if (!normalized) {
    return null;
  }

  const legacyMatch = legacyProvinceMappings.find(
    (mapping) => normalizeVietnameseAdminName(mapping.legacy_province_name) === normalized
  );
  if (legacyMatch) {
    return provinceSummaryByCode(legacyMatch.current_province_code);
  }

  const aliasMatch = aliasRecords.find(
    (record) => record.entity_type === 'province' && record.normalized_name === normalized
  );

  if (!aliasMatch) {
    return null;
  }

  return provinceSummaryByCode(aliasMatch.entity_code);
}

export function getProvinceByCode(provinceCode: string): ProvinceSummary | null {
  return provinceSummaryByCode(provinceCode);
}

export function listProvinceSummaries(): ProvinceSummary[] {
  return provinces.map((province) => ({
    province_id: province.province_id,
    province_code: province.province_code,
    province_name: province.province_name,
    province_kind: province.province_kind,
    aliases: province.aliases,
    description: province.description
  }));
}

