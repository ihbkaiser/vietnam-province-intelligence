import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProvinceReferenceSnapshot, ProvinceSummary } from '../types/admin.js';
import { normalizeVietnameseAdminName } from '../services/normalize/normalizeVietnameseAdminName.js';

interface ProvinceReferenceFile {
  generated_at: string;
  source: {
    name: string;
    url: string;
    terms_url?: string;
    note?: string;
  };
  provinces: ProvinceReferenceSnapshot[];
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(currentDir, 'tinhThanhVnProvinceReference.json');

function loadReferenceFile() {
  const raw = readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw) as ProvinceReferenceFile;
}

function buildReferenceLookup() {
  const lookup = new Map<string, ProvinceReferenceSnapshot>();

  for (const snapshot of loadReferenceFile().provinces) {
    const keys = [
      snapshot.province_name,
      snapshot.province_name_full,
      snapshot.source_slug.replace(/-/g, ' ')
    ];

    for (const key of keys) {
      const normalized = normalizeVietnameseAdminName(key);
      if (normalized) {
        lookup.set(normalized, snapshot);
      }
    }
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

const provinceReferenceLookup = buildReferenceLookup();

export function loadProvinceReference(
  province: Pick<ProvinceSummary, 'province_code' | 'province_name' | 'aliases'>
): ProvinceReferenceSnapshot | null {
  for (const key of buildCandidateKeys(province)) {
    const snapshot = provinceReferenceLookup.get(key);
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}
