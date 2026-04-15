import { Link } from 'react-router-dom';
import type { ProvinceFeatureProperties } from '../types/admin';
import { useProvinceDetail } from '../hooks/useProvinceDetail';

function formatDisplayValue(value: number | string | null | undefined, suffix?: string) {
  if (value == null || value === '') {
    return 'Chưa có dữ liệu';
  }

  if (typeof value === 'number') {
    const formatted = value.toLocaleString('vi-VN');
    return suffix ? `${formatted} ${suffix}` : formatted;
  }

  return value;
}

export function ProvinceInfoCard({
  province
}: {
  province: ProvinceFeatureProperties | null;
}) {
  const { data, loading, error } = useProvinceDetail(province?.province_code);
  const info = data?.province_info ?? null;
  const population = info?.population?.total?.value ?? null;
  const area = info?.area?.total_km2?.value ?? null;
  const rawCenter = data?.reference_snapshot?.administrative_center ?? null;
  // Làm sạch "City, Province" → "TP. City" hoặc chỉ tên thành phố
  const administrativeCenter = rawCenter
    ? rawCenter.replace(/\s*,\s*[^,]+$/, '').replace(/\s+City$/, '').trim() || rawCenter
    : null;

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur">
      <p className="text-xs uppercase tracking-[0.24em] text-tide">Tỉnh đang chọn</p>
      {province ? (
        <div className="mt-4 space-y-5">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">{province.province_name}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/province/${province.province_code}`}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-soft transition hover:bg-tide"
            >
              Xem thông tin chi tiết
            </Link>
          </div>
          <div className="rounded-[1.5rem] border border-white/60 bg-gradient-to-br from-white/95 via-sand/80 to-mist/80 p-4 text-sm text-ink/70 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            {loading ? (
              <p>Đang tải dữ liệu...</p>
            ) : error ? (
              <p>Không tải được dữ liệu tỉnh/thành.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Dân số</p>
                    <p className="mt-2 text-base font-semibold text-ink">{formatDisplayValue(population)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Diện tích</p>
                    <p className="mt-2 text-base font-semibold text-ink">{formatDisplayValue(area, 'km²')}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/85 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Trung tâm hành chính</p>
                  <p className="mt-2 text-sm font-medium text-ink">
                    {administrativeCenter ?? 'Chưa có dữ liệu'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-ink/15 bg-sand/80 p-5 text-sm text-ink/65">
          Bấm vào một vùng trên bản đồ để xem thông tin tỉnh/thành.
        </div>
      )}
    </div>
  );
}
