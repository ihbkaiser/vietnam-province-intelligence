import type { ProvinceSeed } from '../types/admin.js';

// Dữ liệu khung tỉnh/thành theo 34 đơn vị hành chính cấp tỉnh có hiệu lực từ 12/6/2025.
export const provinceSeeds: ProvinceSeed[] = [
  {
    province_id: 'p-001',
    province_code: 'hanoi',
    province_name: 'Hà Nội',
    province_kind: 'city',
    aliases: ['Ha Noi', 'Thanh pho Ha Noi'],
    bbox: [105.45, 20.92, 106.05, 21.32],
    description: 'Thủ đô và trung tâm chính trị, hành chính của cả nước.'
  },
  {
    province_id: 'p-002',
    province_code: 'hue',
    province_name: 'Huế',
    province_kind: 'city',
    aliases: ['Hue', 'Thua Thien Hue'],
    bbox: [107.35, 16.12, 108, 16.7],
    description: 'Thành phố di sản ở khu vực miền Trung.'
  },
  {
    province_id: 'p-003',
    province_code: 'quang-ninh',
    province_name: 'Quảng Ninh',
    province_kind: 'province',
    aliases: ['Tinh Quang Ninh'],
    bbox: [107.25, 20.62, 108.7, 21.42],
    description: 'Tỉnh ven biển Đông Bắc, nổi bật với Vịnh Hạ Long và kinh tế cửa khẩu.'
  },
  {
    province_id: 'p-004',
    province_code: 'cao-bang',
    province_name: 'Cao Bằng',
    province_kind: 'province',
    aliases: ['Tinh Cao Bang'],
    bbox: [105.75, 22.2, 107.1, 23.15],
    description: 'Tỉnh miền núi biên giới ở phía Bắc.'
  },
  {
    province_id: 'p-005',
    province_code: 'lang-son',
    province_name: 'Lạng Sơn',
    province_kind: 'province',
    aliases: ['Tinh Lang Son'],
    bbox: [106.75, 21.35, 108, 22.18],
    description: 'Tỉnh biên giới phía Bắc, giữ vai trò kết nối thương mại quan trọng.'
  },
  {
    province_id: 'p-006',
    province_code: 'lai-chau',
    province_name: 'Lai Châu',
    province_kind: 'province',
    aliases: ['Tinh Lai Chau'],
    bbox: [102.05, 22.1, 103.25, 23.15],
    description: 'Tỉnh miền núi Tây Bắc với địa hình đồi núi đặc trưng.'
  },
  {
    province_id: 'p-007',
    province_code: 'dien-bien',
    province_name: 'Điện Biên',
    province_kind: 'province',
    aliases: ['Tinh Dien Bien'],
    bbox: [102.05, 21.05, 103.2, 22.1],
    description: 'Tỉnh biên giới Tây Bắc gắn với các giá trị lịch sử và văn hóa đặc sắc.'
  },
  {
    province_id: 'p-008',
    province_code: 'son-la',
    province_name: 'Sơn La',
    province_kind: 'province',
    aliases: ['Tinh Son La'],
    bbox: [103.2, 21.0, 104.55, 22.1],
    description: 'Tỉnh miền núi Tây Bắc có không gian nông nghiệp và du lịch sinh thái rộng lớn.'
  },
  {
    province_id: 'p-009',
    province_code: 'thanh-hoa',
    province_name: 'Thanh Hóa',
    province_kind: 'province',
    aliases: ['Tinh Thanh Hoa'],
    bbox: [104.45, 18.95, 105.75, 19.95],
    description: 'Tỉnh Bắc Trung Bộ có quy mô dân số, diện tích và hạ tầng kết nối lớn.'
  },
  {
    province_id: 'p-010',
    province_code: 'nghe-an',
    province_name: 'Nghệ An',
    province_kind: 'province',
    aliases: ['Tinh Nghe An'],
    bbox: [103.7, 17.95, 105.2, 18.95],
    description: 'Tỉnh Bắc Trung Bộ có diện tích lớn và vai trò kết nối liên vùng quan trọng.'
  },
  {
    province_id: 'p-011',
    province_code: 'ha-tinh',
    province_name: 'Hà Tĩnh',
    province_kind: 'province',
    aliases: ['Tinh Ha Tinh'],
    bbox: [105.2, 17.35, 106.15, 17.95],
    description: 'Tỉnh Bắc Trung Bộ với thế mạnh công nghiệp, cảng biển và kết nối Bắc - Nam.'
  },
  {
    province_id: 'p-012',
    province_code: 'tuyen-quang',
    province_name: 'Tuyên Quang',
    province_kind: 'province',
    aliases: ['Ha Giang', 'Tinh Tuyen Quang'],
    bbox: [104.55, 21.65, 105.75, 22.55],
    description: 'Tỉnh Tuyên Quang sau sắp xếp, bao gồm không gian Tuyên Quang và Hà Giang trước đây.'
  },
  {
    province_id: 'p-013',
    province_code: 'lao-cai',
    province_name: 'Lào Cai',
    province_kind: 'province',
    aliases: ['Yen Bai', 'Tinh Lao Cai'],
    bbox: [103.25, 22.1, 104.55, 23.15],
    description: 'Tỉnh Lào Cai sau sắp xếp, bao gồm không gian Lào Cai và Yên Bái trước đây.'
  },
  {
    province_id: 'p-014',
    province_code: 'thai-nguyen',
    province_name: 'Thái Nguyên',
    province_kind: 'province',
    aliases: ['Bac Kan', 'Tinh Thai Nguyen'],
    bbox: [105.75, 21.55, 106.75, 22.18],
    description: 'Tỉnh Thái Nguyên sau sắp xếp, bao gồm không gian Thái Nguyên và Bắc Kạn trước đây.'
  },
  {
    province_id: 'p-015',
    province_code: 'phu-tho',
    province_name: 'Phú Thọ',
    province_kind: 'province',
    aliases: ['Hoa Binh', 'Vinh Phuc', 'Tinh Phu Tho'],
    bbox: [104.45, 20.9, 105.45, 21.55],
    description: 'Tỉnh Phú Thọ sau sắp xếp, bao gồm không gian Phú Thọ, Vĩnh Phúc và Hòa Bình trước đây.'
  },
  {
    province_id: 'p-016',
    province_code: 'bac-ninh',
    province_name: 'Bắc Ninh',
    province_kind: 'province',
    aliases: ['Bac Giang', 'Tinh Bac Ninh'],
    bbox: [106.05, 20.92, 106.75, 21.38],
    description: 'Tỉnh Bắc Ninh sau sắp xếp, bao gồm không gian Bắc Ninh và Bắc Giang trước đây.'
  },
  {
    province_id: 'p-017',
    province_code: 'hung-yen',
    province_name: 'Hưng Yên',
    province_kind: 'province',
    aliases: ['Thai Binh', 'Tinh Hung Yen'],
    bbox: [105.75, 20.62, 106.7, 20.92],
    description: 'Tỉnh Hưng Yên sau sắp xếp, bao gồm không gian Hưng Yên và Thái Bình trước đây.'
  },
  {
    province_id: 'p-018',
    province_code: 'hai-phong',
    province_name: 'Hải Phòng',
    province_kind: 'city',
    aliases: ['Hai Duong', 'Thanh pho Hai Phong'],
    bbox: [106.75, 20.02, 107.55, 20.62],
    description: 'Thành phố Hải Phòng sau sắp xếp, bao gồm không gian Hải Phòng và Hải Dương trước đây.'
  },
  {
    province_id: 'p-019',
    province_code: 'ninh-binh',
    province_name: 'Ninh Bình',
    province_kind: 'province',
    aliases: ['Ha Nam', 'Nam Dinh', 'Tinh Ninh Binh'],
    bbox: [105.35, 19.95, 106.2, 20.62],
    description: 'Tỉnh Ninh Bình sau sắp xếp, bao gồm không gian Ninh Bình, Hà Nam và Nam Định trước đây.'
  },
  {
    province_id: 'p-020',
    province_code: 'quang-tri',
    province_name: 'Quảng Trị',
    province_kind: 'province',
    aliases: ['Quang Binh', 'Tinh Quang Tri'],
    bbox: [106.15, 16.55, 107.35, 17.95],
    description: 'Tỉnh Quảng Trị sau sắp xếp, bao gồm không gian Quảng Trị và Quảng Bình trước đây.'
  },
  {
    province_id: 'p-021',
    province_code: 'da-nang',
    province_name: 'Đà Nẵng',
    province_kind: 'city',
    aliases: ['Quang Nam', 'Thanh pho Da Nang'],
    bbox: [108, 15.72, 108.62, 16.12],
    description: 'Thành phố Đà Nẵng sau sắp xếp, bao gồm không gian Đà Nẵng và Quảng Nam trước đây.'
  },
  {
    province_id: 'p-022',
    province_code: 'quang-ngai',
    province_name: 'Quảng Ngãi',
    province_kind: 'province',
    aliases: ['Kon Tum', 'Tinh Quang Ngai'],
    bbox: [107.35, 14.65, 108.82, 15.72],
    description: 'Tỉnh Quảng Ngãi sau sắp xếp, bao gồm không gian Quảng Ngãi và Kon Tum trước đây.'
  },
  {
    province_id: 'p-023',
    province_code: 'gia-lai',
    province_name: 'Gia Lai',
    province_kind: 'province',
    aliases: ['Binh Dinh', 'Tinh Gia Lai'],
    bbox: [107.45, 13.35, 108.95, 14.65],
    description: 'Tỉnh Gia Lai sau sắp xếp, bao gồm không gian Gia Lai và Bình Định trước đây.'
  },
  {
    province_id: 'p-024',
    province_code: 'khanh-hoa',
    province_name: 'Khánh Hòa',
    province_kind: 'province',
    aliases: ['Ninh Thuan', 'Tinh Khanh Hoa'],
    bbox: [108.42, 12.02, 109.42, 13.35],
    description: 'Tỉnh Khánh Hòa sau sắp xếp, bao gồm không gian Khánh Hòa và Ninh Thuận trước đây.'
  },
  {
    province_id: 'p-025',
    province_code: 'lam-dong',
    province_name: 'Lâm Đồng',
    province_kind: 'province',
    aliases: ['Dak Nong', 'Binh Thuan', 'Tinh Lam Dong'],
    bbox: [107.1, 10.75, 108.82, 12.02],
    description: 'Tỉnh Lâm Đồng sau sắp xếp, bao gồm không gian Lâm Đồng, Đắk Nông và Bình Thuận trước đây.'
  },
  {
    province_id: 'p-026',
    province_code: 'dak-lak',
    province_name: 'Đắk Lắk',
    province_kind: 'province',
    aliases: ['Phu Yen', 'Tinh Dak Lak'],
    bbox: [107.05, 12.02, 108.42, 13.35],
    description: 'Tỉnh Đắk Lắk sau sắp xếp, bao gồm không gian Đắk Lắk và Phú Yên trước đây.'
  },
  {
    province_id: 'p-027',
    province_code: 'ho-chi-minh-city',
    province_name: 'Thành phố Hồ Chí Minh',
    province_kind: 'city',
    aliases: ['Sai Gon', 'Binh Duong', 'Ba Ria Vung Tau', 'Thanh pho Ho Chi Minh'],
    bbox: [106.28, 10.38, 107.15, 11.08],
    description: 'Thành phố Hồ Chí Minh sau sắp xếp, bao gồm không gian Thành phố Hồ Chí Minh, Bình Dương và Bà Rịa - Vũng Tàu trước đây.'
  },
  {
    province_id: 'p-028',
    province_code: 'dong-nai',
    province_name: 'Đồng Nai',
    province_kind: 'province',
    aliases: ['Binh Phuoc', 'Tinh Dong Nai'],
    bbox: [107.15, 10.42, 108.05, 11.25],
    description: 'Tỉnh Đồng Nai sau sắp xếp, bao gồm không gian Đồng Nai và Bình Phước trước đây.'
  },
  {
    province_id: 'p-029',
    province_code: 'tay-ninh',
    province_name: 'Tây Ninh',
    province_kind: 'province',
    aliases: ['Long An', 'Tinh Tay Ninh'],
    bbox: [105.35, 10.62, 106.28, 11.35],
    description: 'Tỉnh Tây Ninh sau sắp xếp, bao gồm không gian Tây Ninh và Long An trước đây.'
  },
  {
    province_id: 'p-030',
    province_code: 'can-tho',
    province_name: 'Cần Thơ',
    province_kind: 'city',
    aliases: ['Soc Trang', 'Hau Giang', 'Thanh pho Can Tho'],
    bbox: [105.02, 9.4, 105.82, 10.02],
    description: 'Thành phố Cần Thơ sau sắp xếp, bao gồm không gian Cần Thơ, Sóc Trăng và Hậu Giang trước đây.'
  },
  {
    province_id: 'p-031',
    province_code: 'vinh-long',
    province_name: 'Vĩnh Long',
    province_kind: 'province',
    aliases: ['Ben Tre', 'Tra Vinh', 'Tinh Vinh Long'],
    bbox: [105.82, 9.42, 106.52, 10.02],
    description: 'Tỉnh Vĩnh Long sau sắp xếp, bao gồm không gian Vĩnh Long, Bến Tre và Trà Vinh trước đây.'
  },
  {
    province_id: 'p-032',
    province_code: 'dong-thap',
    province_name: 'Đồng Tháp',
    province_kind: 'province',
    aliases: ['Tien Giang', 'Tinh Dong Thap'],
    bbox: [105.05, 10.02, 105.82, 10.72],
    description: 'Tỉnh Đồng Tháp sau sắp xếp, bao gồm không gian Đồng Tháp và Tiền Giang trước đây.'
  },
  {
    province_id: 'p-033',
    province_code: 'ca-mau',
    province_name: 'Cà Mau',
    province_kind: 'province',
    aliases: ['Bac Lieu', 'Tinh Ca Mau'],
    bbox: [104.42, 8.2, 105.72, 9.4],
    description: 'Tỉnh Cà Mau sau sắp xếp, bao gồm không gian Cà Mau và Bạc Liêu trước đây.'
  },
  {
    province_id: 'p-034',
    province_code: 'an-giang',
    province_name: 'An Giang',
    province_kind: 'province',
    aliases: ['Kien Giang', 'Tinh An Giang'],
    bbox: [104.35, 9.78, 105.05, 10.72],
    description: 'Tỉnh An Giang sau sắp xếp, bao gồm không gian An Giang và Kiên Giang trước đây.'
  }
];
