import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { useProvinceDetail } from '../hooks/useProvinceDetail';
import type { ProvinceAttraction, ProvinceInfo, ProvinceSpecialty } from '../types/admin';

// ── Helpers ───────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-sand/80 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{label}</p>
      <p className="mt-2 text-sm font-medium text-ink">{value ?? <span className="text-ink/30 italic">Chưa có dữ liệu</span>}</p>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-sm italic text-ink/35">Không có</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-sand/90 px-3 py-1 text-xs text-ink/70">{item}</span>
      ))}
    </div>
  );
}

function AttractionCard({ item }: { item: ProvinceAttraction }) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white/60 p-4">
      <p className="font-medium text-sm text-ink">{item.name}</p>
      <p className="mt-0.5 text-xs text-tide">{item.type}</p>
      {item.description && <p className="mt-2 text-xs leading-5 text-ink/60">{item.description}</p>}
    </div>
  );
}

function SpecialtyCard({ item }: { item: ProvinceSpecialty }) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white/60 p-3">
      <p className="text-sm font-medium text-ink">{item.name}</p>
      <p className="mt-0.5 text-xs text-ink/50">{item.type}</p>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────

function AdminSection({ info }: { info: ProvinceInfo }) {
  const struct = info.administrative_structure;
  const wardsList = struct?.wards_communes_list?.value ?? [];
  const wardsCount = struct?.wards_communes_count?.value;

  return (
    <Section title="Hành chính">
      <div className="grid gap-3 md:grid-cols-2">
        <StatCard label="Mã hành chính" value={info.administrative_code?.value} />
        <StatCard label="Số xã/phường" value={wardsCount != null ? `${wardsCount} đơn vị` : null} />
      </div>
      {info.former_provinces?.value && info.former_provinces.value.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Tỉnh/thành trước khi sáp nhập</p>
          <TagList items={info.former_provinces.value} />
          {info.former_provinces.description && (
            <p className="mt-2 text-xs leading-5 text-ink/50">{info.former_provinces.description}</p>
          )}
        </div>
      )}
      {wardsList.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Danh sách xã/phường</p>
          <div className="max-h-48 overflow-y-auto rounded-2xl bg-sand/60 p-3">
            <div className="flex flex-wrap gap-1.5">
              {wardsList.map((ward) => (
                <span key={ward} className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-ink/70">{ward}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

function GeographySection({ info }: { info: ProvinceInfo }) {
  const adj = info.location?.adjacent_areas;
  return (
    <Section title="Địa lý">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Diện tích" value={info.area?.total_km2?.value != null ? `${info.area.total_km2.value.toLocaleString('vi-VN')} km²` : null} />
        <StatCard label="Vĩ độ" value={info.location?.latitude?.value != null ? `${info.location.latitude.value}° B` : null} />
        <StatCard label="Kinh độ" value={info.location?.longitude?.value != null ? `${info.location.longitude.value}° Đ` : null} />
      </div>
      {adj && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(adj.provinces?.value?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Giáp tỉnh/thành</p>
              <TagList items={adj.provinces!.value} />
            </div>
          )}
          {(adj.countries?.value?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Giáp quốc gia</p>
              <TagList items={adj.countries!.value} />
            </div>
          )}
          {(adj.seas?.value?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Giáp biển</p>
              <TagList items={adj.seas!.value} />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function EconomySection({ info }: { info: ProvinceInfo }) {
  const eco = info.economy;
  if (!eco) return null;
  const gdp = eco.gdp?.value;
  return (
    <Section title="Kinh tế">
      <div className="grid gap-3 md:grid-cols-2">
        {gdp && (
          <StatCard
            label={`GRDP (${gdp.year})`}
            value={`${(gdp.amount_usd / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ USD`}
          />
        )}
        {eco.scale?.value && (
          <div className="rounded-2xl bg-sand/80 p-4 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Quy mô kinh tế</p>
            <p className="mt-2 text-sm leading-6 text-ink">{eco.scale.value}</p>
          </div>
        )}
      </div>
      {(eco.main_sectors?.value?.length ?? 0) > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Ngành kinh tế chính</p>
          <TagList items={eco.main_sectors!.value} />
        </div>
      )}
    </Section>
  );
}

function TourismSection({ info }: { info: ProvinceInfo }) {
  const tour = info.tourism;
  if (!tour) return null;
  const attractions = tour.attractions?.value ?? [];
  const specialties = tour.local_specialties?.value ?? [];
  const festivals = tour.culture?.festivals?.value ?? [];
  const events = tour.culture?.events?.value ?? [];
  if (!attractions.length && !specialties.length && !festivals.length && !events.length) return null;

  return (
    <Section title="Du lịch & Văn hóa">
      {attractions.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Điểm tham quan</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {attractions.map((a) => <AttractionCard key={a.name} item={a} />)}
          </div>
        </div>
      )}
      {specialties.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Đặc sản địa phương</p>
          <div className="grid gap-2 md:grid-cols-3">
            {specialties.map((s) => <SpecialtyCard key={s.name} item={s} />)}
          </div>
        </div>
      )}
      {festivals.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Lễ hội</p>
          <TagList items={festivals} />
        </div>
      )}
      {events.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Sự kiện</p>
          <TagList items={events} />
        </div>
      )}
    </Section>
  );
}

function InfraSection({ info }: { info: ProvinceInfo }) {
  const infra = info.infrastructure;
  if (!infra) return null;
  const airports = infra.airport?.value ?? [];
  const seaports = infra.seaport?.value ?? [];
  const railways = infra.railway_station?.value ?? [];
  const others = infra.other_transport?.value ?? [];
  if (!airports.length && !seaports.length && !railways.length && !others.length) return null;

  return (
    <Section title="Hạ tầng giao thông">
      <div className="grid gap-4 md:grid-cols-2">
        {airports.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Sân bay</p>
            <TagList items={airports} />
          </div>
        )}
        {seaports.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Cảng biển</p>
            <TagList items={seaports} />
          </div>
        )}
        {railways.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Ga đường sắt</p>
            <TagList items={railways} />
          </div>
        )}
        {others.length > 0 && (
          <div className="md:col-span-2">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Giao thông khác</p>
            <TagList items={others} />
          </div>
        )}
      </div>
    </Section>
  );
}

function EnvironmentSection({ info }: { info: ProvinceInfo }) {
  const env = info.environment;
  if (!env) return null;
  const climate = env.climate?.type?.value;
  const avgTemp = env.climate?.average_temperature_c?.value;
  const forests = env.ecology?.forests?.value ?? [];
  const seas = env.ecology?.sea?.value ?? [];
  const others = env.ecology?.other_resources?.value ?? [];

  return (
    <Section title="Môi trường & Tự nhiên">
      <div className="grid gap-3 md:grid-cols-2">
        {climate && <StatCard label="Khí hậu" value={climate} />}
        {avgTemp != null && <StatCard label="Nhiệt độ trung bình" value={`${avgTemp}°C`} />}
      </div>
      {(forests.length > 0 || seas.length > 0 || others.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {forests.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Rừng / Núi</p>
              <TagList items={forests} />
            </div>
          )}
          {seas.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Biển</p>
              <TagList items={seas} />
            </div>
          )}
          {others.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink/45">Tài nguyên khác</p>
              <TagList items={others} />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function ProvinceDetailPage() {
  const { provinceCode } = useParams();
  const { data, loading, error } = useProvinceDetail(provinceCode);

  if (loading) return <LoadingState label="Đang tải chi tiết tỉnh/thành..." />;
  if (error || !data) return <ErrorState message={error ?? 'Không tải được chi tiết tỉnh/thành.'} />;

  const info = data.province_info;

  return (
    <div className="space-y-4">
      <Link
        to="/"
        className="inline-flex items-center rounded-full bg-white/75 px-4 py-2 text-sm text-ink shadow-panel transition hover:bg-white"
      >
        Quay lại bản đồ
      </Link>

      {/* Header */}
      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.24em] text-tide">
          {data.province_kind === 'city' ? 'Thành phố trực thuộc Trung ương' : 'Tỉnh'}
        </p>
        <h2 className="mt-2 font-display text-4xl font-semibold text-ink">{data.province_name}</h2>
        <p className="mt-1 text-sm text-ink/40">Mã: {data.province_code}</p>

        {data.aliases?.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs uppercase tracking-[0.18em] text-ink/40">Tên gọi khác</p>
            <TagList items={data.aliases} />
          </div>
        )}
        {data.description && (
          <p className="mt-4 text-sm leading-6 text-ink/60">{data.description}</p>
        )}
      </section>

      {info ? (
        <>
          <AdminSection info={info} />
          <GeographySection info={info} />
          <EconomySection info={info} />
          <TourismSection info={info} />
          <InfraSection info={info} />
          <EnvironmentSection info={info} />
        </>
      ) : (
        <section className="rounded-[2rem] border border-dashed border-ink/15 bg-white/50 p-8 text-center text-sm text-ink/40 shadow-panel">
          Chưa có dữ liệu chi tiết cho tỉnh/thành này.
        </section>
      )}
    </div>
  );
}
