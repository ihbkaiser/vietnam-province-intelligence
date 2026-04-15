import type { ResolveAdminUnitResponse } from '../types/admin';

export function ResolutionResultCard({
  result,
  emptyMessage = 'Bấm lên bản đồ hoặc nhập tọa độ để xem địa chỉ cũ, địa chỉ mới và đơn vị hành chính hiện tại.'
}: {
  result: ResolveAdminUnitResponse | null;
  emptyMessage?: string;
}) {
  if (!result) {
    return (
      <div className="rounded-[2rem] border border-dashed border-ink/15 bg-white/60 p-6 text-sm text-ink/60 shadow-panel backdrop-blur">
        {emptyMessage}
      </div>
    );
  }

  const newAddress = result.raw_reverse_geocode.current.formatted_address || null;
  const oldAddress = result.raw_reverse_geocode.legacy?.formatted_address || null;

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur space-y-4">
      <p className="text-xs uppercase tracking-[0.24em] text-tide">Địa chỉ từ OpenMap</p>

      <div className="rounded-2xl bg-mist/65 p-4 space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink/45">Địa chỉ mới</p>
        <p className="text-base font-semibold text-ink">{newAddress ?? 'Không xác định'}</p>
      </div>

      <div className="rounded-2xl bg-sand/75 p-4 space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink/45">Địa chỉ cũ</p>
        {oldAddress ? (
          <p className="text-base font-semibold text-ink">{oldAddress}</p>
        ) : (
          <p className="text-sm text-ink/45 italic">Không có dữ liệu địa giới cũ cho điểm này</p>
        )}
      </div>

      <p className="text-[11px] text-ink/35 uppercase tracking-[0.15em]">
        {result.input.lat.toFixed(6)}, {result.input.lon.toFixed(6)}
      </p>
    </div>
  );
}
