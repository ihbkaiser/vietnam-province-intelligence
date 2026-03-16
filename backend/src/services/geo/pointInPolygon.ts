import { booleanPointInPolygon, point } from '@turf/turf';
import { loadCommuneGeoJson, loadProvinceGeoJson } from '../../data/loaders.js';
import type { CommuneFeature, ProvinceFeature } from '../../types/admin.js';

const provinceFeatures = loadProvinceGeoJson().features;
const communeFeatures = loadCommuneGeoJson().features;

export function findProvinceForPoint(lat: number, lon: number): ProvinceFeature | null {
  const targetPoint = point([lon, lat]);

  return provinceFeatures.find((feature) => booleanPointInPolygon(targetPoint, feature)) ?? null;
}

export function findCommuneForPoint(
  lat: number,
  lon: number,
  provinceCode?: string | null
): CommuneFeature | null {
  const targetPoint = point([lon, lat]);

  return (
    communeFeatures.find((feature) => {
      if (provinceCode && feature.properties.province_code !== provinceCode) {
        return false;
      }

      return booleanPointInPolygon(targetPoint, feature);
    }) ?? null
  );
}

