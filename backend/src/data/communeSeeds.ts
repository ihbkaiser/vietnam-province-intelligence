import { provinceSeeds } from './provinceSeeds.js';
import type { CommuneSeed, CommuneType, ProvinceSeed } from '../types/admin.js';

interface CommuneSeedInput {
  commune_code: string;
  commune_name: string;
  commune_type: CommuneType;
  aliases?: string[];
}

const communeOverrides: Record<string, CommuneSeedInput[]> = {
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

function splitProvinceBox(province: ProvinceSeed): [CommuneSeed['bbox'], CommuneSeed['bbox']] {
  const [west, south, east, north] = province.bbox;
  const midLat = Number(((south + north) / 2).toFixed(5));

  return [
    [west, midLat, east, north],
    [west, south, east, midLat]
  ];
}

function defaultCommunes(province: ProvinceSeed): CommuneSeedInput[] {
  const primaryType: CommuneType = province.province_kind === 'city' ? 'phuong' : 'xa';
  const secondaryType: CommuneType = province.province_kind === 'city' ? 'phuong' : 'phuong';
  const provinceLabel = province.province_name.replace(/^Thành phố /, '');

  return [
    {
      commune_code: `${province.province_code}-center`,
      commune_name: `${primaryType === 'phuong' ? 'phường' : 'xã'} Trung tâm ${provinceLabel}`,
      commune_type: primaryType,
      aliases: [`Trung tam ${provinceLabel}`]
    },
    {
      commune_code: `${province.province_code}-south`,
      commune_name: `${secondaryType === 'phuong' ? 'phường' : 'xã'} Phía Nam ${provinceLabel}`,
      commune_type: secondaryType,
      aliases: [`Phia nam ${provinceLabel}`]
    }
  ];
}

export const communeSeeds: CommuneSeed[] = provinceSeeds.flatMap((province) => {
  const seedInputs = communeOverrides[province.province_code] ?? defaultCommunes(province);
  const boxes = splitProvinceBox(province);

  return seedInputs.slice(0, 2).map((seed, index) => ({
    commune_code: seed.commune_code,
    commune_name: seed.commune_name,
    commune_type: seed.commune_type,
    province_code: province.province_code,
    aliases: seed.aliases ?? [],
    bbox: boxes[index]
  }));
});
