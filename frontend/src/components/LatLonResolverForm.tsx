import { FormEvent, useState } from 'react';

interface LatLonResolverFormProps {
  onSubmit: (values: { lat: number; lon: number }) => Promise<void>;
  submitting: boolean;
}

export function LatLonResolverForm({ onSubmit, submitting }: LatLonResolverFormProps) {
  const [lat, setLat] = useState('10.7769');
  const [lon, setLon] = useState('106.7009');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedLat = Number(lat);
    const parsedLon = Number(lon);

    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLon)) {
      setValidationError('Vĩ độ và kinh độ phải là số hợp lệ.');
      return;
    }

    setValidationError(null);
    await onSubmit({ lat: parsedLat, lon: parsedLon });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white/92 p-5 shadow-panel backdrop-blur"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-tide">Tra cứu theo tọa độ</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Tìm địa chỉ từ vị trí</h2>
        </div>
        <div className="rounded-lg border border-tide/15 bg-mist px-3 py-2 text-xs font-medium text-ink/70">Bản đồ số VIETGEOAI</div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Vĩ độ</span>
          <input
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            className="app-input mt-2 w-full rounded-lg px-4 py-3 text-ink transition"
            placeholder="10.78"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Kinh độ</span>
          <input
            value={lon}
            onChange={(event) => setLon(event.target.value)}
            className="app-input mt-2 w-full rounded-lg px-4 py-3 text-ink transition"
            placeholder="106.69"
          />
        </label>
      </div>

      {validationError ? <p className="mt-4 text-sm text-coral">{validationError}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10h.01" />
          </svg>
          {submitting ? 'Đang tìm...' : 'Tìm địa chỉ'}
        </button>
        <p className="self-center text-sm text-ink/60">Có thể thử 10.7769, 106.7009 hoặc 16.0471, 108.2068.</p>
      </div>
    </form>
  );
}
