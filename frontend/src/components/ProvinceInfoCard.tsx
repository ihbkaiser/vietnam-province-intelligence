import { Link } from 'react-router-dom';
import type { ProvinceDisplayValue, ProvinceFeatureProperties } from '../types/admin';
import { useProvinceDetail } from '../hooks/useProvinceDetail';

function parseNumeric(value: ProvinceDisplayValue | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (cleaned.includes('.') && !cleaned.includes(',')) {
    const parts = cleaned.split('.');
    const parsed = parts.length > 1 && parts.slice(1).every((p) => p.length === 3)
      ? Number(parts.join(''))
      : Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    const parts = cleaned.split(',');
    const parsed = parts.length > 1 && parts.slice(1).every((p) => p.length === 3)
      ? Number(parts.join(''))
      : Number(cleaned.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatArea(value: number | null) {
  if (value == null) return 'Chưa có dữ liệu';
  return `${value.toLocaleString('vi-VN')} km²`;
}

function formatPopulation(value: number | null) {
  if (value == null) return 'Chưa có dữ liệu';
  return value.toLocaleString('vi-VN');
}

export function ProvinceInfoCard({
  province
}: {
  province: ProvinceFeatureProperties | null;
}) {
  const { data, loading, error } = useProvinceDetail(province?.province_code);
  const info = data?.province_info ?? null;
  const ref = data?.reference_snapshot ?? null;

  // Ưu tiên reference_snapshot (đầy đủ hơn), fallback về province_info
  const population = ref?.population ?? parseNumeric(info?.population?.total?.value);
  const area = ref?.area_km2 ?? parseNumeric(info?.area?.total_km2?.value);

  const rawCenter = ref?.administrative_center ?? null;
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
                    <p className="mt-2 text-base font-semibold text-ink">{formatPopulation(population)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Diện tích</p>
                    <p className="mt-2 text-base font-semibold text-ink">{formatArea(area)}</p>
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
