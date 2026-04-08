import { provinceSeeds } from './provinceSeeds.js';
import type { CommuneSeed, CommuneType, ProvinceSeed } from '../types/admin.js';

interface CommuneSeedInput {
  commune_code: string;
  commune_name: string;
  commune_type: CommuneType;
  aliases?: string[];
}

// Chỉ chứa xã/phường đã được xác minh thật sự.
// Chạy scripts/fetchCommuneSeeds.mjs để lấy toàn bộ dữ liệu từ OSM.
const verifiedCommunes: Record<string, CommuneSeedInput[]> = {
  hanoi: [
    {
      commune_code: 'hanoi-ba-dinh',
      commune_name: 'phường Ba Đình',
      commune_type: 'phuong',
      aliases: ['Ba Dinh Ward', 'Phuong Ba Dinh']
    },
    {
      commune_code: 'hanoi-dong-da',
      commune_name: 'phường Đống Đa',
      commune_type: 'phuong',
      aliases: ['Dong Da Ward', 'Phuong Dong Da']
    }
  ],
  hue: [
    {
      commune_code: 'hue-phu-hoi',
      commune_name: 'phường Phú Hội',
      commune_type: 'phuong',
      aliases: ['Phu Hoi Ward', 'Phuong Phu Hoi']
    },
    {
      commune_code: 'hue-huong-thuy',
      commune_name: 'phường Hương Thủy',
      commune_type: 'phuong',
      aliases: ['Huong Thuy Ward', 'Thi xa Huong Thuy']
    }
  ],
  'da-nang': [
    {
      commune_code: 'da-nang-hai-chau',
      commune_name: 'phường Hải Châu',
      commune_type: 'phuong',
      aliases: ['Hai Chau Ward', 'Phuong Hai Chau']
    },
    {
      commune_code: 'da-nang-hoa-vang',
      commune_name: 'xã Hòa Vang',
      commune_type: 'xa',
      aliases: ['Hoa Vang Commune', 'Xa Hoa Vang']
    }
  ],
  'ho-chi-minh-city': [
    {
      commune_code: 'hcm-ben-thanh',
      commune_name: 'phường Bến Thành',
      commune_type: 'phuong',
      aliases: ['Ben Thanh Ward', 'Phuong Ben Thanh']
    },
    {
      commune_code: 'hcm-thu-duc',
      commune_name: 'phường Thủ Đức',
      commune_type: 'phuong',
      aliases: ['Thu Duc Ward', 'Thanh pho Thu Duc', 'Phuong Phu Hoa', 'phường Phú Hòa']
    }
  ],
  'can-tho': [
    {
      commune_code: 'can-tho-ninh-kieu',
      commune_name: 'phường Ninh Kiều',
      commune_type: 'phuong',
      aliases: ['Ninh Kieu Ward', 'Phuong Ninh Kieu']
    },
    {
      commune_code: 'can-tho-phong-dien',
      commune_name: 'xã Phong Điền',
      commune_type: 'xa',
      aliases: ['Phong Dien Commune', 'Xa Phong Dien']
    }
  ],
  'hai-phong': [
    {
      commune_code: 'hai-phong-hong-bang',
      commune_name: 'phường Hồng Bàng',
      commune_type: 'phuong',
      aliases: ['Hong Bang Ward', 'Phuong Hong Bang']
    },
    {
      commune_code: 'hai-phong-kien-an',
      commune_name: 'phường Kiến An',
      commune_type: 'phuong',
      aliases: ['Kien An Ward', 'Phuong Kien An']
    }
  ]
};

function generateBboxes(province: ProvinceSeed, count: number): CommuneSeed['bbox'][] {
  const [west, south, east, north] = province.bbox;
  const latStep = (north - south) / Math.max(count, 1);

  return Array.from({ length: count }, (_, i): CommuneSeed['bbox'] => [
    west,
    Number((south + i * latStep).toFixed(5)),
    east,
    Number((south + (i + 1) * latStep).toFixed(5))
  ]);
}

export const communeSeeds: CommuneSeed[] = provinceSeeds.flatMap((province) => {
  const seedInputs = verifiedCommunes[province.province_code];

  // Không có dữ liệu thật → bỏ qua, không tạo tên giả
  if (!seedInputs || seedInputs.length === 0) return [];

  const boxes = generateBboxes(province, seedInputs.length);

  return seedInputs.map((seed, index) => ({
    commune_code: seed.commune_code,
    commune_name: seed.commune_name,
    commune_type: seed.commune_type,
    province_code: province.province_code,
    aliases: seed.aliases ?? [],
    bbox: boxes[index]
  }));
});
