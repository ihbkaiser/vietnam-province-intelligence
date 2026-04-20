import type { ResolveAdminUnitResponse } from '../types/admin';

export function ResolutionResultCard({
  result,
  emptyMessage = 'Chọn một vị trí trên bản đồ hoặc nhập tọa độ để xem địa chỉ hiện tại và địa chỉ trước sắp xếp.'
}: {
  result: ResolveAdminUnitResponse | null;
  emptyMessage?: string;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white/72 p-5 text-sm leading-6 text-ink/60 shadow-soft backdrop-blur">
        {emptyMessage}
      </div>
    );
  }

  const newAddress = result.raw_reverse_geocode.current.formatted_address || null;
  const oldAddress = result.raw_reverse_geocode.legacy?.formatted_address || null;

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white/92 p-5 shadow-panel backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Kết quả tra cứu</p>

      <div className="space-y-1 rounded-lg border border-tide/16 bg-mist/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Địa chỉ hiện tại</p>
        <p className="text-base font-semibold text-ink">{newAddress ?? 'Không xác định'}</p>
      </div>

      <div className="space-y-1 rounded-lg border border-slate-200 bg-sand p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">Địa chỉ trước sắp xếp</p>
        {oldAddress ? (
          <p className="text-base font-semibold text-ink">{oldAddress}</p>
        ) : (
          <p className="text-sm text-ink/45 italic">Chưa có địa chỉ trước sắp xếp cho điểm này</p>
        )}
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink/35">
        {result.input.lat.toFixed(6)}, {result.input.lon.toFixed(6)}
      </p>
    </div>
  );
}
