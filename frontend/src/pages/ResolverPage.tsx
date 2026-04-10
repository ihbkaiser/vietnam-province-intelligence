import { FormEvent, useState } from 'react';
import type { AddressParts, ResolveAddressResponse } from '../types/admin';
import { resolveAddress } from '../utils/api';

type InputMode = 'structured' | 'freetext';

const STRUCTURED_EXAMPLES = [
  { label: 'Bình Dương → TP.HCM', province: 'Bình Dương', district: 'Thủ Dầu Một', commune: 'Phú Hòa' },
  { label: 'Hà Giang → Tuyên Quang', province: 'Hà Giang', district: '', commune: '' },
  { label: 'Hội An (Quảng Nam) → Đà Nẵng', province: 'Quảng Nam', district: 'Hội An', commune: '' }
];

const FREETEXT_EXAMPLES = [
  '134 Đường Phú Lợi, phường Phú Hòa, Thủ Dầu Một, Bình Dương',
  'Hội An, Quảng Nam',
  'phường Minh Khai, thành phố Hà Giang, tỉnh Hà Giang'
];

function AddressCard({
  title,
  subtitle,
  parts,
  badge
}: {
  title: string;
  subtitle: string;
  parts: AddressParts;
  badge?: { label: string; className: string };
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-tide">{subtitle}</p>
          <h2 className="mt-1.5 font-display text-xl font-semibold text-ink">{title}</h2>
        </div>
        {badge && (
          <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>

      {parts.formatted_address && (
        <p className="rounded-2xl bg-mist/70 px-4 py-3 text-sm font-medium text-ink break-words">
          {parts.formatted_address}
        </p>
      )}

      <div className="space-y-3">
        <Field label="Tỉnh / Thành phố" value={parts.province} />
        {parts.district && <Field label="Quận / Huyện" value={parts.district} />}
        <Field label="Xã / Phường / Thị trấn" value={parts.commune} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-ink/45">{label}</span>
      <span className="text-sm text-ink">
        {value || <span className="italic text-ink/30">không xác định</span>}
      </span>
    </div>
  );
}

export function ResolverPage() {
  const [mode, setMode] = useState<InputMode>('structured');

  // Chế độ nhập từng trường
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [commune, setCommune] = useState('');

  // Chế độ nhập tự do
  const [addressText, setAddressText] = useState('');

  const [result, setResult] = useState<ResolveAddressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = mode === 'structured' ? province.trim().length > 0 : addressText.trim().length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      const params =
        mode === 'freetext'
          ? { address_text: addressText.trim() }
          : {
              legacy_province: province.trim(),
              legacy_district: district.trim() || undefined,
              legacy_commune: commune.trim() || undefined
            };

      const data = await resolveAddress(params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chuyển đổi địa chỉ.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: InputMode) => {
    setMode(next);
    setResult(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur"
      >
        <h1 className="font-display text-2xl font-semibold text-ink">Chuyển đổi địa chỉ cũ sang mới</h1>
        <p className="mt-1 text-sm text-ink/55">
          Nhập địa chỉ cũ (63 tỉnh/thành trước 12/6/2025) để tra địa chỉ mới (34 tỉnh/thành) qua OpenMap admin_v2.
        </p>

        {/* Mode toggle */}
        <div className="mt-5 flex gap-1 rounded-2xl bg-sand/60 p-1 w-fit">
          <button
            type="button"
            onClick={() => switchMode('structured')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === 'structured'
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            Nhập theo cấp
          </button>
          <button
            type="button"
            onClick={() => switchMode('freetext')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === 'freetext'
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            Nhập địa chỉ tự do
          </button>
        </div>

        {/* Structured input */}
        {mode === 'structured' && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">
                  Tỉnh / Thành phố cũ <span className="text-coral">*</span>
                </span>
                <input
                  required
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="vd: Bình Dương"
                  className="w-48 rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-tide"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Quận / Huyện cũ</span>
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="vd: Thủ Dầu Một"
                  className="w-48 rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-tide"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Xã / Phường cũ</span>
                <input
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  placeholder="vd: Phú Hòa"
                  className="w-48 rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-tide"
                />
              </label>

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Đang tra...' : 'Chuyển đổi'}
              </button>
            </div>

            <p className="text-xs text-ink/40">
              Ví dụ nhanh:{' '}
              {STRUCTURED_EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setProvince(ex.province);
                    setDistrict(ex.district);
                    setCommune(ex.commune);
                    setResult(null);
                    setError(null);
                  }}
                  className="mr-2 underline underline-offset-2 transition hover:text-tide"
                >
                  {ex.label}
                </button>
              ))}
            </p>
          </div>
        )}

        {/* Free text input */}
        {mode === 'freetext' && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 flex-1 min-w-64">
                <span className="text-sm font-medium text-ink">
                  Địa chỉ cũ <span className="text-coral">*</span>
                </span>
                <input
                  required
                  value={addressText}
                  onChange={(e) => setAddressText(e.target.value)}
                  placeholder="vd: 134 Phú Lợi, phường Phú Hòa, Thủ Dầu Một, Bình Dương"
                  className="rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-tide"
                />
              </label>

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Đang tra...' : 'Chuyển đổi'}
              </button>
            </div>

            <p className="text-xs text-ink/40">
              Ví dụ nhanh:{' '}
              {FREETEXT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setAddressText(ex);
                    setResult(null);
                    setError(null);
                  }}
                  className="mr-2 underline underline-offset-2 transition hover:text-tide"
                >
                  {ex.length > 40 ? ex.slice(0, 38) + '…' : ex}
                </button>
              ))}
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-coral">{error}</p>}
      </form>

      {result && (
        <div className="grid gap-4 md:grid-cols-2">
          <AddressCard
            title="Địa chỉ cũ"
            subtitle="Trước 12/6/2025 · 3 cấp"
            parts={result.old_address}
          />
          <AddressCard
            title="Địa chỉ mới"
            subtitle="Sau 12/6/2025 · 2 cấp"
            parts={result.new_address}
            badge={
              result.found
                ? { label: 'OpenMap admin_v2', className: 'bg-emerald-100 text-emerald-700' }
                : { label: 'Không tìm thấy', className: 'bg-rose-100 text-rose-700' }
            }
          />
        </div>
      )}
    </div>
  );
}
