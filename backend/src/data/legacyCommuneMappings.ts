import type { LegacyCommuneMapping } from '../types/admin.js';

export const legacyCommuneMappings: LegacyCommuneMapping[] = [
  {
    legacy_commune_name: 'Phu Hoa Ward',
    legacy_district_name: 'Thu Dau Mot',
    legacy_province_name: 'Binh Duong',
    current_commune_code: 'hcm-thu-duc',
    mapping_type: 'many_to_one',
    is_default: true
  },
  {
    legacy_commune_name: 'Ben Nghe Ward',
    legacy_district_name: 'District 1',
    legacy_province_name: 'Ho Chi Minh City',
    current_commune_code: 'hcm-ben-thanh',
    mapping_type: 'one_to_many',
    is_default: true
  },
  {
    legacy_commune_name: 'Hoa Hai Ward',
    legacy_district_name: 'Ngu Hanh Son',
    legacy_province_name: 'Quang Nam',
    current_commune_code: 'da-nang-hai-chau',
    mapping_type: 'many_to_one',
    is_default: true
  },
  {
    legacy_commune_name: 'Ward 1',
    legacy_district_name: 'Soc Trang City',
    legacy_province_name: 'Soc Trang',
    current_commune_code: 'can-tho-ninh-kieu',
    mapping_type: 'many_to_one',
    is_default: true
  },
  {
    legacy_commune_name: 'Huong Thuy Town',
    legacy_province_name: 'Hue',
    current_commune_code: 'hue-huong-thuy',
    mapping_type: 'alias',
    is_default: true
  }
];

