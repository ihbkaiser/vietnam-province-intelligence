"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProvinceFeatureProperties } from "../vietgeo/VietnamMap";

type Point = { lon: number; lat: number };

type ProvinceFeature = {
  type: "Feature";
  properties: ProvinceFeatureProperties;
  geometry?: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null;
};

type ProvinceCollection = { type: "FeatureCollection"; features: ProvinceFeature[] };

/** Module-level cache so the 318KB GeoJSON is fetched once per browser session. */
let cachedCollection: ProvinceCollection | null = null;
let cachedPromise: Promise<ProvinceCollection | null> | null = null;

async function loadCollection(): Promise<ProvinceCollection | null> {
  if (cachedCollection) return cachedCollection;
  if (!cachedPromise) {
    cachedPromise = fetch("/api/vietgeo/provinces")
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as ProvinceCollection;
        if (!payload?.features?.length) return null;
        cachedCollection = payload;
        return payload;
      })
      .catch(() => null);
  }
  return cachedPromise;
}

/** Douglas–Peucker simplification to keep the SVG light but faithful. */
function simplifyRing(ring: Point[], tolerance = 0.004): Point[] {
  if (ring.length < 4) return ring;
  const squared = tolerance * tolerance;
  function perpendicularSq(p: Point, a: Point, b: Point): number {
    const dx = b.lon - a.lon;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return (p.lon - a.lon) ** 2 + (p.lat - a.lat) ** 2;
    let t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const x = a.lon + t * dx - p.lon;
    const y = a.lat + t * dy - p.lat;
    return x * x + y * y;
  }
  function rdp(points: Point[]): Point[] {
    if (points.length < 3) return points;
    let maxD = 0;
    let index = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      const d = perpendicularSq(points[i], points[0], points[points.length - 1]);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (maxD > squared) {
      const left = rdp(points.slice(0, index + 1));
      const right = rdp(points.slice(index));
      return left.slice(0, -1).concat(right);
    }
    return [points[0], points[points.length - 1]];
  }
  return rdp(ring);
}

type Projector = (lon: number, lat: number) => { x: number; y: number };

function ringToPath(ring: Point[], proj: Projector): string {
  const pts = simplifyRing(ring).map(({ lon, lat }) => proj(lon, lat));
  if (!pts.length) return "";
  return pts
    .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ") + " Z";
}

function polygonCoordinates(geom: ProvinceFeature["geometry"]): Point[][] {
  if (!geom) return [];
  if (geom.type === "Polygon") return (geom.coordinates as number[][][]).map((ring) => ring.map(([lon, lat]) => ({ lon, lat })));
  return (geom.coordinates as number[][][][])
    .map((polygon) => polygon[0] as number[][])
    .map((ring) => ring.map(([lon, lat]) => ({ lon, lat })));
}

// Hoàng Sa & Trường Sa — approximate island-group positions (real coordinates).
const HOANG_SA: Point[] = [
  { lon: 111.15, lat: 16.8 },
  { lon: 111.35, lat: 16.68 },
  { lon: 111.5, lat: 16.55 },
  { lon: 111.72, lat: 16.9 },
  { lon: 111.98, lat: 16.72 },
  { lon: 112.2, lat: 16.58 },
  { lon: 112.42, lat: 16.83 }
];
const TRUONG_SA: Point[] = [
  { lon: 112.5, lat: 10.4 },
  { lon: 112.95, lat: 10.35 },
  { lon: 113.2, lat: 10.15 },
  { lon: 113.45, lat: 9.95 },
  { lon: 113.7, lat: 10.2 },
  { lon: 114.2, lat: 9.9 },
  { lon: 113.95, lat: 8.7 },
  { lon: 113.3, lat: 8.65 }
];

export function VietnamSilhouetteMap() {
  const [collection, setCollection] = useState<ProvinceCollection | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    void loadCollection().then((data) => setCollection(data));
  }, []);

  const rendered = useMemo(() => {
    if (!collection) return null;
    const features = collection.features.filter((f) => f.geometry);
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const feature of features) {
      for (const ring of polygonCoordinates(feature.geometry)) {
        for (const { lon, lat } of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    // Stretch bounds slightly so Hoàng Sa & Trường Sa islands sit to the east.
    minLon = Math.min(minLon, 110.9);
    maxLon = Math.max(maxLon, 114.4);
    minLat = Math.min(minLat, 8.4);
    maxLat = Math.max(maxLat, 23.5);
    const pad = 18;
    const width = 760;
    const spanLon = maxLon - minLon || 1;
    const spanLat = maxLat - minLat || 1;
    const height = Math.round(((width - pad * 2) * spanLat) / spanLon + pad * 2);
    // Equirectangular: equal degrees per pixel on both axes (flip-y for SVG).
    const proj: Projector = (lon, lat) => ({
      x: pad + ((lon - minLon) / spanLon) * (width - pad * 2),
      y: pad + ((maxLat - lat) / spanLat) * (height - pad * 2)
    });
    const paths = features.map((feature) => {
      const rings = polygonCoordinates(feature.geometry).map((ring) =>
        ringToPath(ring, proj)
      ).filter(Boolean);
      return {
        name: feature.properties.province_name,
        code: feature.properties.province_code,
        d: rings.join(" ")
      };
    });
    const islands = [
      { label: "Hoàng Sa", points: HOANG_SA, dx: 0, dy: -2 },
      { label: "Trường Sa", points: TRUONG_SA, dx: 8, dy: 6 }
    ].map(({ label, points, dx, dy }) => {
      const dots = points.map(({ lon, lat }) => proj(lon, lat));
      const cx = dots.reduce((sum, p) => sum + p.x, 0) / dots.length;
      const cy = dots.reduce((sum, p) => sum + p.y, 0) / dots.length;
      return { label, dots, cx: cx + dx, cy: cy + dy };
    });
    // Cô giáo áo dài dắt em học sinh — đứng ở Hà Nội (105.85°E, 21.4°N).
    const teacherPos = proj(105.85, 21.4);
    return { paths, islands, provinceCount: features.length, width, height, teacherPos };
  }, [collection]);

  return (
    <div className="vietnam-map-card">
      <div className="vietnam-map-layout">
      <div className="vietnam-map-wrap">
        {rendered ? (
          <svg viewBox={`0 0 ${rendered.width} ${rendered.height}`} className="vietnam-map" role="img" aria-label="Bản đồ Việt Nam với quần đảo Hoàng Sa và Trường Sa">
            <g>
              {rendered.paths.map((path) => (
                <path
                  key={path.code}
                  d={path.d}
                  className={`province ${hovered === path.code ? "hover" : ""}`}
                  onMouseEnter={() => setHovered(path.code)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>{path.name}</title>
                </path>
              ))}
            </g>
            {rendered.islands.map((island) => (
              <g key={island.label} className="island-group">
                {island.dots.map((dot, index) => (
                  <circle key={index} cx={dot.x} cy={dot.y} r={3.2} className="island" />
                ))}
                <text x={island.cx} y={island.cy} className="island-label">
                  {island.label}
                </text>
              </g>
            ))}
            {rendered && (
              <g className="vn-star" transform={`translate(${rendered.width - 56} 46) scale(1.7)`} aria-hidden="true">
                <polygon points="0,-12 2.70,-3.72 11.41,-3.71 4.37,1.42 7.05,9.71 0,4.6 -7.05,9.71 -4.37,1.42 -11.41,-3.71 -2.70,-3.72" />
              </g>
            )}
            {rendered.teacherPos && (
              <g className="teacher-duo" transform={`translate(${rendered.teacherPos.x - 46} ${rendered.teacherPos.y - 52})`}>
                {/* Cô giáo áo dài + nón lá */}
                <g className="teacher">
                  {/* bóng dưới chân */}
                  <ellipse cx="22" cy="70" rx="18" ry="4.5" fill="rgba(60,90,120,.18)" />
                  {/* nón lá */}
                  <path d="M10 26 L34 26 L29 34 L15 34 Z" fill="#e8d9a8" stroke="#c9b578" strokeWidth="0.6" />
                  <path d="M13 27 L31 27 L29.5 31 L14.5 31 Z" fill="#d9c68f" />
                  <line x1="22" y1="26" x2="22" y2="30" stroke="#a88f55" strokeWidth="0.7" />
                  {/* đầu */}
                  <circle cx="22" cy="21" r="5.5" fill="#f3c9a0" />
                  {/* tóc búi */}
                  <circle cx="22" cy="15.5" r="3.5" fill="#2c2c34" />
                  <path d="M18 19 Q22 13 26 19" fill="none" stroke="#2c2c34" strokeWidth="2" />
                  {/* áo dài xanh */}
                  <path d="M12 30 Q12 30 11 42 Q8 56 14 70 L20 70 L22 52 L24 70 L30 70 Q36 56 33 42 Q32 30 32 30 Q28 33 22 33 Q16 33 12 30 Z" fill="#2e7d8c" />
                  {/* cổ áo / họa tiết */}
                  <path d="M18 32 L22 37 L26 32" fill="none" stroke="#e8f0ef" strokeWidth="1" />
                  <path d="M14 44 Q18 46 22 45 Q26 46 30 44" fill="none" stroke="#bcd9d5" strokeWidth="1.2" />
                  {/* tay phải cầm sách */}
                  <path d="M31 38 Q36 44 34 52" fill="none" stroke="#f3c9a0" strokeWidth="3.2" strokeLinecap="round" />
                  <rect x="33" y="48" width="7" height="10" rx="1" fill="#f7efe0" stroke="#d8c9a8" strokeWidth="0.6" transform="rotate(18 36 53)" />
                  {/* tay trái dắt học sinh */}
                  <path d="M13 40 Q9 47 10 55" fill="none" stroke="#f3c9a0" strokeWidth="3.2" strokeLinecap="round" />
                </g>
                {/* Em học sinh nhỏ */}
                <g className="student" transform="translate(34 14)">
                  {/* bóng */}
                  <ellipse cx="22" cy="56" rx="13" ry="3.5" fill="rgba(60,90,120,.16)" />
                  {/* đầu */}
                  <circle cx="22" cy="17" r="5.5" fill="#f3c9a0" />
                  {/* tóc */}
                  <path d="M16 15 Q16 11 22 11 Q28 11 28 15 L27 13 Q22 9 17 13 Z" fill="#2c2c34" />
                  {/* mũ đồng phục đỏ */}
                  <path d="M16 14 Q22 9 28 14 L27.5 13 Q22 8 16.5 13 Z" fill="#d23b3b" />
                  {/* balo */}
                  <rect x="26" y="24" width="9" height="12" rx="3" fill="#d23b3b" stroke="#b02f2f" strokeWidth="0.6" />
                  <rect x="27.5" y="27" width="6" height="5" rx="1.5" fill="#f2b8b8" />
                  {/* áo trắng đồng phục */}
                  <path d="M13 22 Q16 25 22 25 Q28 25 31 22 L31 32 Q30 45 22 45 Q14 45 13 32 Z" fill="#fdfcf8" stroke="#e2ddd0" strokeWidth="0.6" />
                  {/* tay trái cô dắt */}
                  <path d="M31 26 Q33 32 29 36 Q24 38 20 39" fill="none" stroke="#f3c9a0" strokeWidth="3.2" strokeLinecap="round" />
                  {/* quần xanh */}
                  <path d="M15 44 L29 44 L28 56 L21 56 L20 49 L17 56 L15 56 Z" fill="#3a4f8c" />
                </g>
              </g>
            )}
          </svg>
        ) : (
          <div className="empty-panel">Đang tải bản đồ Việt Nam...</div>
        )}
      </div>
      <aside className="vn-art" aria-label="Tranh minh họa Việt Nam">
        <figure className="vn-art-frame">
          <img src="/vn-map-art.jpg" alt="Tranh minh họa Việt Nam – Em yêu Việt Nam" loading="lazy" />
          <figcaption>
            <span className="vn-art-title">Việt Nam thân yêu</span>
          </figcaption>
        </figure>
      </aside>
      </div>
      {hovered && (
        <div className="map-tooltip">
          {rendered?.paths.find((p) => p.code === hovered)?.name}
        </div>
      )}
      <div className="map-foot">
        <span>Bản đồ {rendered?.provinceCount ?? "--"} tỉnh/thành 2025 · Hoàng Sa · Trường Sa thuộc chủ quyền Việt Nam</span>
      </div>
    </div>
  );
}
