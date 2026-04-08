import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ProvinceCollection, ProvinceFeatureProperties } from '../types/admin';
import { ProvinceTooltip } from './ProvinceTooltip';
import { useState } from 'react';

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

export function VietnamMap({ provinces, selectedProvinceCode, onSelectProvince }: VietnamMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const [hoveredProvince, setHoveredProvince] = useState<ProvinceFeatureProperties | null>(null);

  // Initialize the map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [16.7, 107.5],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add/update province GeoJSON layer whenever provinces or selection changes
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
          weight: 1.5,
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const province = feature.properties as ProvinceFeatureProperties;

        featureLayer.on('mouseover', () => {
          (featureLayer as L.Path).setStyle({
            fillColor: PROVINCE_HOVER,
            fillOpacity: 0.75,
          });
          setHoveredProvince(province);
        });

        featureLayer.on('mouseout', () => {
          const isSelected = province.province_code === selectedProvinceCode;
          (featureLayer as L.Path).setStyle({
            fillColor: isSelected ? PROVINCE_SELECTED : PROVINCE_DEFAULT,
            fillOpacity: 0.55,
          });
          setHoveredProvince(null);
        });

        featureLayer.on('click', (e: L.LeafletMouseEvent) => {
          onSelectProvince({
            province,
            lat: Number(e.latlng.lat.toFixed(6)),
            lon: Number(e.latlng.lng.toFixed(6)),
          });
        });
      },
    });

    layer.addTo(map);
    geoJsonLayerRef.current = layer;
  }, [provinces, selectedProvinceCode, onSelectProvince]);

  return (
    <div className="map-shell relative overflow-hidden rounded-[2rem] border border-white/70 shadow-panel">
      <div className="absolute left-4 top-4 z-[1000] rounded-full bg-white/85 px-4 py-2 text-xs uppercase tracking-[0.18em] text-ink/65 backdrop-blur">
        Bấm vào bản đồ để lấy `lat`, `lon`
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
