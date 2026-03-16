import { useState } from 'react';
import { ErrorState } from '../components/ErrorState';
import { LatLonResolverForm } from '../components/LatLonResolverForm';
import { ResolutionResultCard } from '../components/ResolutionResultCard';
import type { ResolveAdminUnitResponse } from '../types/admin';
import { resolveLatLon } from '../utils/api';

export function ResolverPage() {
  const [result, setResult] = useState<ResolveAdminUnitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async ({ lat, lon }: { lat: number; lon: number }) => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await resolveLatLon(lat, lon);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể phân giải đơn vị hành chính.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-6">
        <LatLonResolverForm onSubmit={handleSubmit} submitting={submitting} />
        {error ? <ErrorState message={error} /> : null}
      </div>
      <ResolutionResultCard
        result={result}
        emptyMessage="Nhập `lat`, `lon` để xem địa chỉ mới từ OpenMap, địa chỉ cũ và đơn vị hành chính hiện tại."
      />
    </div>
  );
}
