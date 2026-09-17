"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

export interface ProvinceFeatureProperties {
  province_id?: string;
  province_code: string;
  province_name: string;
  province_kind?: "province" | "city" | string;
}

export type ProvinceCollection = FeatureCollection<Polygon | MultiPolygon, ProvinceFeatureProperties>;

interface VietnamMapProps {
  provinces: ProvinceCollection;
  selectedProvinceCode?: string | null;
  onSelectProvince: (payload: { province: ProvinceFeatureProperties; lat: number; lon: number }) => void;
  onSelectLocation?: (payload: { province: ProvinceFeatureProperties | null; lat: number; lon: number }) => void;
  overlayAction?: ReactNode;
  clickHint?: string;
}

const PROVINCE_DEFAULT = "#86c8c3";
const PROVINCE_SELECTED = "#e25f3f";
const PROVINCE_BORDER = "#ffffff";
const PROVINCE_LABEL = "#17202a";
const PROVINCE_LABEL_HALO = "rgba(255,255,255,.95)";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletGeoJSON = import("leaflet").GeoJSON;
type LeafletLayerGroup = import("leaflet").LayerGroup;

type PolygonCoordinates = Position[][];

function getRingArea(ring: Position[]) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += Number(x1) * Number(y2) - Number(x2) * Number(y1);
  }
  return Math.abs(area) / 2;
}

function getPolygonArea(coordinates: PolygonCoordinates) {
  return getRingArea(coordinates[0] || []);
}

function getPrimaryPolygonCoordinates(geometry: Polygon | MultiPolygon): PolygonCoordinates {
  if (geometry.type === "Polygon") return geometry.coordinates;
  return geometry.coordinates.reduce((largest, current) =>
    getPolygonArea(current) > getPolygonArea(largest) ? current : largest
  );
}

function getProvinceLabelPosition(geometry: Polygon | MultiPolygon): [number, number] {
  const primaryPolygon = getPrimaryPolygonCoordinates(geometry);
  const outerRing = primaryPolygon[0] || [];
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lon, lat] of outerRing) {
    minLon = Math.min(minLon, Number(lon));
    maxLon = Math.max(maxLon, Number(lon));
    minLat = Math.min(minLat, Number(lat));
    maxLat = Math.max(maxLat, Number(lat));
  }

  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

export function VietnamMap({
  provinces,
  selectedProvinceCode,
  onSelectProvince,
  onSelectLocation,
  overlayAction,
  clickHint
}: VietnamMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const geoJsonLayerRef = useRef<LeafletGeoJSON | null>(null);
  const labelLayerRef = useRef<LeafletLayerGroup | null>(null);
  const onSelectProvinceRef = useRef(onSelectProvince);
  const onSelectLocationRef = useRef(onSelectLocation);

  useEffect(() => {
    onSelectProvinceRef.current = onSelectProvince;
  }, [onSelectProvince]);

  useEffect(() => {
    onSelectLocationRef.current = onSelectLocation;
  }, [onSelectLocation]);

  useEffect(() => {
    let disposed = false;

    async function mountMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (disposed || !mapContainerRef.current) return;
      leafletRef.current = L;

      const map = L.map(mapContainerRef.current, {
        center: [16.7, 107.5],
        zoom: 6,
        zoomControl: true,
        attributionControl: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      map.getContainer().style.cursor = "crosshair";
      labelLayerRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        onSelectLocationRef.current?.({
          province: null,
          lat: Number(event.latlng.lat.toFixed(6)),
          lon: Number(event.latlng.lng.toFixed(6))
        });
      });
      mapRef.current = map;
    }

    void mountMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !provinces.features.length) return;

    if (geoJsonLayerRef.current) geoJsonLayerRef.current.remove();
    labelLayerRef.current?.clearLayers();

    const layer = L.geoJSON(provinces as FeatureCollection, {
      style: (feature) => {
        const code = String(feature?.properties?.province_code || "");
        const selected = code === selectedProvinceCode;
        return {
          fillColor: selected ? PROVINCE_SELECTED : PROVINCE_DEFAULT,
          fillOpacity: selected ? 0.7 : 0.55,
          color: PROVINCE_BORDER,
          weight: selected ? 2.2 : 1.4
        };
      },
      onEachFeature: (feature, featureLayer) => {
        const province = feature.properties as ProvinceFeatureProperties;
        featureLayer.on("click", (event) => {
          event.originalEvent.stopPropagation();
          onSelectProvinceRef.current({
            province,
            lat: Number(event.latlng.lat.toFixed(6)),
            lon: Number(event.latlng.lng.toFixed(6))
          });
          onSelectLocationRef.current?.({
            province,
            lat: Number(event.latlng.lat.toFixed(6)),
            lon: Number(event.latlng.lng.toFixed(6))
          });
        });

        const [lon, lat] = getProvinceLabelPosition((feature as Feature<Polygon | MultiPolygon>).geometry);
        const labelIcon = L.divIcon({
          className: "province-map-label",
          html: `<span>${province.province_name}</span>`
        });
        L.marker([lat, lon], { icon: labelIcon, interactive: false }).addTo(labelLayerRef.current!);
      }
    }).addTo(map);

    geoJsonLayerRef.current = layer;
    try {
      map.fitBounds(layer.getBounds(), { padding: [22, 22] });
    } catch {
      // Keep default view if a malformed feature slips in.
    }
  }, [provinces, selectedProvinceCode]);

  return (
    <div className="vietgeo-map-shell">
      <div className="vietgeo-map-overlay">
        {overlayAction}
        <div className="vietgeo-map-hint">
          {clickHint || "Chọn tỉnh trên bản đồ hoặc bật tra cứu điểm để xem địa chỉ tại một vị trí"}
        </div>
      </div>
      <div className="vietgeo-map-badge">Bản đồ số</div>
      <div ref={mapContainerRef} className="vietgeo-map-canvas" />
    </div>
  );
}
