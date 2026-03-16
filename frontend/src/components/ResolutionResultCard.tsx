import type { ResolveAdminUnitResponse } from '../types/admin';

function labelConfidence(confidence: ResolveAdminUnitResponse['confidence']) {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-100 text-emerald-700';
    case 'medium':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-rose-100 text-rose-700';
  }
}

function communeTypeLabel(value: ResolveAdminUnitResponse['current_match']['commune_type']) {
  switch (value) {
    case 'phuong':
      return 'Phường';
    case 'xa':
      return 'Xã';
    case 'dac_khu':
      return 'Đặc khu';
    default:
      return 'Chưa xác định';
  }
}

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

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-tide">Kết quả phân giải</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
            {result.current_match.commune_name ?? 'Chưa xác định xã/phường'}
          </h2>
          <p className="mt-1 text-sm text-ink/65">{result.current_match.province_name ?? 'Chưa xác định tỉnh/thành'}</p>
        </div>
        <span className={`rounded-full px-3 py-2 text-xs font-medium capitalize ${labelConfidence(result.confidence)}`}>
          {result.confidence === 'high' ? 'Tin cậy cao' : result.confidence === 'medium' ? 'Tin cậy trung bình' : 'Tin cậy thấp'}
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-sand/75 p-4">
          <h3 className="font-display text-lg font-medium text-ink">Đơn vị hành chính hiện tại</h3>
          <dl className="mt-4 space-y-3 text-sm text-ink/75">
            <div>
              <dt className="font-medium text-ink">Tỉnh/thành</dt>
              <dd>{result.current_match.province_name ?? 'Không rõ'} ({result.current_match.province_code ?? 'n/a'})</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Xã/phường/đặc khu</dt>
              <dd>
                {result.current_match.commune_name ?? 'Không rõ'} ({result.current_match.commune_code ?? 'n/a'})
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Loại đơn vị</dt>
              <dd>{communeTypeLabel(result.current_match.commune_type)}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Tọa độ</dt>
              <dd>{result.input.lat.toFixed(6)}, {result.input.lon.toFixed(6)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl bg-mist/65 p-4">
          <h3 className="font-display text-lg font-medium text-ink">Địa chỉ từ OpenMap</h3>
          <dl className="mt-4 space-y-3 text-sm text-ink/75">
            <div>
              <dt className="font-medium text-ink">Địa chỉ mới</dt>
              <dd>{result.raw_reverse_geocode.current.formatted_address || 'n/a'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Địa chỉ cũ</dt>
              <dd>{result.raw_reverse_geocode.legacy?.formatted_address ?? 'Không có'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Tên xã/phường mới</dt>
              <dd>{result.raw_reverse_geocode.current.raw_commune_or_ward_name ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Tên tỉnh/thành mới</dt>
              <dd>{result.raw_reverse_geocode.current.raw_province_name ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Nguồn</dt>
              <dd>{result.raw_reverse_geocode.current.provider_name}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-ink/10 bg-white/75 p-4">
          <h3 className="font-display text-lg font-medium text-ink">Tên cũ và tên đã chuẩn hóa</h3>
          <dl className="mt-4 space-y-3 text-sm text-ink/75">
            <div>
              <dt className="font-medium text-ink">Xã/phường cũ</dt>
              <dd>{result.legacy_match.legacy_commune_or_ward ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Quận/huyện cũ</dt>
              <dd>{result.legacy_match.legacy_district ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Tỉnh/thành cũ</dt>
              <dd>{result.legacy_match.legacy_province ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Chuẩn hóa xã/phường mới</dt>
              <dd>{result.normalized.current_commune_or_ward ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Chuẩn hóa tỉnh/thành mới</dt>
              <dd>{result.normalized.current_province ?? 'n/a'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white/75 p-4">
          <h3 className="font-display text-lg font-medium text-ink">Pipeline xử lý</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.resolution_path.map((step) => (
              <span key={step} className="rounded-full bg-ink px-3 py-1.5 text-xs text-white">
                {step}
              </span>
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm text-ink/70">
            {result.debug.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      </div>

      {result.alternatives.length ? (
        <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-display text-lg font-medium text-ink">Các xã/phường ứng viên</h3>
          <ul className="mt-4 space-y-3 text-sm text-ink/75">
            {result.alternatives.map((candidate) => (
              <li key={candidate.commune_code} className="rounded-2xl bg-white/80 p-3">
                <p className="font-medium text-ink">
                  {candidate.commune_name} ({candidate.commune_type})
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">Mã: {candidate.commune_code}</p>
                <p className="mt-2">{candidate.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
