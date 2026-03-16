import type { Feature, FeatureCollection, Polygon } from 'geojson';

export type ProvinceKind = 'province' | 'city';
export type CommuneType = 'xa' | 'phuong' | 'dac_khu';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type CommuneMappingType = 'one_to_one' | 'many_to_one' | 'one_to_many' | 'alias';

export interface ProvinceSeed {
  province_id: string;
  province_code: string;
  province_name: string;
  province_kind: ProvinceKind;
  aliases: string[];
  bbox: [number, number, number, number];
  description: string;
}

export interface ProvinceFeatureProperties {
  province_id: string;
  province_code: string;
  province_name: string;
  province_kind: ProvinceKind;
}

export type ProvinceFeature = Feature<Polygon, ProvinceFeatureProperties>;
export type ProvinceFeatureCollection = FeatureCollection<Polygon, ProvinceFeatureProperties>;

export interface ProvinceSummary extends ProvinceFeatureProperties {
  aliases: string[];
  description: string;
}

export interface CommuneSeed {
  commune_code: string;
  commune_name: string;
  commune_type: CommuneType;
  province_code: string;
  aliases: string[];
  bbox: [number, number, number, number];
}

export interface CommuneFeatureProperties {
  commune_code: string;
  commune_name: string;
  commune_type: CommuneType;
  province_code: string;
}

export type CommuneFeature = Feature<Polygon, CommuneFeatureProperties>;
export type CommuneFeatureCollection = FeatureCollection<Polygon, CommuneFeatureProperties>;

export interface LegacyProvinceMapping {
  legacy_province_name: string;
  legacy_province_code?: string;
  current_province_code: string;
}

export interface LegacyCommuneMapping {
  legacy_commune_name: string;
  legacy_district_name?: string;
  legacy_province_name?: string;
  current_commune_code: string;
  mapping_type: CommuneMappingType;
  is_default: boolean;
}

export interface AliasRecord {
  raw_name: string;
  normalized_name: string;
  entity_type: 'province' | 'commune';
  entity_code: string;
}

export interface ResolveAdminUnitRequest {
  lat: number;
  lon: number;
}

export interface ReverseGeocodeCandidate {
  formatted_address: string;
  raw_commune_or_ward_name?: string;
  raw_district_name?: string;
  raw_province_name?: string;
  provider_name: string;
  raw_payload: Record<string, unknown>;
}

export interface ReverseGeocodeBundle {
  current: ReverseGeocodeCandidate;
  legacy: ReverseGeocodeCandidate | null;
}

export interface ParsedLegacyAddress {
  legacy_commune_or_ward: string | null;
  legacy_district: string | null;
  legacy_province: string | null;
  normalized_commune_or_ward: string | null;
  normalized_district: string | null;
  normalized_province: string | null;
}

export interface CurrentMatch {
  province_code: string | null;
  province_name: string | null;
  commune_code: string | null;
  commune_name: string | null;
  commune_type: CommuneType | null;
}

export interface ResolutionAlternative {
  commune_code: string;
  commune_name: string;
  commune_type: CommuneType;
  province_code: string;
  reason: string;
}

export interface ResolveAdminUnitResponse {
  input: ResolveAdminUnitRequest;
  raw_reverse_geocode: ReverseGeocodeBundle;
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
  current_match: CurrentMatch;
  alternatives: ResolutionAlternative[];
  confidence: ConfidenceLevel;
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
