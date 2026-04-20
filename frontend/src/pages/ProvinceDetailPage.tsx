import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { ProvinceShapePreview } from '../components/ProvinceShapePreview';
import { useProvinceDetail } from '../hooks/useProvinceDetail';
import { useProvinces } from '../hooks/useProvinces';
import type {
  ProvinceAttraction,
  ProvinceDisplayValue,
  ProvinceEthnicGroup,
  ProvinceInfo,
  ProvinceReferenceUnit,
  ProvinceSpecialty
} from '../types/admin';

type UnitFilter = 'all' | string;

function parseNumeric(value: ProvinceDisplayValue | undefined) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  const cleaned = value.trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  if (cleaned.includes('.') && cleaned.includes(',')) {
    const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (cleaned.includes('.') && !cleaned.includes(',')) {
    const parts = cleaned.split('.');
    const parsed = parts.length > 1 && parts.slice(1).every((part) => part.length === 3)
      ? Number(parts.join(''))
      : Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (cleaned.includes(',') && !cleaned.includes('.')) {
    const parts = cleaned.split(',');
    const parsed = parts.length > 1 && parts.slice(1).every((part) => part.length === 3)
      ? Number(parts.join(''))
      : Number(cleaned.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number | null, options?: Intl.NumberFormatOptions) {
  if (value == null) return 'Chưa có dữ liệu';
  return value.toLocaleString('vi-VN', options);
}

function formatArea(value: number | null) {
  return value == null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} km²`;
}

function formatPopulation(value: number | null) {
  return value == null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN')} người`;
}

function formatCurrencyBillion(value: number | null) {
  return value == null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} tỷ VNĐ`;
}

function formatIncome(value: number | null) {
  return value == null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu VNĐ/người`;
}

function formatDensity(value: number | null) {
  return value == null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} người/km²`;
}

function provinceKindLabel(kind: 'province' | 'city') {
  return kind === 'city' ? 'Thành phố trực thuộc Trung ương' : 'Tỉnh';
}

function formatAdministrativeCenter(value: string | null | undefined) {
  if (!value) return 'Chưa có dữ liệu';

  const cleaned = value
    .replace(/([^,]+?)\s+City\b/g, (_match, cityName: string) => `Thành phố ${cityName.trim()}`)
    .replace(/\bTP\./g, 'TP')
    .replace(/\s*,\s*$/, '')
    .trim();

  return cleaned || 'Chưa có dữ liệu';
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function formatEthnicGroup(item: string | ProvinceEthnicGroup) {
  if (typeof item === 'string') return item;
  if (item.percentage == null) return item.name;
  return `${item.name} (${item.percentage.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%)`;
}

function SurfaceCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white/92 shadow-panel backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  action
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tide">{eyebrow}</p>}
        <h3 className="mt-2 font-display text-2xl font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/62">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Pill({
  children,
  tone = 'default'
}: {
  children: ReactNode;
  tone?: 'default' | 'light' | 'accent';
}) {
  const className =
    tone === 'accent'
      ? 'bg-coral/12 text-coral border-coral/20'
      : tone === 'light'
        ? 'bg-white/14 text-white border-white/20'
        : 'bg-sand/70 text-ink/70 border-sand';

  return <span className={`rounded-md border px-3 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function KpiCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">{label}</p>
      <p className="mt-3 text-xl font-semibold text-ink">{value}</p>
      {note && <p className="mt-2 text-xs leading-5 text-ink/52">{note}</p>}
    </div>
  );
}

function DetailRow({
  label,
  value,
  tone = 'dark'
}: {
  label: string;
  value: ReactNode;
  tone?: 'dark' | 'light';
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 border-b py-3 last:border-b-0 last:pb-0 first:pt-0 ${
        tone === 'light' ? 'border-white/15' : 'border-slate-200/70'
      }`}
    >
      <span className={`text-sm ${tone === 'light' ? 'text-white/70' : 'text-ink/50'}`}>{label}</span>
      <span className={`max-w-[62%] text-right text-sm font-medium ${tone === 'light' ? 'text-white' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}

function TagCloud({ items, tone = 'default' }: { items: string[]; tone?: 'default' | 'teal' }) {
  if (!items.length) {
    return <p className="text-sm italic text-ink/42">Chưa có dữ liệu</p>;
  }

  const className =
    tone === 'teal'
      ? 'border-white/20 bg-white/12 text-white/90'
      : 'border-slate-200 bg-sand/80 text-ink/72';

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className={`rounded-full border px-3 py-1 text-xs ${className}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function UnitCard({ unit }: { unit: ProvinceReferenceUnit }) {
  const typeColor = unit.ward_type === 'phường' ? 'text-coral' : 'text-tide';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${typeColor}`}>{unit.ward_type}</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">{unit.ward_name}</h4>
        </div>
        <span className="rounded-md bg-sand px-3 py-1 text-xs font-medium text-ink/65">Mã {unit.ward_code}</span>
      </div>

      {unit.merger_from && (
        <p className="mt-3 text-sm leading-6 text-ink/62">
          Hình thành từ: <span className="font-medium text-ink/82">{unit.merger_from}</span>
        </p>
      )}

      {unit.admin_center && (
        <p className="mt-2 text-sm leading-6 text-ink/62">
          Trụ sở hành chính: <span className="font-medium text-ink/82">{unit.admin_center}</span>
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-tide/10 bg-mist/50 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Dân số</p>
          <p className="mt-2 text-sm font-medium text-ink">{formatPopulation(unit.population)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-sand px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Diện tích</p>
          <p className="mt-2 text-sm font-medium text-ink">{formatArea(unit.area_km2)}</p>
        </div>
        <div className="rounded-lg border border-coral/10 bg-coral/8 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Mật độ</p>
          <p className="mt-2 text-sm font-medium text-ink">{formatDensity(unit.density_per_km2)}</p>
        </div>
      </div>

      {unit.old_district && <p className="mt-3 text-xs text-ink/48">Đơn vị trước đây: {unit.old_district}</p>}
    </div>
  );
}

function DataList({ title, items }: { title: string; items: string[] }) {
  return (
    <SurfaceCard className="p-5">
      <h4 className="text-base font-semibold text-ink">{title}</h4>
      <div className="mt-4">
        <TagCloud items={items} />
      </div>
    </SurfaceCard>
  );
}

function AttractionGrid({ items }: { items: ProvinceAttraction[] }) {
  if (!items.length) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.name} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm uppercase tracking-[0.18em] text-tide/80">{item.type}</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">{item.name}</h4>
          {item.description && <p className="mt-2 text-sm leading-6 text-ink/62">{item.description}</p>}
        </div>
      ))}
    </div>
  );
}

function SpecialtyGrid({ items }: { items: ProvinceSpecialty[] }) {
  if (!items.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.name} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-ink">{item.name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">{item.type}</p>
        </div>
      ))}
    </div>
  );
}

export function ProvinceDetailPage() {
  const { provinceCode } = useParams();
  const { data, loading, error } = useProvinceDetail(provinceCode);
  const { data: provinces } = useProvinces();
  const [query, setQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('all');

  if (loading) return <LoadingState label="Đang tải hồ sơ tỉnh/thành..." />;
  if (error || !data) return <ErrorState message={error ?? 'Không tải được chi tiết tỉnh/thành.'} />;

  const info = data.province_info;
  const reference = data.reference_snapshot;
  const feature = provinces?.features.find((item) => item.properties.province_code === data.province_code) ?? null;

  const adminCode = reference?.province_code_text ?? String(info?.administrative_code?.value ?? data.province_code);
  const areaKm2 = reference?.area_km2 ?? parseNumeric(info?.area?.total_km2?.value);
  const population = reference?.population ?? parseNumeric(info?.population?.total?.value);
  const density = parseNumeric(info?.population?.density_per_km2?.value);
  const totalUnits = reference?.total_unit ?? parseNumeric(info?.administrative_structure?.wards_communes_count?.value);
  const borderWithProvinces =
    reference?.border_with_provinces ?? info?.location?.adjacent_areas?.provinces?.value ?? [];
  const countryBorders = info?.location?.adjacent_areas?.countries?.value ?? [];
  const sectors = info?.economy?.main_sectors?.value ?? [];
  const festivals = info?.tourism?.culture?.festivals?.value ?? [];
  const attractions = info?.tourism?.attractions?.value ?? [];
  const specialties = info?.tourism?.local_specialties?.value ?? [];
  const infrastructure = [
    ...(info?.infrastructure?.airport?.value ?? []),
    ...(info?.infrastructure?.seaport?.value ?? []),
    ...(info?.infrastructure?.railway_station?.value ?? []),
    ...(info?.infrastructure?.other_transport?.value ?? [])
  ];
  const ethnicGroups = (info?.population?.ethnic_groups?.value ?? []).map(formatEthnicGroup);
  const formerProvinces = info?.former_provinces?.value ?? [];
  const referenceUnits = reference?.units ?? [];
  const availableTypes = [...new Set(referenceUnits.map((unit) => unit.ward_type))];
  const normalizedQuery = normalizeSearch(query.trim());
  const filteredUnits = referenceUnits.filter((unit) => {
    if (unitFilter !== 'all' && unit.ward_type !== unitFilter) return false;
    if (!normalizedQuery) return true;

    const haystack = normalizeSearch(
      [unit.ward_name, unit.ward_code, unit.admin_center, unit.merger_from].filter(Boolean).join(' ')
    );

    return haystack.includes(normalizedQuery);
  });

  const heroSummary = reference?.overview_summary ?? data.description;
  const boundarySummary = reference?.boundary_summary;
  const heroImage = reference?.hero_image_url;
  const heroImageAlt = reference?.hero_image_alt ?? `Hình minh họa ${data.province_name}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-ink shadow-soft transition hover:bg-white"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Quay lại bản đồ
        </Link>
      </div>

      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-[#14324b] shadow-panel">
        {heroImage ? (
          <img
            src={heroImage}
            alt={heroImageAlt}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,26,34,0.84)_0%,rgba(16,36,48,0.72)_42%,rgba(16,36,48,0.42)_64%,rgba(255,255,255,0.94)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(8,18,24,0.18))]" />
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.35fr)_380px]">
          <div className="relative overflow-hidden px-6 py-8 text-white sm:px-8 sm:py-10">
            <div className="relative z-10">
              <div className="flex flex-wrap gap-2">
                <Pill tone="light">{provinceKindLabel(data.province_kind)}</Pill>
                {reference?.economic_region && <Pill tone="light">{reference.economic_region}</Pill>}
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Hồ sơ tỉnh thành</p>
              <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">{data.province_name}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/82 sm:text-base">
                {heroSummary}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Pill tone="light">Mã tỉnh {adminCode}</Pill>
                {reference?.phone_code && <Pill tone="light">Mã vùng {reference.phone_code}</Pill>}
                {reference?.vehicle_plates?.length ? <Pill tone="light">Biển số {reference.vehicle_plates.join(', ')}</Pill> : null}
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/62">Tổng quan địa giới</p>
                  <p className="mt-3 text-sm leading-6 text-white/84">
                    {boundarySummary ?? 'Thông tin tổng quan về địa giới, dân cư và đơn vị hành chính của tỉnh/thành.'}
                  </p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/10 p-5 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/62">Thông tin nổi bật</p>
                  <p className="mt-3 text-sm leading-6 text-white/84">
                    Các chỉ số chính được sắp xếp để bạn nắm nhanh quy mô, vị trí và đặc điểm nổi bật của địa phương.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.02))] px-6 py-7 sm:px-7">
            <ProvinceShapePreview feature={feature} provinceName={data.province_name} />

            <div className="mt-5 rounded-lg border border-white/30 bg-white/14 p-5 text-white backdrop-blur">
              <DetailRow tone="light" label="Trung tâm hành chính" value={formatAdministrativeCenter(reference?.administrative_center)} />
              <DetailRow tone="light" label="Vùng" value={reference?.region ?? 'Chưa có dữ liệu'} />
              <DetailRow tone="light" label="Vùng kinh tế" value={reference?.economic_region ?? 'Chưa có dữ liệu'} />
              <DetailRow
                tone="light"
                label="Đơn vị hành chính"
                value={totalUnits != null ? `${formatNumber(totalUnits)} đơn vị` : 'Chưa có dữ liệu'}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Diện tích" value={formatArea(areaKm2)} />
        <KpiCard label="Dân số" value={formatPopulation(population)} />
        <KpiCard label="GRDP" value={formatCurrencyBillion(reference?.grdp_billion_vnd ?? null)} />
        <KpiCard label="Thu nhập bình quân" value={formatIncome(reference?.income_per_capita_million_vnd ?? null)} />
        <KpiCard label="Thu ngân sách / doanh thu" value={formatCurrencyBillion(reference?.revenue_billion_vnd ?? null)} />
        <KpiCard label="Mật độ dân số" value={formatDensity(density)} />
        <KpiCard label="Bí thư" value={reference?.secretary ?? 'Chưa có dữ liệu'} />
        <KpiCard label="Chủ tịch UBND" value={reference?.chairman ?? 'Chưa có dữ liệu'} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
        <SurfaceCard className="p-6 sm:p-7">
          <SectionTitle
            eyebrow="Tổng quan"
            title="Tổng quan hành chính và địa lý"
            subtitle="Các thông tin nền tảng giúp nhận diện vị trí, quy mô và liên kết vùng của địa phương."
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-sand p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Biên giới hành chính</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="mb-2 text-sm font-medium text-ink">Giáp tỉnh/thành</p>
                    <TagCloud items={borderWithProvinces} />
                  </div>
                  {countryBorders.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-ink">Giáp quốc gia</p>
                      <TagCloud items={countryBorders} />
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-tide/10 bg-mist/55 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Tỉnh/thành trước khi sắp xếp</p>
                <div className="mt-3">
                  <TagCloud items={formerProvinces} />
                </div>
                {info?.former_provinces?.description && (
                  <p className="mt-3 text-sm leading-6 text-ink/62">{info.former_provinces.description}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <SurfaceCard className="p-5">
                <h4 className="text-base font-semibold text-ink">Mã và liên hệ</h4>
                <div className="mt-4">
                  <DetailRow label="Mã hành chính" value={adminCode} />
                  <DetailRow label="Mã vùng điện thoại" value={reference?.phone_code ?? 'Chưa có dữ liệu'} />
                  <DetailRow label="Biển số xe" value={reference?.vehicle_plates?.length ? reference.vehicle_plates.join(', ') : 'Chưa có dữ liệu'} />
                  <DetailRow label="Trung tâm hành chính" value={formatAdministrativeCenter(reference?.administrative_center)} />
                </div>
              </SurfaceCard>

              <SurfaceCard className="p-5">
                <h4 className="text-base font-semibold text-ink">Thành phần dân cư</h4>
                <div className="mt-4">
                  <TagCloud items={ethnicGroups} />
                </div>
              </SurfaceCard>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <SectionTitle
            eyebrow="Điểm nhấn"
            title="Điểm nhấn hồ sơ"
            subtitle="Tóm tắt nhanh những thông tin người xem thường cần trước khi đi vào chi tiết."
          />
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Nhịp hành chính</p>
              <p className="mt-2 text-base font-semibold text-ink">
                {totalUnits != null ? `${formatNumber(totalUnits)} đơn vị cấp xã/phường` : 'Chưa có dữ liệu'}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink/62">
                {reference?.administrative_center
                  ? `Trung tâm hành chính hiện tại đặt tại ${formatAdministrativeCenter(reference.administrative_center)}.`
                  : 'Thông tin trung tâm hành chính sẽ được bổ sung khi có dữ liệu phù hợp.'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-sand p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Cập nhật hồ sơ</p>
              <p className="mt-2 text-base font-semibold text-ink">
                {reference?.update_note ? 'Đã cập nhật thông tin chính' : 'Hồ sơ đã sẵn sàng'}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink/62">
                {reference?.update_note ?? 'Bạn có thể xem nhanh chỉ số chính, địa giới và danh sách đơn vị hành chính bên dưới.'}
              </p>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-6 sm:p-7">
          <SectionTitle
            eyebrow="Đơn vị hành chính"
            title="Tra cứu xã, phường và đơn vị sau sắp xếp"
            subtitle={
              referenceUnits.length
              ? `Đang hiển thị ${formatNumber(filteredUnits.length)} / ${formatNumber(referenceUnits.length)} đơn vị hành chính.`
              : 'Danh sách đơn vị hành chính sẽ được bổ sung khi có dữ liệu đầy đủ.'
            }
          action={
            referenceUnits.length ? (
              <div className="rounded-lg border border-slate-200 bg-sand px-4 py-2 text-sm font-medium text-ink/72">
                {formatNumber(referenceUnits.filter((unit) => unit.ward_type === 'xã').length)} xã •{' '}
                {formatNumber(referenceUnits.filter((unit) => unit.ward_type === 'phường').length)} phường
              </div>
            ) : null
          }
        />

        {referenceUnits.length > 0 ? (
          <>
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="block flex-1">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-ink/45">Tìm đơn vị</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tên đơn vị, mã, trụ sở hoặc thông tin sáp nhập"
                  className="app-input w-full rounded-lg px-4 py-3 text-sm"
                />
              </label>

              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-ink/45">Lọc theo loại</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setUnitFilter('all')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      unitFilter === 'all' ? 'bg-ink text-white' : 'bg-sand text-ink/70'
                    }`}
                  >
                    Tất cả
                  </button>
                  {availableTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setUnitFilter(type)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
                        unitFilter === type ? 'bg-tide text-white' : 'bg-sand text-ink/70'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredUnits.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredUnits.map((unit) => (
                  <UnitCard key={unit.ward_code} unit={unit} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-ink/52">
                Không có đơn vị nào khớp với bộ lọc hiện tại.
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10">
            <p className="text-center text-sm text-ink/52">Chưa có danh sách chi tiết cho tỉnh/thành này.</p>
            {info?.administrative_structure?.wards_communes_list?.value?.length ? (
              <div className="mt-5">
                <TagCloud items={info.administrative_structure.wards_communes_list.value} />
              </div>
            ) : null}
          </div>
        )}
      </SurfaceCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SurfaceCard className="p-6">
          <SectionTitle
            eyebrow="Kinh tế"
            title="Kinh tế, dân cư và ngành chủ lực"
            subtitle="Các chỉ số và mô tả giúp hình dung quy mô kinh tế, dân cư và ngành thế mạnh."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-sand p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Chỉ số kinh tế</p>
              <div className="mt-4 space-y-3">
                <DetailRow label="GRDP" value={formatCurrencyBillion(reference?.grdp_billion_vnd ?? null)} />
                <DetailRow label="Thu nhập bình quân" value={formatIncome(reference?.income_per_capita_million_vnd ?? null)} />
                <DetailRow label="Thu ngân sách / doanh thu" value={formatCurrencyBillion(reference?.revenue_billion_vnd ?? null)} />
              </div>
            </div>
            <div className="rounded-lg border border-tide/10 bg-mist/55 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Diễn giải địa phương</p>
              <p className="mt-3 text-sm leading-6 text-ink/62">{info?.economy?.scale?.value ?? 'Chưa có mô tả.'}</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-sm font-semibold text-ink">Ngành kinh tế chính</p>
            <TagCloud items={sectors} />
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <SectionTitle
            eyebrow="Văn hóa"
            title="Du lịch, đặc sản và lễ hội"
            subtitle="Những điểm đến, sản phẩm địa phương và hoạt động văn hóa tiêu biểu."
          />
          <div className="space-y-5">
            <AttractionGrid items={attractions} />
            <SpecialtyGrid items={specialties} />
            {festivals.length > 0 && <DataList title="Lễ hội tiêu biểu" items={festivals} />}
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DataList title="Hạ tầng và kết nối" items={infrastructure} />
        <DataList title="Tỉnh thành và quốc gia tiếp giáp" items={[...borderWithProvinces, ...countryBorders]} />
      </div>
    </div>
  );
}
