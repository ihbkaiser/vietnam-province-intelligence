import { useRef, useState } from 'react';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { MapPointLookupCard } from '../components/MapPointLookupCard';
import { ProvinceInfoCard } from '../components/ProvinceInfoCard';
import { VietnamMap } from '../components/VietnamMap';
import { useProvinces } from '../hooks/useProvinces';
import type { ProvinceFeatureProperties, ResolveAdminUnitResponse } from '../types/admin';
import { resolveLatLon } from '../utils/api';

export function HomePage() {
  const { data, loading, error } = useProvinces();
  const [selectedProvince, setSelectedProvince] = useState<ProvinceFeatureProperties | null>(null);
  const [mapLookupEnabled, setMapLookupEnabled] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<ResolveAdminUnitResponse | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const latestLookupRequestRef = useRef(0);

  const handleMapSelection = async (payload: {
    province: ProvinceFeatureProperties;
    lat: number;
    lon: number;
  }) => {
    setSelectedProvince(payload.province);
  };

  const handleToggleMapLookup = () => {
    setMapLookupEnabled((current) => {
      const next = !current;
      if (!next) {
        latestLookupRequestRef.current += 1;
        setLookupLoading(false);
      }
      return next;
    });
    setLookupError(null);
  };

  const handleMapLocation = async (payload: {
    province: ProvinceFeatureProperties | null;
    lat: number;
    lon: number;
  }) => {
    if (payload.province) {
      setSelectedProvince(payload.province);
    }

    if (!mapLookupEnabled) {
      return;
    }

    const requestId = latestLookupRequestRef.current + 1;
    latestLookupRequestRef.current = requestId;
    setSelectedPoint({ lat: payload.lat, lon: payload.lon });
    setLookupLoading(true);
    setLookupError(null);

    try {
      const result = await resolveLatLon(payload.lat, payload.lon);
      if (latestLookupRequestRef.current !== requestId) return;
      setLookupResult(result);
    } catch (err) {
      if (latestLookupRequestRef.current !== requestId) return;
      setLookupResult(null);
      setLookupError(err instanceof Error ? err.message : 'Không thể tra cứu địa chỉ tại vị trí này.');
    } finally {
      if (latestLookupRequestRef.current === requestId) {
        setLookupLoading(false);
      }
    }
  };

  if (loading) {
    return <LoadingState label="Đang tải bản đồ tỉnh thành..." />;
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Không tải được dữ liệu tỉnh/thành.'} />;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Bản đồ số</p>
          <p className="mt-2 text-sm leading-6 text-ink/65">Chọn tỉnh/thành trực tiếp trên bản đồ Việt Nam.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">Tra cứu điểm</p>
          <p className="mt-2 text-sm leading-6 text-ink/65">Chọn một vị trí để xem địa chỉ hiện tại và địa chỉ trước sắp xếp.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tide">AI địa phương</p>
          <p className="mt-2 text-sm leading-6 text-ink/65">Đặt câu hỏi về địa lý, dân cư, kinh tế và văn hóa địa phương.</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_400px]">
        <div className="space-y-6">
          <VietnamMap
            provinces={data}
            selectedProvinceCode={selectedProvince?.province_code}
            onSelectProvince={handleMapSelection}
            onSelectLocation={handleMapLocation}
            clickHint={
              mapLookupEnabled
                ? 'Chọn một điểm trên bản đồ để xem địa chỉ mới và địa chỉ trước sắp xếp'
                : 'Chọn tỉnh trên bản đồ hoặc bật tra cứu điểm để xem địa chỉ tại một vị trí'
            }
            overlayAction={
              <button
                type="button"
                onClick={handleToggleMapLookup}
                className={`inline-flex w-fit items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-soft backdrop-blur transition ${
                  mapLookupEnabled
                    ? 'bg-ink text-white hover:bg-tide'
                    : 'bg-white/95 text-ink/72 hover:bg-white hover:text-ink'
                }`}
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10h.01" />
                </svg>
                {mapLookupEnabled ? 'Đang bật tra cứu' : 'Tra cứu theo vị trí'}
              </button>
            }
          />
        </div>
        <div className="space-y-6">
          <ProvinceInfoCard province={selectedProvince} />
          <MapPointLookupCard
            enabled={mapLookupEnabled}
            loading={lookupLoading}
            error={lookupError}
            selectedPoint={selectedPoint}
            onToggle={handleToggleMapLookup}
            result={lookupResult}
          />
        </div>
      </div>
    </div>
  );
}
