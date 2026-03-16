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
      className="rounded-[2rem] border border-white/70 bg-white/70 p-6 shadow-panel backdrop-blur"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-tide">UC-02</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Tra cứu đơn vị hành chính hiện tại</h2>
        </div>
        <div className="rounded-full bg-mist px-3 py-2 text-xs text-ink/70">OpenMap + polygon địa phương</div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Vĩ độ</span>
          <input
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-ink outline-none transition focus:border-tide"
            placeholder="10.78"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Kinh độ</span>
          <input
            value={lon}
            onChange={(event) => setLon(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand/70 px-4 py-3 text-ink outline-none transition focus:border-tide"
            placeholder="106.69"
          />
        </label>
      </div>

      {validationError ? <p className="mt-4 text-sm text-coral">{validationError}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Đang phân giải...' : 'Phân giải địa chỉ'}
        </button>
        <p className="self-center text-sm text-ink/60">Có thể thử `10.7769, 106.7009` hoặc `16.0471, 108.2068`.</p>
      </div>
    </form>
  );
}
