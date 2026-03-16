import { Link } from 'react-router-dom';
import type { ProvinceFeatureProperties } from '../types/admin';

export function ProvinceInfoCard({
  province,
  selectedPoint,
  resolving
}: {
  province: ProvinceFeatureProperties | null;
  selectedPoint: { lat: number; lon: number } | null;
  resolving: boolean;
}) {
  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur">
      <p className="text-xs uppercase tracking-[0.24em] text-tide">Điểm đang chọn</p>
      {province ? (
        <div className="mt-4 space-y-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">{province.province_name}</h2>
            <p className="mt-1 text-sm text-ink/60">{province.province_code}</p>
          </div>
          {selectedPoint ? (
            <div className="rounded-2xl bg-mist/70 p-4 text-sm text-ink/70">
              <p>
                `lat`: {selectedPoint.lat.toFixed(6)}
              </p>
              <p>
                `lon`: {selectedPoint.lon.toFixed(6)}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/province/${province.province_code}`}
              className="rounded-full bg-ink px-4 py-2 text-sm text-white transition hover:bg-tide"
            >
              Xem chi tiết tỉnh/thành
            </Link>
            <span className="rounded-full bg-sand px-4 py-2 text-sm text-ink/70">
              {resolving ? 'Đang phân giải từ điểm bấm...' : 'Bấm lên bản đồ để lấy địa chỉ'}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-ink/15 bg-sand/80 p-5 text-sm text-ink/65">
          Bấm vào một vùng trên bản đồ để lấy `lat`, `lon` và tra cứu địa chỉ.
        </div>
      )}
    </div>
  );
}
