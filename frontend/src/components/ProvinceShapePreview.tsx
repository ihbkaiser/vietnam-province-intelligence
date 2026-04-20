import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import type { ProvinceCollection } from '../types/admin';

interface ProvinceShapePreviewProps {
  feature: ProvinceCollection['features'][number] | null;
  provinceName: string;
}

export function ProvinceShapePreview({ feature, provinceName }: ProvinceShapePreviewProps) {
  if (!feature) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-white/40 bg-white/10 text-sm text-white/75">
        Đang tải hình dạng tỉnh
      </div>
    );
  }

  const projection = geoMercator().fitExtent(
    [
      [24, 24],
      [296, 296]
    ],
    feature as GeoPermissibleObjects
  );
  const pathData = geoPath(projection)(feature as GeoPermissibleObjects) ?? '';

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/35 bg-white/10 p-5">
      <div className="absolute inset-x-8 top-6 h-px bg-white/30" />
      <svg viewBox="0 0 320 320" className="relative mx-auto h-[280px] w-full max-w-[280px]">
        <defs>
          <linearGradient id="province-shape-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7f1e6" />
            <stop offset="55%" stopColor="#dce8e6" />
            <stop offset="100%" stopColor="#9fd6cf" />
          </linearGradient>
        </defs>
        <path d={pathData} fill="url(#province-shape-fill)" stroke="#ffffff" strokeWidth="2.75" />
      </svg>
      <div className="relative mt-2 rounded-lg bg-white/12 px-4 py-3 text-center text-sm text-white/90 backdrop-blur">
        Hình dáng minh họa của {provinceName}
      </div>
    </div>
  );
}
