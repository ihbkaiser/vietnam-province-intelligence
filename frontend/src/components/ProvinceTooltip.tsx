interface ProvinceTooltipProps {
  provinceName: string;
  population?: number | string | null;
  areaKm2?: number | string | null;
  loading?: boolean;
}

function formatValue(value: number | string | null | undefined, suffix?: string) {
  if (value == null || value === '') {
    return 'Chưa có dữ liệu';
  }

  if (typeof value === 'number') {
    const formatted = value.toLocaleString('vi-VN');
    return suffix ? `${formatted} ${suffix}` : formatted;
  }

  return value;
}

export function ProvinceTooltip({ provinceName, population, areaKm2, loading }: ProvinceTooltipProps) {
  return (
    <div className="pointer-events-none rounded-2xl border border-white/70 bg-ink px-4 py-3 text-xs text-white shadow-panel">
      <p className="font-display text-sm font-semibold">{provinceName}</p>
      <div className="mt-2 space-y-1 text-white/80">
        <p>Dân số: {loading ? 'Đang tải...' : formatValue(population)}</p>
        <p>Diện tích: {loading ? 'Đang tải...' : formatValue(areaKm2, 'km²')}</p>
      </div>
    </div>
  );
}
