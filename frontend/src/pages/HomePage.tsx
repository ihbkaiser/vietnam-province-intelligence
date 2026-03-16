import { useState } from 'react';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { ProvinceInfoCard } from '../components/ProvinceInfoCard';
import { ResolutionResultCard } from '../components/ResolutionResultCard';
import { VietnamMap } from '../components/VietnamMap';
import { useProvinces } from '../hooks/useProvinces';
import type { ProvinceFeatureProperties, ResolveAdminUnitResponse } from '../types/admin';
import { resolveLatLon } from '../utils/api';

export function HomePage() {
  const { data, loading, error } = useProvinces();
  const [selectedProvince, setSelectedProvince] = useState<ProvinceFeatureProperties | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [result, setResult] = useState<ResolveAdminUnitResponse | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const handleMapSelection = async (payload: {
    province: ProvinceFeatureProperties;
    lat: number;
    lon: number;
  }) => {
    setSelectedProvince(payload.province);
    setSelectedPoint({ lat: payload.lat, lon: payload.lon });
    setResolving(true);
    setResolveError(null);

    try {
      const response = await resolveLatLon(payload.lat, payload.lon);
      setResult(response);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Không thể phân giải địa chỉ từ điểm đã chọn.');
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Đang tải polygon tỉnh/thành..." />;
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Không tải được dữ liệu tỉnh/thành.'} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_380px]">
        <VietnamMap
          provinces={data}
          selectedProvinceCode={selectedProvince?.province_code}
          onSelectProvince={handleMapSelection}
        />
        <div className="space-y-6">
          <ProvinceInfoCard province={selectedProvince} selectedPoint={selectedPoint} resolving={resolving} />
          <section className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-tide">Luồng xử lý</p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-ink/70">
              <li>1. Nhận `lat`, `lon` từ điểm bấm trên bản đồ.</li>
              <li>2. Xác định tỉnh/thành bằng point-in-polygon.</li>
              <li>3. Gọi OpenMap reverse geocode với `admin_v2=true` để lấy địa chỉ mới.</li>
              <li>4. Chuẩn hóa tên và tra cứu xã/phường hiện tại trong tỉnh/thành đã xác định.</li>
              <li>5. Nếu có kết quả duy nhất, trả về địa chỉ cũ, địa chỉ mới và đơn vị hành chính hiện tại.</li>
            </ol>
          </section>
        </div>
      </div>
      {resolving ? <LoadingState label="Đang phân giải tọa độ từ điểm bấm..." /> : null}
      {resolveError ? <ErrorState message={resolveError} /> : null}
      <ResolutionResultCard
        result={result}
        emptyMessage="Bấm lên bản đồ để lấy tọa độ và xem địa chỉ cũ, địa chỉ mới cùng đơn vị hành chính hiện tại."
      />
    </div>
  );
}
