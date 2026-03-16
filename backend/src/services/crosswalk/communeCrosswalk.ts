import { aliasRecords } from '../../data/aliasRecords.js';
import { loadCommuneSeeds } from '../../data/loaders.js';
import type {
  CommuneSeed, 
  ResolutionAlternative
} from '../../types/admin.js';
import { normalizeVietnameseAdminName } from '../normalize/normalizeVietnameseAdminName.js';

const communes = loadCommuneSeeds();

interface CommuneResolutionCandidate {
  match: CommuneSeed | null;
  alternatives: ResolutionAlternative[];
  isUnique: boolean;
  explanation: string[];
}

function toAlternative(commune: CommuneSeed, reason: string): ResolutionAlternative {
  return {
    commune_code: commune.commune_code,
    commune_name: commune.commune_name,
    commune_type: commune.commune_type,
    province_code: commune.province_code,
    reason
  };
}

function listCommuneCandidatesByProvince(provinceCode: string): CommuneSeed[] {
  return communes.filter((commune) => commune.province_code === provinceCode);
}

export function resolveCommuneFromNames(params: {
  rawCommuneName?: string | null;
  resolvedProvinceCode?: string | null;
}): CommuneResolutionCandidate {
  const normalizedCommune = normalizeVietnameseAdminName(params.rawCommuneName);

  if (!params.resolvedProvinceCode) {
    return {
      match: null,
      alternatives: [],
      isUnique: false,
      explanation: ['Không xác định được tỉnh/thành hiện tại nên bỏ qua bước tra cứu xã/phường.']
    };
  }

  const candidates = listCommuneCandidatesByProvince(params.resolvedProvinceCode);
  if (!candidates.length) {
    return {
      match: null,
      alternatives: [],
      isUnique: false,
      explanation: ['Chưa có dữ liệu xã/phường hiện tại cho tỉnh/thành đã xác định.']
    };
  }

  const exactNameMatches = candidates.filter(
    (candidate) => normalizeVietnameseAdminName(candidate.commune_name) === normalizedCommune
  );
  if (exactNameMatches.length === 1) {
    return {
      match: exactNameMatches[0],
      alternatives: [],
      isUnique: true,
      explanation: ['Khớp duy nhất theo tên xã/phường hiện tại sau khi chuẩn hóa trong phạm vi tỉnh/thành đã xác định.']
    };
  }
  if (exactNameMatches.length > 1) {
    return {
      match: null,
      alternatives: exactNameMatches.map((candidate) =>
        toAlternative(candidate, 'Trùng nhiều xã/phường hiện tại sau chuẩn hóa')
      ),
      isUnique: false,
      explanation: ['Có nhiều xã/phường hiện tại cùng khớp tên trong tỉnh/thành đã xác định.']
    };
  }

  const aliasMatches = aliasRecords.filter(
    (record) =>
      record.entity_type === 'commune' &&
      record.normalized_name === normalizedCommune &&
      candidates.some((candidate) => candidate.commune_code === record.entity_code)
  );
  const aliasCodes = [...new Set(aliasMatches.map((record) => record.entity_code))];
  if (aliasCodes.length === 1) {
    const aliasMatch = candidates.find((candidate) => candidate.commune_code === aliasCodes[0]) ?? null;
    return {
      match: aliasMatch,
      alternatives: [],
      isUnique: true,
      explanation: ['Khớp duy nhất theo alias xã/phường hiện tại trong phạm vi tỉnh/thành đã xác định.']
    };
  }
  if (aliasCodes.length > 1) {
    return {
      match: null,
      alternatives: aliasCodes
        .map((communeCode) => candidates.find((candidate) => candidate.commune_code === communeCode) ?? null)
        .filter((candidate): candidate is CommuneSeed => Boolean(candidate))
        .map((candidate) => toAlternative(candidate, 'Nhiều alias cùng khớp trong tỉnh/thành đã xác định')),
      isUnique: false,
      explanation: ['Có nhiều xã/phường hiện tại cùng khớp alias trong tỉnh/thành đã xác định.']
    };
  }

  const fuzzyMatches = candidates.filter((candidate) => {
    const normalizedCandidate = normalizeVietnameseAdminName(candidate.commune_name);
    return normalizedCommune && (
      normalizedCandidate.includes(normalizedCommune) || normalizedCommune.includes(normalizedCandidate)
    );
  });

  if (fuzzyMatches.length) {
    return {
      match: fuzzyMatches.length === 1 ? fuzzyMatches[0] : null,
      alternatives: fuzzyMatches.slice(fuzzyMatches.length === 1 ? 1 : 0).map((candidate) =>
        toAlternative(candidate, 'Khớp mờ tên xã/phường')
      ),
      isUnique: fuzzyMatches.length === 1,
      explanation: [
        fuzzyMatches.length === 1
          ? 'Khớp duy nhất theo so khớp mờ trong phạm vi tỉnh/thành đã xác định.'
          : 'Có nhiều ứng viên xã/phường khớp mờ nên không thể trả về kết quả duy nhất.'
      ]
    };
  }

  return {
    match: null,
    alternatives: candidates.slice(0, 3).map((candidate) =>
      toAlternative(candidate, 'Không tìm thấy khớp duy nhất, hiển thị các xã/phường mẫu trong tỉnh/thành')
    ),
    isUnique: false,
    explanation: ['Không tìm thấy tên xã/phường hiện tại khớp trong phạm vi tỉnh/thành đã xác định.']
  };
}
