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
      <div className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-tide">Tra cứu tại điểm bấm</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Địa chỉ cũ và địa chỉ mới</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Bật chế độ này rồi bấm vào bản đồ để xem địa chỉ cũ, địa chỉ mới và đơn vị hành chính hiện tại ngay tại vị trí đó.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              enabled ? 'bg-ink text-white hover:bg-tide' : 'bg-sand text-ink/70 hover:bg-white'
            }`}
          >
            {enabled ? 'Tắt chế độ bấm tra cứu' : 'Bật bấm để tra cứu'}
          </button>
        </div>

        <div className="mt-4 rounded-[1.5rem] border border-white/60 bg-gradient-to-br from-white/95 via-sand/80 to-mist/80 p-4 text-sm text-ink/70 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          {loading ? (
            <p>Đang phân giải địa chỉ từ điểm vừa bấm...</p>
          ) : error ? (
            <p className="text-coral">{error}</p>
          ) : selectedPoint ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Điểm vừa chọn</p>
              <p className="font-medium text-ink">
                {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
              </p>
              {!result && enabled && <p className="text-ink/55">Bấm tiếp trên bản đồ để lấy kết quả địa chỉ tại vị trí khác.</p>}
            </div>
          ) : (
            <p>{enabled ? 'Bấm một điểm trên bản đồ để bắt đầu tra cứu.' : 'Chưa bật chế độ tra cứu trên bản đồ.'}</p>
          )}
        </div>
      </div>

      <ResolutionResultCard
        result={result}
        emptyMessage={
          enabled
            ? 'Bấm lên bản đồ để xem địa chỉ cũ, địa chỉ mới và đơn vị hành chính hiện tại của điểm đó.'
            : 'Bật chế độ tra cứu trên bản đồ để khi bấm vào một điểm, hệ thống sẽ hiện địa chỉ cũ và địa chỉ mới.'
        }
      />
    </div>
  );
}
