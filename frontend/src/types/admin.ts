import type { FeatureCollection, Polygon } from 'geojson';

export interface ProvinceFeatureProperties {
  province_id: string;
  province_code: string;
  province_name: string;
  province_kind: 'province' | 'city';
}

export type ProvinceCollection = FeatureCollection<Polygon, ProvinceFeatureProperties>;

export interface ProvinceDetail extends ProvinceFeatureProperties {
  aliases: string[];
  description: string;
  commune_count: number;
  placeholder_details: string;
}

export interface ResolveAdminUnitResponse {
  input: {
    lat: number;
    lon: number;
  };
  raw_reverse_geocode: {
    current: {
      formatted_address: string;
      raw_commune_or_ward_name?: string;
      raw_district_name?: string;
      raw_province_name?: string;
      provider_name: string;
      raw_payload: Record<string, unknown>;
    };
    legacy: {
      formatted_address: string;
      raw_commune_or_ward_name?: string;
      raw_district_name?: string;
      raw_province_name?: string;
      provider_name: string;
      raw_payload: Record<string, unknown>;
    } | null;
  };
  normalized: {
    current_commune_or_ward: string | null;
    current_province: string | null;
    legacy_commune_or_ward: string | null;
    legacy_province: string | null;
  };
  legacy_match: {
    legacy_commune_or_ward: string | null;
    legacy_district: string | null;
    legacy_province: string | null;
  };
  current_match: {
    province_code: string | null;
    province_name: string | null;
    commune_code: string | null;
    commune_name: string | null;
    commune_type: 'xa' | 'phuong' | 'dac_khu' | null;
  };
  alternatives: Array<{
    commune_code: string;
    commune_name: string;
    commune_type: 'xa' | 'phuong' | 'dac_khu';
    province_code: string;
    reason: string;
  }>;
  confidence: 'high' | 'medium' | 'low';
  resolution_path: string[];
  debug: {
    province_polygon_match: boolean;
    commune_polygon_match: boolean;
    unique_commune_match: boolean;
    crosswalk_used: boolean;
    provider_conflict: boolean;
    notes: string[];
  };
}
