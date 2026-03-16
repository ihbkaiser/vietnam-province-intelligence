import type { ProvinceCollection, ProvinceDetail, ResolveAdminUnitResponse } from '../types/admin';

async function handleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchProvinces(): Promise<ProvinceCollection> {
  const response = await fetch('/api/provinces');
  return handleJson<ProvinceCollection>(response);
}

export async function fetchProvinceDetail(provinceCode: string): Promise<ProvinceDetail> {
  const response = await fetch(`/api/provinces/${provinceCode}`);
  return handleJson<ProvinceDetail>(response);
}

export async function resolveLatLon(lat: number, lon: number): Promise<ResolveAdminUnitResponse> {
  const response = await fetch('/api/resolve-admin-unit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lat, lon })
  });

  return handleJson<ResolveAdminUnitResponse>(response);
}

