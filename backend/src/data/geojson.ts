import { createRequire } from 'module';
import type {
  CommuneFeatureCollection,
  CommuneSeed,
  ProvinceFeatureCollection
} from '../types/admin.js';
import { communeSeeds } from './communeSeeds.js';

const require = createRequire(import.meta.url);

function bboxToPolygon([west, south, east, north]: [number, number, number, number]) {
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south]
    ]
  ];
}

function communeToFeature(commune: CommuneSeed): CommuneFeatureCollection['features'][number] {
  return {
    type: 'Feature',
    properties: {
      commune_code: commune.commune_code,
      commune_name: commune.commune_name,
      commune_type: commune.commune_type,
      province_code: commune.province_code
    },
    geometry: {
      type: 'Polygon',
      coordinates: bboxToPolygon(commune.bbox)
    }
  };
}

export const provinceGeoJson: ProvinceFeatureCollection =
  require('./realProvinceFeatures.json') as ProvinceFeatureCollection;

export const communeGeoJson: CommuneFeatureCollection = {
  type: 'FeatureCollection',
  features: communeSeeds.map(communeToFeature)
};
