import { Link, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { useProvinceDetail } from '../hooks/useProvinceDetail';

export function ProvinceDetailPage() {
  const { provinceCode } = useParams();
  const { data, loading, error } = useProvinceDetail(provinceCode);

  if (loading) {
    return <LoadingState label="Đang tải chi tiết tỉnh/thành..." />;
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Không tải được chi tiết tỉnh/thành.'} />;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center rounded-full bg-white/75 px-4 py-2 text-sm text-ink shadow-panel transition hover:bg-white"
      >
        Quay lại bản đồ
      </Link>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.24em] text-tide">Chi tiết tỉnh/thành</p>
        <h2 className="mt-3 font-display text-4xl font-semibold text-ink">{data.province_name}</h2>
        <p className="mt-2 text-sm text-ink/55">{data.province_code}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-sand/80 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Loại</p>
            <p className="mt-3 font-display text-xl text-ink">{data.province_kind === 'city' ? 'Thành phố' : 'Tỉnh'}</p>
          </div>
          <div className="rounded-2xl bg-sand/80 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Số xã/phường mẫu</p>
            <p className="mt-3 font-display text-xl text-ink">{data.commune_count}</p>
          </div>
          <div className="rounded-2xl bg-sand/80 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Tên gọi khác</p>
            <p className="mt-3 text-sm leading-6 text-ink/70">{data.aliases.join(', ')}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl bg-mist/65 p-6">
            <h3 className="font-display text-xl font-medium text-ink">Nội dung giữ chỗ</h3>
            <p className="mt-3 text-sm leading-7 text-ink/72">{data.placeholder_details}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white/70 p-6">
            <h3 className="font-display text-xl font-medium text-ink">Lớp dữ liệu tiếp theo</h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-ink/72">
              <li>Polygon chính thức cấp tỉnh</li>
              <li>Danh mục xã/phường hiện tại</li>
              <li>Bảng quy chiếu quận/huyện cũ</li>
              <li>Chỉ số và hồ sơ cấp tỉnh</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
