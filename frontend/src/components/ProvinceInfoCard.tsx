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

  // Ưu tiên nguồn tham chiếu đầy đủ hơn, sau đó dùng hồ sơ tỉnh có sẵn.
  const population = ref?.population ?? parseNumeric(info?.population?.total?.value);
  const area = ref?.area_km2 ?? parseNumeric(info?.area?.total_km2?.value);

  const rawCenter = ref?.administrative_center ?? null;
  const administrativeCenter = rawCenter
    ? rawCenter
        .replace(/([^,]+?)\s+City\b/g, (_match, cityName: string) => `Thành phố ${cityName.trim()}`)
        .replace(/\bTP\./g, 'TP')
        .replace(/\s*,\s*[^,]+$/, '')
        .trim() || rawCenter
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white/92 p-5 shadow-panel backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Tỉnh đang chọn</p>
      {province ? (
        <div className="mt-4 space-y-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">{province.province_name}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/province/${province.province_code}`}
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-tide"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              Xem thông tin chi tiết
            </Link>
          </div>
          <div className="rounded-lg border border-slate-200 bg-sand p-4 text-sm text-ink/70">
            {loading ? (
              <p>Đang tải dữ liệu...</p>
            ) : error ? (
              <p>Không tải được dữ liệu tỉnh/thành.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Dân số</p>
                    <p className="mt-2 text-base font-semibold text-ink">{formatPopulation(population)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Diện tích</p>
                    <p className="mt-2 text-base font-semibold text-ink">{formatArea(area)}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Trung tâm hành chính</p>
                  <p className="mt-2 text-sm font-medium text-ink">
                    {administrativeCenter ?? 'Chưa có dữ liệu'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-sand p-5 text-sm leading-6 text-ink/65">
          Chọn một vùng trên bản đồ để xem thông tin tỉnh/thành.
        </div>
      )}
    </div>
  );
}
