import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProvinceSummary } from '../types/admin.js';
import { normalizeVietnameseAdminName } from '../services/normalize/normalizeVietnameseAdminName.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// Trong Docker: currentDir = /app/dist/data/, ../../src/data/province_in4 = /app/src/data/province_in4
// Trong dev: currentDir = dist/data/, ../../src/data/province_in4 = src/data/province_in4
const DATA_DIR = path.resolve(currentDir, '../../src/data/province_in4');

function normalizeFileBasename(fileBasename: string): string {
  return normalizeVietnameseAdminName(fileBasename.replace(/([a-z])([A-Z])/g, '$1 $2'));
}

function buildProvinceInfoLookup(): Map<string, string> {
  const files = readdirSync(DATA_DIR).filter((file) => file.endsWith('.json'));
  const lookup = new Map<string, string>();

  for (const file of files) {
    const basename = path.basename(file, '.json');
    lookup.set(normalizeFileBasename(basename), path.join(DATA_DIR, file));
  }

  return lookup;
}

function buildCandidateKeys(province: Pick<ProvinceSummary, 'province_code' | 'province_name' | 'aliases'>): string[] {
  const keys = new Set<string>();

  const addKey = (value: string | null | undefined) => {
    const normalized = normalizeVietnameseAdminName(value);
    if (normalized) {
      keys.add(normalized);
    }
  };

  addKey(province.province_name);
  addKey(province.province_code);
  addKey(province.province_code.replace(/-/g, ' '));
  addKey(province.province_code.replace(/-city$/, '').replace(/-/g, ' '));

  for (const alias of province.aliases) {
    addKey(alias);
  }

  return [...keys];
}

const provinceInfoLookup = buildProvinceInfoLookup();

function resolveProvinceInfoPath(province: Pick<ProvinceSummary, 'province_code' | 'province_name' | 'aliases'>): string | null {
  for (const key of buildCandidateKeys(province)) {
    const filePath = provinceInfoLookup.get(key);
    if (filePath) {
      return filePath;
    }
  }

  return null;
}

export function loadProvinceInfo(
  province: Pick<ProvinceSummary, 'province_code' | 'province_name' | 'aliases'>
): Record<string, unknown> | null {
  const filePath = resolveProvinceInfoPath(province);

  if (!filePath) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const stripped = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch (err) {
    console.error('[provinceInfo] Failed to load', province.province_code, filePath, err);
    return null;
  }
}
