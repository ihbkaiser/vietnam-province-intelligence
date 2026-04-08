import { FormEvent, useState } from 'react';
import type { ResolveAdminUnitResponse } from '../types/admin';
import { resolveLatLon } from '../utils/api';

const CONFIDENCE_STYLE: Record<ResolveAdminUnitResponse['confidence'], string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-rose-100 text-rose-700'
};

const CONFIDENCE_LABEL: Record<ResolveAdminUnitResponse['confidence'], string> = {
  high: 'Tin cậy cao',
  medium: 'Tin cậy trung bình',
  low: 'Tin cậy thấp'
};

// ── Sub-components ────────────────────────────────────────────────────────

function AddressRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-ink/45">{label}</span>
      <span className="text-sm text-ink">{value ?? <span className="text-ink/30 italic">không xác định</span>}</span>
    </div>
  );
}

function NewAddressCard({ result }: { result: ResolveAdminUnitResponse }) {
  const fullAddress = result.raw_reverse_geocode.current.formatted_address;

  return (
    <div className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-tide">Sau 12/6/2025 · 2 cấp</p>
          <h2 className="mt-1.5 font-display text-xl font-semibold text-ink">Địa chỉ mới</h2>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${CONFIDENCE_STYLE[result.confidence]}`}>
          {CONFIDENCE_LABEL[result.confidence]}
        </span>
      </div>

      <p className="rounded-2xl bg-sand/80 px-4 py-3 text-sm font-medium text-ink break-words">
        {fullAddress || <span className="text-ink/40 italic font-normal">Chưa xác định được địa chỉ</span>}
      </p>

      <div className="space-y-3">
        <AddressRow label="Tỉnh / Thành phố trực thuộc TW" value={result.current_match.province_name} />
        <AddressRow label="Xã / Phường / Thị trấn" value={result.current_match.commune_name} />
      </div>
    </div>
  );
}

function OldAddressCard({ result }: { result: ResolveAdminUnitResponse }) {
  const legacy = result.raw_reverse_geocode.legacy;

  return (
    <div className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-tide">Trước 12/6/2025 · 3 cấp</p>
        <h2 className="mt-1.5 font-display text-xl font-semibold text-ink">Địa chỉ cũ</h2>
      </div>

      {legacy ? (
        <>
          {/* formatted_address từ geocoder chứa đầy đủ quận/huyện cũ */}
          <p className="rounded-2xl bg-mist/70 px-4 py-3 text-sm font-medium text-ink break-words">
            {legacy.formatted_address || <span className="text-ink/40 italic font-normal">Chưa xác định được địa chỉ</span>}
          </p>

          <div className="space-y-3">
            <AddressRow label="Tỉnh / Thành phố cũ" value={result.legacy_match.legacy_province} />
            <AddressRow label="Quận / Huyện cũ" value={result.legacy_match.legacy_district} />
            <AddressRow label="Xã / Phường cũ" value={result.legacy_match.legacy_commune_or_ward} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-sand/40 px-4 py-5 text-sm text-ink/55">
          Không trích xuất được địa chỉ cũ — tọa độ này có thể không thuộc đơn vị bị sáp nhập, hoặc cần{' '}
          <span className="font-medium text-ink/70">OpenMap API key</span>.
          <br />
          <span className="mt-1 block text-xs text-ink/40">
            Đặt biến môi trường <code className="font-mono">OPENMAP_API_KEY</code> ở backend.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function ResolverPage() {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [result, setResult] = useState<ResolveAdminUnitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedLat = Number(lat);
    const parsedLon = Number(lon);

    if (Number.isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setValidationError('Vĩ độ không hợp lệ (phải từ –90 đến 90).');
      return;
    }

    if (Number.isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      setValidationError('Kinh độ không hợp lệ (phải từ –180 đến 180).');
      return;
    }

    setValidationError(null);
    setError(null);
    setLoading(true);

    try {
      const data = await resolveLatLon(parsedLat, parsedLon);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể phân giải địa chỉ.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur"
      >
        <h1 className="font-display text-2xl font-semibold text-ink">Tra cứu địa chỉ từ tọa độ</h1>
        <p className="mt-1 text-sm text-ink/55">
          Nhập vĩ độ và kinh độ để xem địa chỉ theo đơn vị hành chính mới (34 tỉnh/thành) và địa chỉ cũ (63 tỉnh/thành trước 2025).
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Vĩ độ (lat)</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="vd: 10.7769"
              className="w-44 rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-tide"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Kinh độ (lon)</span>
            <input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="vd: 106.7009"
              className="w-44 rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-tide"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Đang tra...' : 'Tra cứu'}
          </button>
        </div>

        {(validationError ?? error) && (
          <p className="mt-3 text-sm text-coral">{validationError ?? error}</p>
        )}

        <p className="mt-3 text-xs text-ink/40">
          Ví dụ nhanh:{' '}
          {[
            { label: 'TP.HCM', lat: '10.7769', lon: '106.7009' },
            { label: 'Hà Nội', lat: '21.0285', lon: '105.8542' },
            { label: 'Đà Nẵng', lat: '16.0471', lon: '108.2068' }
          ].map(({ label, lat: exLat, lon: exLon }) => (
            <button
              key={label}
              type="button"
              onClick={() => { setLat(exLat); setLon(exLon); }}
              className="mr-2 underline underline-offset-2 transition hover:text-tide"
            >
              {label}
            </button>
          ))}
        </p>
      </form>

      {/* Kết quả */}
      {result && (
        <>
          <p className="px-1 text-xs text-ink/40">
            Tọa độ: {result.input.lat.toFixed(6)}, {result.input.lon.toFixed(6)}
            {' · '}Nguồn geocoder: {result.raw_reverse_geocode.current.provider_name}
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <NewAddressCard result={result} />
            <OldAddressCard result={result} />
          </div>
        </>
      )}
    </div>
  );
}
