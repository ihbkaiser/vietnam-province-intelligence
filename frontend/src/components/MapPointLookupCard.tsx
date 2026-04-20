import type { ResolveAdminUnitResponse } from '../types/admin';
import { ResolutionResultCard } from './ResolutionResultCard';

interface MapPointLookupCardProps {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  selectedPoint: { lat: number; lon: number } | null;
  onToggle: () => void;
  result: ResolveAdminUnitResponse | null;
}

export function MapPointLookupCard({
  enabled,
  loading,
  error,
  selectedPoint,
  onToggle,
  result
}: MapPointLookupCardProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white/92 p-5 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">Tra cứu vị trí</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink">Tra cứu địa chỉ theo vị trí</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Bật chế độ này rồi chọn một điểm trên bản đồ để xem địa chỉ hiện tại và địa chỉ trước sắp xếp.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              enabled ? 'bg-ink text-white hover:bg-tide' : 'border border-slate-200 bg-sand text-ink/70 hover:bg-white hover:text-ink'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-300' : 'bg-slate-400'}`} />
            {enabled ? 'Tắt tra cứu vị trí' : 'Bật tra cứu vị trí'}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-sand p-4 text-sm text-ink/70">
          {loading ? (
            <p>Đang tìm địa chỉ cho vị trí vừa chọn...</p>
          ) : error ? (
            <p className="text-coral">{error}</p>
          ) : selectedPoint ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Vị trí vừa chọn</p>
              <p className="font-medium text-ink">
                {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
              </p>
              {!result && enabled && <p className="text-ink/55">Chọn tiếp trên bản đồ để tra cứu vị trí khác.</p>}
            </div>
          ) : (
            <p>{enabled ? 'Chọn một điểm trên bản đồ để bắt đầu tra cứu.' : 'Bật tra cứu vị trí để xem địa chỉ tại điểm bạn chọn.'}</p>
          )}
        </div>
      </div>

      <ResolutionResultCard
        result={result}
        emptyMessage={
          enabled
            ? 'Chọn một điểm trên bản đồ để xem địa chỉ hiện tại và địa chỉ trước sắp xếp.'
            : 'Bật tra cứu vị trí để hệ thống hiển thị địa chỉ tại điểm bạn chọn.'
        }
      />
    </div>
  );
}
