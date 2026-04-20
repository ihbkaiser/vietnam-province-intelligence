# VietGeoAI

VietGeoAI is a full-stack platform prototype for two focused workflows:

1. An interactive map of Vietnam's 34 current province-level administrative units
2. A lat/lon resolution pipeline that treats reverse geocoding as candidate input, then normalizes to canonical current output:
   - current commune-level unit
   - current province-level unit

The app is intentionally structured so mock data can be swapped later for:

- official province polygons
- official commune polygons
- real reverse geocoding providers
- real legacy-to-current crosswalk datasets

Important date note:

- Province names in this repo follow Vietnam's 34 province-level administrative structure effective June 12, 2025.
- The included GeoJSON geometries are stylized mock bounding boxes, not official boundaries.
- The included commune seeds and legacy crosswalks are mock examples designed to exercise the resolver architecture.

## Stack

- Frontend: React, TypeScript, Vite, React Router, Tailwind CSS, react-simple-maps
- Backend: Node.js, Express, TypeScript
- Geospatial utilities: Turf.js
- Data: local TypeScript seed files exporting GeoJSON-compatible objects

## Project structure

```text
.
├── backend
│   ├── src
│   │   ├── data
│   │   ├── routes
│   │   ├── services
│   │   │   ├── crosswalk
│   │   │   ├── geo
│   │   │   ├── normalize
│   │   │   ├── resolver
│   │   │   └── reverseGeocode
│   │   ├── types
│   │   ├── app.ts
│   │   └── server.ts
├── frontend
│   ├── src
│   │   ├── components
│   │   ├── hooks
│   │   ├── pages
│   │   ├── types
│   │   ├── utils
│   │   ├── App.tsx
│   │   └── main.tsx
├── package.json
└── README.md
```

## Features

### UC-01 Interactive province map

- Loads a local backend GeoJSON collection for 34 province-level units
- Highlights provinces on hover
- Selects provinces on click
- Shows province name and code in an info card
- Navigates to `/province/:provinceCode`

### Lat/lon to canonical administrative output

`POST /api/resolve-admin-unit`

Pipeline:

1. Validate `lat` and `lon`
2. Reverse geocode through a provider abstraction
3. Resolve current province via local province point-in-polygon
4. Normalize Vietnamese administrative labels
5. Parse legacy address fields
6. Crosswalk legacy province names to current province names
7. Resolve current commune by:
   - commune polygon lookup first
   - name, alias, and legacy crosswalk fallback second
8. Return confidence, alternatives, debug notes, and a resolution path

Canonical output:

- province-level unit
- commune-level unit

District-level names are treated only as legacy or intermediate hints.

## API

### `GET /api/health`

Simple health check.

### `GET /api/provinces`

Returns a GeoJSON `FeatureCollection` for the 34 province-level units.

### `GET /api/provinces/:provinceCode`

Returns province metadata and placeholder detail content.

### `POST /api/resolve-admin-unit`

Request:

```json
{
  "lat": 10.7769,
  "lon": 106.7009
}
```

Response shape:

```json
{
  "input": {
    "lat": 10.7769,
    "lon": 106.7009
  },
  "raw_reverse_geocode": {
    "formatted_address": "Ben Thanh Ward, District 1, Ho Chi Minh City, Vietnam",
    "raw_commune_or_ward_name": "Ben Thanh Ward",
    "raw_district_name": "District 1",
    "raw_province_name": "Ho Chi Minh City",
    "provider_name": "mock",
    "raw_payload": {
      "zone": "hcm-center"
    }
  },
  "legacy_match": {
    "legacy_commune_or_ward": "Ben Thanh Ward",
    "legacy_district": "District 1",
    "legacy_province": "Ho Chi Minh City"
  },
  "current_match": {
    "province_code": "ho-chi-minh-city",
    "province_name": "Ho Chi Minh City",
    "commune_code": "hcm-ben-thanh",
    "commune_name": "Ben Thanh Ward",
    "commune_type": "phuong"
  },
  "alternatives": [],
  "confidence": "high",
  "resolution_path": [
    "province_polygon",
    "reverse_geocode",
    "legacy_crosswalk",
    "commune_polygon_or_name_match"
  ],
  "debug": {
    "province_polygon_match": true,
    "commune_polygon_match": true,
    "crosswalk_used": true,
    "provider_conflict": false,
    "notes": []
  }
}
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

From the repository root:

```bash
npm run dev
```

This starts:

- frontend on `http://localhost:5173`
- backend on `http://localhost:8787`

### 3. Production build

```bash
npm run build
```

## Mock data coverage

Current local data includes:

- 34 current province-level units
- stylized province GeoJSON placeholder polygons
- generated mock commune-level polygons
- legacy province-to-current province mappings
- legacy commune-to-current commune mappings
- alias records for province and commune matching

The commune dataset is deliberately lightweight and synthetic. It exists to validate the pipeline architecture and UI, not to represent the full current commune register.

## Replacing mock data with real Vietnam administrative data

### Province polygons

Replace:

- `backend/src/data/provinceSeeds.ts`
- `backend/src/data/geojson.ts`

Recommended target:

- load official GeoJSON or TopoJSON converted to GeoJSON
- keep `province_id`, `province_code`, `province_name`
- preserve stable `province_code` values used by routes

### Commune polygons

Replace:

- `backend/src/data/communeSeeds.ts`
- `backend/src/data/geojson.ts`

Recommended target:

- one feature per current commune-level unit
- include `commune_code`, `commune_name`, `commune_type`, `province_code`
- if real commune polygons exist, the current resolver already prioritizes polygon matching

### Legacy crosswalks

Replace:

- `backend/src/data/legacyProvinceMappings.ts`
- `backend/src/data/legacyCommuneMappings.ts`
- optionally `backend/src/data/aliasRecords.ts`

Recommended target:

- one-to-one mappings where available
- many-to-one records for mergers
- one-to-many records for ambiguous splits
- default flags for best-guess behavior

### Reverse geocoder

Current provider:

- `backend/src/services/reverseGeocode/mockProvider.ts`

Provider contract:

- `backend/src/services/reverseGeocode/provider.ts`

To add a real provider:

1. Create a class implementing `ReverseGeocodeProvider`
2. Return:
   - `formatted_address`
   - `raw_commune_or_ward_name`
   - `raw_district_name`
   - `raw_province_name`
   - `provider_name`
   - `raw_payload`
3. Inject that provider in `backend/src/routes/resolver.ts`

Important rule:

- reverse geocode output remains supporting evidence only
- province polygon lookup remains the strongest source of truth for province-level resolution

## UI routes

- `/`: interactive province map + selection card
- `/province/:provinceCode`: province detail placeholder
- `/resolver`: lat/lon resolution form + result panel

## Notes for production hardening

- Move seed data to versioned datasets or a spatial database
- Add schema validation for inbound and outbound payloads
- Introduce request logging and structured observability
- Cache reverse geocode provider responses
- Add tests for crosswalk conflicts and ambiguous mappings
- Add official shapefile or GeoJSON ingestion scripts

## Known limitations

- Province shapes are not official administrative boundaries
- Commune data is synthetic and incomplete
- The mock reverse geocoder only covers selected demo zones
- No persistence layer is included in the MVP
