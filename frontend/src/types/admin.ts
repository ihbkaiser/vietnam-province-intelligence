import type { FeatureCollection, Polygon } from 'geojson';

export interface ProvinceFeatureProperties {
  province_id: string;
  province_code: string;
  province_name: string;
  province_kind: 'province' | 'city';
}

export type ProvinceCollection = FeatureCollection<Polygon, ProvinceFeatureProperties>;

export interface ProvinceInfoField<T> {
  value: T;
  last_updated?: string;
  source?: string;
  description?: string;
}

export type ProvinceDisplayValue = string | number | null;

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
    ethnic_groups?: ProvinceInfoField<string[]>;
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
