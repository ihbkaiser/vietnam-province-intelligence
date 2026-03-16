import { useEffect, useState } from 'react';
import type { ProvinceDetail } from '../types/admin';
import { fetchProvinceDetail } from '../utils/api';

export function useProvinceDetail(provinceCode: string | undefined) {
  const [data, setData] = useState<ProvinceDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(provinceCode));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provinceCode) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchProvinceDetail(provinceCode)
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provinceCode]);

  return { data, loading, error };
}

