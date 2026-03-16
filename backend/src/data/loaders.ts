import { communeGeoJson, provinceGeoJson } from './geojson.js';
import { communeSeeds } from './communeSeeds.js';
import { provinceSeeds } from './provinceSeeds.js';
import type {
  CommuneFeatureCollection,
  CommuneSeed,
  ProvinceFeatureCollection,
  ProvinceSeed
} from '../types/admin.js';

function assertProvinceSeeds(data: ProvinceSeed[]): ProvinceSeed[] {
  if (data.length !== 34) {
    throw new Error(`Expected 34 province-level units, received ${data.length}.`);
  }

  const invalid = data.find((item) => !item.province_code || !item.province_name || item.bbox.length !== 4);
  if (invalid) {
    throw new Error(`Invalid province seed detected for ${invalid.province_code || 'unknown province'}.`);
  }

  return data;
}

function assertProvinceGeoJson(data: ProvinceFeatureCollection): ProvinceFeatureCollection {
  if (data.type !== 'FeatureCollection' || data.features.length !== 34) {
    throw new Error('Province GeoJSON must be a FeatureCollection with 34 features.');
  }

  return data;
}

function assertCommuneSeeds(data: CommuneSeed[]): CommuneSeed[] {
  if (!data.length) {
    throw new Error('Commune seed data is empty.');
  }

  const invalid = data.find((item) => !item.commune_code || !item.province_code || item.bbox.length !== 4);
  if (invalid) {
    throw new Error(`Invalid commune seed detected for ${invalid.commune_code || 'unknown commune'}.`);
  }

  return data;
}

function assertCommuneGeoJson(data: CommuneFeatureCollection): CommuneFeatureCollection {
  if (data.type !== 'FeatureCollection' || !data.features.length) {
    throw new Error('Commune GeoJSON must be a non-empty FeatureCollection.');
  }

  return data;
}

export function loadProvinceSeeds(): ProvinceSeed[] {
  return assertProvinceSeeds(provinceSeeds);
}

export function loadProvinceGeoJson(): ProvinceFeatureCollection {
  return assertProvinceGeoJson(provinceGeoJson);
}

export function loadCommuneSeeds(): CommuneSeed[] {
  return assertCommuneSeeds(communeSeeds);
}

export function loadCommuneGeoJson(): CommuneFeatureCollection {
  return assertCommuneGeoJson(communeGeoJson);
}

