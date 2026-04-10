import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoJSONSource, Map as OpenMapMap, NavigationControl, type MapLayerMouseEvent } from '@openmapvn/openmapvn-gl';
import '@openmapvn/openmapvn-gl/dist/maplibre-gl.css';
import 'leaflet/dist/leaflet.css';
import type { ProvinceCollection, ProvinceFeatureProperties } from '../types/admin';
import { ProvinceTooltip } from './ProvinceTooltip';

interface VietnamMapProps {
  provinces: ProvinceCollection;
  selectedProvinceCode?: string | null;
  onSelectProvince: (payload: {
    province: ProvinceFeatureProperties;
    lat: number;
    lon: number;
  }) => void;
}

const PROVINCE_DEFAULT = '#9fc7c7';
const PROVINCE_HOVER = '#0f6d70';
const PROVINCE_SELECTED = '#dc7f5f';
const PROVINCE_BORDER = '#fdfaf4';
const OPENMAP_STYLE_URL = 'https://maptiles.openmap.vn/styles/day-v1/style.json';
const PROVINCE_SOURCE_ID = 'province-polygons';
const PROVINCE_FILL_LAYER_ID = 'province-polygons-fill';
const PROVINCE_LINE_LAYER_ID = 'province-polygons-line';

function buildOpenMapStyleUrl(apiKey: string) {
  const url = new URL(OPENMAP_STYLE_URL);
  url.searchParams.set('apikey', apiKey);
  return url.toString();
}

function createProvinceFillColorExpression(selectedProvinceCode?: string | null, hoveredProvinceCode?: string | null) {
  return [
    'case',
    ['==', ['get', 'province_code'], selectedProvinceCode ?? ''],
    PROVINCE_SELECTED,
    ['==', ['get', 'province_code'], hoveredProvinceCode ?? ''],
    PROVINCE_HOVER,
    PROVINCE_DEFAULT
  ] as unknown as Parameters<OpenMapMap['setPaintProperty']>[2];
}

function addOrUpdateProvinceLayers(
  map: OpenMapMap,
  provinces: ProvinceCollection,
  selectedProvinceCode?: string | null,
  hoveredProvinceCode?: string | null
) {
  const source = map.getSource(PROVINCE_SOURCE_ID) as GeoJSONSource | undefined;
  const featureCollection = provinces as GeoJSON.FeatureCollection;

  if (!source) {
    map.addSource(PROVINCE_SOURCE_ID, {
      type: 'geojson',
      data: featureCollection
    });

    map.addLayer({
      id: PROVINCE_FILL_LAYER_ID,
      type: 'fill',
      source: PROVINCE_SOURCE_ID,
      paint: {
        'fill-color': createProvinceFillColorExpression(selectedProvinceCode, hoveredProvinceCode),
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

    return;
  }

  source.setData(featureCollection);

  if (map.getLayer(PROVINCE_FILL_LAYER_ID)) {
    map.setPaintProperty(
      PROVINCE_FILL_LAYER_ID,
      'fill-color',
      createProvinceFillColorExpression(selectedProvinceCode, hoveredProvinceCode)
    );
  }
}

function OpenMapVietnamMap({ provinces, selectedProvinceCode, onSelectProvince }: VietnamMapProps) {
  const mapRef = useRef<OpenMapMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const onSelectProvinceRef = useRef(onSelectProvince);
  const [hoveredProvince, setHoveredProvince] = useState<ProvinceFeatureProperties | null>(null);
  const openMapApiKey = import.meta.env.VITE_OPENMAP_API_KEY?.trim();

  useEffect(() => {
    onSelectProvinceRef.current = onSelectProvince;
  }, [onSelectProvince]);

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
      addOrUpdateProvinceLayers(map, provinces, selectedProvinceCode, hoveredProvince?.province_code);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseMove = (event: MapLayerMouseEvent) => {
      const province = event.features?.[0]?.properties as ProvinceFeatureProperties | undefined;
      setHoveredProvince(province ?? null);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      setHoveredProvince(null);
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

    map.on('load', syncProvinceLayers);
    map.on('mouseenter', PROVINCE_FILL_LAYER_ID, handleMouseEnter);
    map.on('mousemove', PROVINCE_FILL_LAYER_ID, handleMouseMove);
    map.on('mouseleave', PROVINCE_FILL_LAYER_ID, handleMouseLeave);
    map.on('click', PROVINCE_FILL_LAYER_ID, handleProvinceClick);

    mapRef.current = map;

    return () => {
      map.off('load', syncProvinceLayers);
      map.off('mouseenter', PROVINCE_FILL_LAYER_ID, handleMouseEnter);
      map.off('mousemove', PROVINCE_FILL_LAYER_ID, handleMouseMove);
      map.off('mouseleave', PROVINCE_FILL_LAYER_ID, handleMouseLeave);
      map.off('click', PROVINCE_FILL_LAYER_ID, handleProvinceClick);
      map.remove();
      mapRef.current = null;
    };
  }, [openMapApiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    addOrUpdateProvinceLayers(map, provinces, selectedProvinceCode, hoveredProvince?.province_code);
  }, [provinces, selectedProvinceCode, hoveredProvince?.province_code]);

  return (
    <div className="map-shell relative overflow-hidden rounded-[2rem] border border-white/70 shadow-panel">
      <div className="absolute left-4 top-4 z-[1000] rounded-full bg-white/85 px-4 py-2 text-xs uppercase tracking-[0.18em] text-ink/65 backdrop-blur">
        Bấm vào bản đồ để lấy `lat`, `lon`
      </div>
      <div className="absolute bottom-4 left-4 z-[1000] rounded-full bg-white/85 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-ink/55 backdrop-blur">
        OpenMap
      </div>
      {hoveredProvince ? (
        <div className="absolute right-4 top-4 z-[1000]">
          <ProvinceTooltip
            provinceName={hoveredProvince.province_name}
            provinceCode={hoveredProvince.province_code}
          />
        </div>
      ) : null}
      <div ref={mapContainerRef} className="h-[520px] w-full" />
    </div>
  );
}

function LeafletFallbackMap({ provinces, selectedProvinceCode, onSelectProvince }: VietnamMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const [hoveredProvince, setHoveredProvince] = useState<ProvinceFeatureProperties | null>(null);

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

    const layer = L.geoJSON(provinces as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const code = feature?.properties?.province_code;
        const isSelected = code === selectedProvinceCode;
        return {
          fillColor: isSelected ? PROVINCE_SELECTED : PROVINCE_DEFAULT,
          fillOpacity: 0.55,
          color: PROVINCE_BORDER,
          weight: 1.5
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const province = feature.properties as ProvinceFeatureProperties;

        featureLayer.on('mouseover', () => {
          (featureLayer as L.Path).setStyle({
            fillColor: PROVINCE_HOVER,
            fillOpacity: 0.75
          });
          setHoveredProvince(province);
        });

        featureLayer.on('mouseout', () => {
          const isSelected = province.province_code === selectedProvinceCode;
          (featureLayer as L.Path).setStyle({
            fillColor: isSelected ? PROVINCE_SELECTED : PROVINCE_DEFAULT,
            fillOpacity: 0.55
          });
          setHoveredProvince(null);
        });

        featureLayer.on('click', (event: L.LeafletMouseEvent) => {
          onSelectProvince({
            province,
            lat: Number(event.latlng.lat.toFixed(6)),
            lon: Number(event.latlng.lng.toFixed(6))
          });
        });
      }
    });

    layer.addTo(map);
    geoJsonLayerRef.current = layer;
  }, [provinces, selectedProvinceCode, onSelectProvince]);

  return (
    <div className="map-shell relative overflow-hidden rounded-[2rem] border border-white/70 shadow-panel">
      <div className="absolute left-4 top-4 z-[1000] rounded-full bg-white/85 px-4 py-2 text-xs uppercase tracking-[0.18em] text-ink/65 backdrop-blur">
        Bấm vào bản đồ để lấy `lat`, `lon`
      </div>
      <div className="absolute bottom-4 left-4 z-[1000] rounded-full bg-white/85 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-ink/55 backdrop-blur">
        OpenStreetMap fallback
      </div>
      {hoveredProvince ? (
        <div className="absolute right-4 top-4 z-[1000]">
          <ProvinceTooltip
            provinceName={hoveredProvince.province_name}
            provinceCode={hoveredProvince.province_code}
          />
        </div>
      ) : null}
      <div ref={mapContainerRef} className="h-[520px] w-full" />
    </div>
  );
}

export function VietnamMap(props: VietnamMapProps) {
  if (import.meta.env.VITE_OPENMAP_API_KEY?.trim()) {
    return <OpenMapVietnamMap {...props} />;
  }

  return <LeafletFallbackMap {...props} />;
}
