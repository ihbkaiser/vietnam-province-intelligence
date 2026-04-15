import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export interface ProvinceFeatureProperties {
  province_id: string;
  province_code: string;
  province_name: string;
  province_kind: 'province' | 'city';
}

export type ProvinceCollection = FeatureCollection<Polygon | MultiPolygon, ProvinceFeatureProperties>;

export interface ProvinceInfoField<T> {
  value: T;
  last_updated?: string;
  source?: string;
  description?: string;
}

export type ProvinceDisplayValue = string | number | null;

export interface ProvinceReferenceSource {
  name: string;
  url: string;
  terms_url?: string;
  crawled_at: string;
  note?: string;
}

export interface ProvinceReferenceUnit {
  ward_order: number;
  ward_name: string;
  ward_code: string;
  ward_type: string;
  admin_center: string | null;
  merger_from: string | null;
  population: number | null;
  area_km2: number | null;
  density_per_km2: number | null;
  ward_slug: string;
  old_district: string | null;
}

export interface ProvinceReferenceSnapshot {
  province_name: string;
  province_name_full: string;
  source_slug: string;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  province_code_text: string | null;
  administrative_center: string | null;
  phone_code: string | null;
  vehicle_plates: string[];
  region: string | null;
  economic_region: string | null;
  area_km2: number | null;
  population: number | null;
  total_ward: number | null;
  total_commune: number | null;
  total_unit: number | null;
  border_with_provinces: string[];
  overview_summary: string | null;
  boundary_summary: string | null;
  update_note: string | null;
  secretary: string | null;
  chairman: string | null;
  grdp_billion_vnd: number | null;
  income_per_capita_million_vnd: number | null;
  revenue_billion_vnd: number | null;
  units: ProvinceReferenceUnit[];
  source: ProvinceReferenceSource;
}

export interface ProvinceAttraction {
  name: string;
  type: string;
  description?: string;
  rating?: number | null;
}

export interface ProvinceSpecialty {
  name: string;
  type: string;
}

export interface ProvinceEthnicGroup {
  name: string;
  percentage?: number | null;
}

export interface ProvinceInfo {
  name?: ProvinceInfoField<string>;
  administrative_code?: ProvinceInfoField<string | number>;
  former_provinces?: ProvinceInfoField<string[]> & { description?: string };
  location?: {
    latitude?: ProvinceInfoField<ProvinceDisplayValue>;
    longitude?: ProvinceInfoField<ProvinceDisplayValue>;
    adjacent_areas?: {
      provinces?: ProvinceInfoField<string[]>;
      countries?: ProvinceInfoField<string[]>;
      seas?: ProvinceInfoField<string[]>;
    };
  };
  area?: {
    total_km2?: ProvinceInfoField<ProvinceDisplayValue>;
  };
  administrative_structure?: {
    wards_communes_count?: ProvinceInfoField<ProvinceDisplayValue>;
    wards_communes_list?: ProvinceInfoField<string[]>;
  };
  population?: {
    total?: ProvinceInfoField<ProvinceDisplayValue>;
    density_per_km2?: ProvinceInfoField<ProvinceDisplayValue>;
    ethnic_groups?: ProvinceInfoField<Array<string | ProvinceEthnicGroup>>;
  };
  economy?: {
    scale?: ProvinceInfoField<string | null>;
    main_sectors?: ProvinceInfoField<string[]>;
    gdp?: ProvinceInfoField<{ amount_usd: number; year: number } | null>;
  };
  tourism?: {
    attractions?: ProvinceInfoField<ProvinceAttraction[]>;
    local_specialties?: ProvinceInfoField<ProvinceSpecialty[]>;
    culture?: {
      festivals?: ProvinceInfoField<string[]>;
      events?: ProvinceInfoField<string[]>;
    };
  };
  infrastructure?: {
    airport?: ProvinceInfoField<string[]>;
    seaport?: ProvinceInfoField<string[]>;
    railway_station?: ProvinceInfoField<string[]>;
    other_transport?: ProvinceInfoField<string[]>;
  };
  environment?: {
    climate?: {
      type?: ProvinceInfoField<string | null>;
      average_temperature_c?: ProvinceInfoField<ProvinceDisplayValue>;
    };
    ecology?: {
      forests?: ProvinceInfoField<string[]>;
      sea?: ProvinceInfoField<string[]>;
      other_resources?: ProvinceInfoField<string[]>;
    };
  };
}

export interface ProvinceDetail extends ProvinceFeatureProperties {
  aliases: string[];
  description: string;
  commune_count: number;
  province_info: ProvinceInfo | null;
  reference_snapshot: ProvinceReferenceSnapshot | null;
}

export interface ProvinceSummary {
  province_id: string;
  province_code: string;
  province_name: string;
  province_kind: 'province' | 'city';
  aliases: string[];
  description: string;
}

export interface CommuneSeed {
  commune_code: string;
  commune_name: string;
  commune_type: 'xa' | 'phuong' | 'dac_khu';
  province_code: string;
  aliases: string[];
  bbox: [number, number, number, number];
}

export interface AddressParts {
  commune: string | null;
  district: string | null;
  province: string | null;
  formatted_address: string;
}

export interface ResolveAddressResponse {
  old_address: AddressParts;
  new_address: AddressParts;
  found: boolean;
  source: 'openmap-admin-v2';
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
