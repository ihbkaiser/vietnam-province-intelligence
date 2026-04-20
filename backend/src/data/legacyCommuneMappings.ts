import type { LegacyCommuneMapping } from '../types/admin.js';

export const legacyCommuneMappings: LegacyCommuneMapping[] = [
  {
    legacy_commune_name: 'Phường Phú Hòa',
    legacy_district_name: 'Thủ Dầu Một',
    legacy_province_name: 'Bình Dương',
    current_commune_code: 'hcm-thu-duc',
    mapping_type: 'many_to_one',
    is_default: true
  },
  {
    legacy_commune_name: 'Phường Bến Nghé',
    legacy_district_name: 'Quận 1',
    legacy_province_name: 'Thành phố Hồ Chí Minh',
    current_commune_code: 'hcm-ben-thanh',
    mapping_type: 'one_to_many',
    is_default: true
  },
  {
    legacy_commune_name: 'Phường Hòa Hải',
    legacy_district_name: 'Ngũ Hành Sơn',
    legacy_province_name: 'Quảng Nam',
    current_commune_code: 'da-nang-hai-chau',
    mapping_type: 'many_to_one',
    is_default: true
  },
  {
    legacy_commune_name: 'Phường 1',
    legacy_district_name: 'Thành phố Sóc Trăng',
    legacy_province_name: 'Sóc Trăng',
    current_commune_code: 'can-tho-ninh-kieu',
    mapping_type: 'many_to_one',
    is_default: true
  },
  {
    legacy_commune_name: 'Thị xã Hương Thủy',
    legacy_province_name: 'Huế',
    current_commune_code: 'hue-huong-thuy',
    mapping_type: 'alias',
    is_default: true
  }
];
