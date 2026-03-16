import type {
  CommuneFeatureCollection,
  CommuneSeed,
  ProvinceFeatureCollection,
  ProvinceSeed
} from '../types/admin.js';
import { communeSeeds } from './communeSeeds.js';
import { provinceSeeds } from './provinceSeeds.js';

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

function provinceToFeature(province: ProvinceSeed): ProvinceFeatureCollection['features'][number] {
  return {
    type: 'Feature',
    properties: {
      province_id: province.province_id,
      province_code: province.province_code,
      province_name: province.province_name,
      province_kind: province.province_kind
    },
    geometry: {
      type: 'Polygon',
      coordinates: bboxToPolygon(province.bbox)
    }
  };
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

export const provinceGeoJson: ProvinceFeatureCollection = {
  type: 'FeatureCollection',
  features: provinceSeeds.map(provinceToFeature)
};

export const communeGeoJson: CommuneFeatureCollection = {
  type: 'FeatureCollection',
  features: communeSeeds.map(communeToFeature)
};
