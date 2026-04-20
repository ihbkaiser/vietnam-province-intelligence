import { useEffect, useRef, type ReactNode } from 'react';
import L from 'leaflet';
import { GeoJSONSource, Map as OpenMapMap, NavigationControl, type MapLayerMouseEvent } from '@openmapvn/openmapvn-gl';
import '@openmapvn/openmapvn-gl/dist/maplibre-gl.css';
import 'leaflet/dist/leaflet.css';
import type { ProvinceCollection, ProvinceFeatureProperties } from '../types/admin';

interface VietnamMapProps {
  provinces: ProvinceCollection;
  selectedProvinceCode?: string | null;
  onSelectProvince: (payload: {
    province: ProvinceFeatureProperties;
    lat: number;
    lon: number;
  }) => void;
  onSelectLocation?: (payload: {
    province: ProvinceFeatureProperties | null;
    lat: number;
    lon: number;
  }) => void;
  overlayAction?: ReactNode;
  clickHint?: string;
}

const PROVINCE_DEFAULT = '#86c8c3';
const PROVINCE_SELECTED = '#e25f3f';
const PROVINCE_BORDER = '#ffffff';
const PROVINCE_LABEL = '#17202a';
const PROVINCE_LABEL_HALO = 'rgba(255, 255, 255, 0.94)';
const OPENMAP_STYLE_URL = 'https://maptiles.openmap.vn/styles/day-v1/style.json';
const PROVINCE_SOURCE_ID = 'province-polygons';
const PROVINCE_LABEL_SOURCE_ID = 'province-label-points';
const PROVINCE_FILL_LAYER_ID = 'province-polygons-fill';
const PROVINCE_LINE_LAYER_ID = 'province-polygons-line';
const PROVINCE_LABEL_LAYER_ID = 'province-polygons-label';

type ProvinceLabelCollection = GeoJSON.FeatureCollection<GeoJSON.Point, ProvinceFeatureProperties>;
type PolygonCoordinates = GeoJSON.Position[][];

function getRingArea(ring: GeoJSON.Position[]) {
  let area = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

function getPolygonArea(coordinates: PolygonCoordinates) {
  return getRingArea(coordinates[0] ?? []);
}

function getPrimaryPolygonCoordinates(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): PolygonCoordinates {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates;
  }

  return geometry.coordinates.reduce((largest, current) =>
    getPolygonArea(current) > getPolygonArea(largest) ? current : largest
  );
}

function getProvinceLabelPosition(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] {
  const primaryPolygon = getPrimaryPolygonCoordinates(geometry);
  const outerRing = primaryPolygon[0] ?? [];

  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lon, lat] of outerRing) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

function buildOpenMapStyleUrl(apiKey: string) {
  const url = new URL(OPENMAP_STYLE_URL);
  url.searchParams.set('apikey', apiKey);
  return url.toString();
}

function createProvinceFillColorExpression(selectedProvinceCode?: string | null) {
  return [
    'case',
    ['==', ['get', 'province_code'], selectedProvinceCode ?? ''],
    PROVINCE_SELECTED,
    PROVINCE_DEFAULT
  ] as unknown as Parameters<OpenMapMap['setPaintProperty']>[2];
}

function createProvinceLabelCollection(provinces: ProvinceCollection): ProvinceLabelCollection {
  return {
    type: 'FeatureCollection',
    features: provinces.features.map((feature) => {
      const [lon, lat] = getProvinceLabelPosition(feature.geometry);

      return {
        type: 'Feature',
        properties: feature.properties,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat]
        }
      };
    })
  };
}


function addOrUpdateProvinceLayers(
  map: OpenMapMap,
  provinces: ProvinceCollection,
  selectedProvinceCode?: string | null
) {
  const source = map.getSource(PROVINCE_SOURCE_ID) as GeoJSONSource | undefined;
  const labelSource = map.getSource(PROVINCE_LABEL_SOURCE_ID) as GeoJSONSource | undefined;
  const featureCollection = provinces as GeoJSON.FeatureCollection;
  const labelCollection = createProvinceLabelCollection(provinces);

  if (!source) {
    map.addSource(PROVINCE_SOURCE_ID, {
      type: 'geojson',
      data: featureCollection
    });

    map.addSource(PROVINCE_LABEL_SOURCE_ID, {
      type: 'geojson',
      data: labelCollection
    });

    map.addLayer({
      id: PROVINCE_FILL_LAYER_ID,
      type: 'fill',
      source: PROVINCE_SOURCE_ID,
      paint: {
        'fill-color': createProvinceFillColorExpression(selectedProvinceCode),
        'fill-opacity': 0.55
      }
    });

    map.addLayer({
      id: PROVINCE_LINE_LAYER_ID,
      type: 'line',
      source: PROVINCE_SOURCE_ID,
      paint: {
        'line-color': PROVINCE_BORDER,
        'line-width': 1.5
      }
    });

    map.addLayer({
      id: PROVINCE_LABEL_LAYER_ID,
      type: 'symbol',
      source: PROVINCE_LABEL_SOURCE_ID,
      layout: {
        'text-field': ['get', 'province_name'],
        'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 11.5,
        'text-max-width': 8,
        'text-justify': 'center',
        'text-anchor': 'center',
        'text-allow-overlap': true
      },
      paint: {
        'text-color': PROVINCE_LABEL,
        'text-halo-color': PROVINCE_LABEL_HALO,
        'text-halo-width': 1.4
      }
    });

    return;
  }

  source.setData(featureCollection);
  labelSource?.setData(labelCollection);

  if (map.getLayer(PROVINCE_FILL_LAYER_ID)) {
    map.setPaintProperty(
      PROVINCE_FILL_LAYER_ID,
      'fill-color',
      createProvinceFillColorExpression(selectedProvinceCode)
    );
  }
}

function OpenMapVietnamMap({
  provinces,
  selectedProvinceCode,
  onSelectProvince,
  onSelectLocation,
  overlayAction,
  clickHint
}: VietnamMapProps) {
  const mapRef = useRef<OpenMapMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const onSelectProvinceRef = useRef(onSelectProvince);
  const onSelectLocationRef = useRef(onSelectLocation);
  const openMapApiKey = import.meta.env.VITE_OPENMAP_API_KEY?.trim();

  useEffect(() => {
    onSelectProvinceRef.current = onSelectProvince;
  }, [onSelectProvince]);

  useEffect(() => {
    onSelectLocationRef.current = onSelectLocation;
  }, [onSelectLocation]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !openMapApiKey) return;

    const map = new OpenMapMap({
      container: mapContainerRef.current,
      style: buildOpenMapStyleUrl(openMapApiKey),
      center: [107.5, 16.7],
      zoom: 6,
      maplibreLogo: true
    });

    map.addControl(new NavigationControl(), 'top-right');

    const syncProvinceLayers = () => {
      addOrUpdateProvinceLayers(map, provinces, selectedProvinceCode);
      map.getCanvas().style.cursor = 'crosshair';
    };

    const handleProvinceClick = (event: MapLayerMouseEvent) => {
      const province = event.features?.[0]?.properties as ProvinceFeatureProperties | undefined;
      if (!province) {
        return;
      }

      onSelectProvinceRef.current({
        province,
        lat: Number(event.lngLat.lat.toFixed(6)),
        lon: Number(event.lngLat.lng.toFixed(6))
      });
    };

    const handleMapClick = (event: MapLayerMouseEvent) => {
      const province = (
        map.queryRenderedFeatures(event.point, { layers: [PROVINCE_FILL_LAYER_ID] })?.[0]?.properties ?? null
      ) as ProvinceFeatureProperties | null;

      onSelectLocationRef.current?.({
        province,
        lat: Number(event.lngLat.lat.toFixed(6)),
        lon: Number(event.lngLat.lng.toFixed(6))
      });
    };

    map.on('load', syncProvinceLayers);
    map.on('click', PROVINCE_FILL_LAYER_ID, handleProvinceClick);
    map.on('click', handleMapClick);

    mapRef.current = map;

    return () => {
      map.off('load', syncProvinceLayers);
      map.off('click', PROVINCE_FILL_LAYER_ID, handleProvinceClick);
      map.off('click', handleMapClick);
      map.remove();
      mapRef.current = null;
    };
  }, [openMapApiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    addOrUpdateProvinceLayers(map, provinces, selectedProvinceCode);
  }, [provinces, selectedProvinceCode]);

  return (
    <div className="map-shell relative overflow-hidden rounded-lg border border-slate-200 shadow-panel">
      <div className="absolute left-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-col gap-2 sm:left-4 sm:top-4">
        {overlayAction}
        <div className="rounded-lg border border-slate-200 bg-white/92 px-3.5 py-2 text-xs font-medium text-ink/68 shadow-soft backdrop-blur">
          {clickHint ?? 'Chọn một điểm trên bản đồ để tra cứu'}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/50 backdrop-blur sm:bottom-4 sm:left-4">
        Bản đồ số
      </div>
      <div ref={mapContainerRef} className="h-[560px] w-full min-h-[520px]" />
    </div>
  );
}

function LeafletFallbackMap({ provinces, selectedProvinceCode, onSelectProvince }: VietnamMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [16.7, 107.5],
      zoom: 6,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    map.getContainer().style.cursor = 'crosshair';
    labelLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove();
    }

    labelLayerRef.current?.clearLayers();

    const layer = L.geoJSON(provinces as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const code = feature?.properties?.province_code;
        const isSelected = code === selectedProvinceCode;
        return {
          fillColor: isSelected ? PROVINCE_SELECTED : PROVINCE_DEFAULT,
          fillOpacity: 0.55,
          color: PROVINCE_BORDER,
          weight: 1.5,
          cursor: 'crosshair'
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const province = feature.properties as ProvinceFeatureProperties;

        featureLayer.on('click', (event: L.LeafletMouseEvent) => {
          onSelectProvince({
            province,
            lat: Number(event.latlng.lat.toFixed(6)),
            lon: Number(event.latlng.lng.toFixed(6))
          });
        });

        const [lon, lat] = getProvinceLabelPosition(feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
        const labelIcon = L.divIcon({
          className: 'province-map-label',
          html: `<span>${province.province_name}</span>`
        });

        L.marker([lat, lon], {
          icon: labelIcon,
          interactive: false
        }).addTo(labelLayerRef.current!);
      }
    });

    layer.addTo(map);
    geoJsonLayerRef.current = layer;
  }, [provinces, selectedProvinceCode, onSelectProvince]);

  return (
    <div className="map-shell relative overflow-hidden rounded-lg border border-slate-200 shadow-panel">
      <div className="absolute left-3 top-3 z-[1000] rounded-lg border border-slate-200 bg-white/92 px-3.5 py-2 text-xs font-medium text-ink/68 shadow-soft backdrop-blur sm:left-4 sm:top-4">
        Chọn một điểm trên bản đồ để tra cứu
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/50 backdrop-blur sm:bottom-4 sm:left-4">
        Bản đồ nền
      </div>
      <style>{`
        .province-map-label {
          background: transparent;
          border: 0;
        }

        .province-map-label span {
          display: block;
          min-width: 72px;
          transform: translate(-50%, -50%);
          color: ${PROVINCE_LABEL};
          font-size: 11px;
          font-weight: 700;
          line-height: 1.15;
          text-align: center;
          text-shadow:
            0 0 2px ${PROVINCE_LABEL_HALO},
            0 0 6px ${PROVINCE_LABEL_HALO};
          white-space: normal;
        }
      `}</style>
      <div ref={mapContainerRef} className="h-[560px] w-full min-h-[520px]" />
    </div>
  );
}

export function VietnamMap(props: VietnamMapProps) {
  if (import.meta.env.VITE_OPENMAP_API_KEY?.trim()) {
    return <OpenMapVietnamMap {...props} />;
  }

  return <LeafletFallbackMap {...props} />;
}
