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
      setLookupError(err instanceof Error ? err.message : 'Không thể tra cứu địa chỉ tại điểm vừa bấm.');
    } finally {
      if (latestLookupRequestRef.current === requestId) {
        setLookupLoading(false);
      }
    }
  };

  if (loading) {
    return <LoadingState label="Đang tải polygon tỉnh/thành..." />;
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Không tải được dữ liệu tỉnh/thành.'} />;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_420px]">
        <div className="space-y-6">
          <VietnamMap
            provinces={data}
            selectedProvinceCode={selectedProvince?.province_code}
            onSelectProvince={handleMapSelection}
            onSelectLocation={handleMapLocation}
            clickHint={
              mapLookupEnabled
                ? 'Bấm vào bản đồ để chọn tỉnh và tra địa chỉ cũ/mới tại điểm đó'
                : 'Bấm vào bản đồ để chọn tỉnh; bật nút tra cứu nếu muốn xem địa chỉ cũ/mới'
            }
            overlayAction={
              <button
                type="button"
                onClick={handleToggleMapLookup}
                className={`w-fit rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] shadow-panel backdrop-blur transition ${
                  mapLookupEnabled
                    ? 'bg-ink text-white hover:bg-tide'
                    : 'bg-white/90 text-ink/70 hover:bg-white'
                }`}
              >
                {mapLookupEnabled ? 'Đang bật tra cứu điểm bấm' : 'Bật tra địa chỉ cũ/mới'}
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
