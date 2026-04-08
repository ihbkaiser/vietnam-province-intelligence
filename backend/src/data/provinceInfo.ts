import { readFileSync } from 'fs';
import path from 'path';

// process.cwd() = thư mục backend/ (nơi tsx được chạy)
const DATA_DIR = path.resolve(process.cwd(), '../provinces_data/Province_in4');

// province_code → JSON filename (không có .json)
const FILE_MAP: Record<string, string> = {
  'hanoi': 'HaNoi',
  'hue': 'Hue',
  'quang-ninh': 'QuangNinh',
  'cao-bang': 'CaoBang',
  'lang-son': 'LangSon',
  'lai-chau': 'LaiChau',
  'dien-bien': 'DienBien',
  'son-la': 'SonLa',
  'thanh-hoa': 'ThanhHoa',
  'nghe-an': 'NgheAn',
  'ha-tinh': 'HaTinh',
  'tuyen-quang': 'TuyenQuang',
  'lao-cai': 'LaoCai',
  'thai-nguyen': 'ThaiNguyen',
  'phu-tho': 'PhuTho',
  'bac-ninh': 'BacNinh',
  'hung-yen': 'HungYen',
  'hai-phong': 'HaiPhong',
  'ninh-binh': 'NinhBinh',
  'quang-tri': 'QuangTri',
  'da-nang': 'DaNang',
  'quang-ngai': 'QuangNgai',
  'gia-lai': 'GiaLai',
  'khanh-hoa': 'KhanhHoa',
  'lam-dong': 'LamDong',
  'dak-lak': 'DakLak',
  'ho-chi-minh-city': 'HoChiMinh',
  'dong-nai': 'DongNai',
  'tay-ninh': 'TayNinh',
  'can-tho': 'CanTho',
  'vinh-long': 'VinhLong',
  'dong-thap': 'DongThap',
  'ca-mau': 'CaMau',
  'an-giang': 'AnGiang'
};

export function loadProvinceInfo(provinceCode: string): Record<string, unknown> | null {
  const filename = FILE_MAP[provinceCode];
  if (!filename) return null;

  try {
    const raw = readFileSync(path.join(DATA_DIR, `${filename}.json`), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error('[provinceInfo] Failed to load', filename, DATA_DIR, err);
    return null;
  }
}
