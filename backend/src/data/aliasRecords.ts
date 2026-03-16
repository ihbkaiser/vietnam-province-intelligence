import { communeSeeds } from './communeSeeds.js';
import { provinceSeeds } from './provinceSeeds.js';
import type { AliasRecord } from '../types/admin.js';
import { normalizeVietnameseAdminName } from '../services/normalize/normalizeVietnameseAdminName.js';

const provinceAliases: AliasRecord[] = provinceSeeds.flatMap((province) => [
  province.province_name,
  ...province.aliases
].map((rawName) => ({
  raw_name: rawName,
  normalized_name: normalizeVietnameseAdminName(rawName),
  entity_type: 'province' as const,
  entity_code: province.province_code
})));

const communeAliases: AliasRecord[] = communeSeeds.flatMap((commune) => [
  commune.commune_name,
  ...commune.aliases
].map((rawName) => ({
  raw_name: rawName,
  normalized_name: normalizeVietnameseAdminName(rawName),
  entity_type: 'commune' as const,
  entity_code: commune.commune_code
})));

export const aliasRecords: AliasRecord[] = [...provinceAliases, ...communeAliases];

