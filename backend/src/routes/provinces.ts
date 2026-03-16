import { Router } from 'express';
import { loadProvinceGeoJson } from '../data/loaders.js';
import { communeSeeds } from '../data/communeSeeds.js';
import { getProvinceByCode } from '../services/crosswalk/provinceCrosswalk.js';

export const provincesRouter = Router();

provincesRouter.get('/', (_request, response) => {
  response.json(loadProvinceGeoJson());
});

provincesRouter.get('/:provinceCode', (request, response) => {
  const province = getProvinceByCode(request.params.provinceCode);

  if (!province) {
    response.status(404).json({ message: 'Không tìm thấy tỉnh/thành.' });
    return;
  }

  const communeCount = communeSeeds.filter((commune) => commune.province_code === province.province_code).length;

  response.json({
    ...province,
    commune_count: communeCount,
    placeholder_details:
      'Đây là nội dung giữ chỗ cho trang chi tiết. Có thể thay bằng dữ liệu hành chính hoặc dữ liệu kinh tế - xã hội thực tế sau này.'
  });
});
