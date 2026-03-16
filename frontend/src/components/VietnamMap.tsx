import { geoMercator } from 'd3-geo';
import { MouseEvent, useMemo, useState } from 'react';
import { Geographies, Geography, ComposableMap } from 'react-simple-maps';
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

const MAP_WIDTH = 960;
const MAP_HEIGHT = 640;

export function VietnamMap({ provinces, selectedProvinceCode, onSelectProvince }: VietnamMapProps) {
  const [hoveredProvince, setHoveredProvince] = useState<ProvinceFeatureProperties | null>(null);
  const projection = useMemo(
    () =>
      geoMercator()
        .center([107.5, 16.7])
        .scale(2900)
        .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]),
    []
  );

  const getCoordinatesFromClick = (event: MouseEvent<SVGPathElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) {
      return null;
    }

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const viewWidth = viewBox?.width || svg.clientWidth;
    const viewHeight = viewBox?.height || svg.clientHeight;

    const x = ((event.clientX - rect.left) / rect.width) * viewWidth;
    const y = ((event.clientY - rect.top) / rect.height) * viewHeight;
    if (!projection.invert) {
      return null;
    }

    const inverted = projection.invert([x, y]);

    if (!inverted) {
      return null;
    }

    return {
      lon: Number(inverted[0].toFixed(6)),
      lat: Number(inverted[1].toFixed(6))
    };
  };

  return (
    <div className="map-shell relative overflow-hidden rounded-[2rem] border border-white/70 p-4 shadow-panel">
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/85 px-4 py-2 text-xs uppercase tracking-[0.18em] text-ink/65 backdrop-blur">
        Bấm vào bản đồ để lấy `lat`, `lon`
      </div>
      {hoveredProvince ? (
        <div className="absolute right-4 top-4 z-10">
          <ProvinceTooltip
            provinceName={hoveredProvince.province_name}
            provinceCode={hoveredProvince.province_code}
          />
        </div>
      ) : null}
      <ComposableMap
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        projection="geoMercator"
        projectionConfig={{ center: [107.5, 16.7], scale: 2900 }}
        className="h-[520px] w-full"
      >
        <Geographies geography={provinces}>
          {({ geographies }) =>
            geographies.map((geography) => {
              const province = geography.properties as unknown as ProvinceFeatureProperties;
              const isSelected = selectedProvinceCode === province.province_code;
              const isHovered = hoveredProvince?.province_code === province.province_code;

              return (
                <Geography
                  key={geography.rsmKey}
                  geography={geography}
                  onMouseEnter={() => setHoveredProvince(province)}
                  onMouseLeave={() => setHoveredProvince(null)}
                  onClick={(event) => {
                    const clickedCoordinates = getCoordinatesFromClick(event);
                    if (!clickedCoordinates) {
                      return;
                    }

                    onSelectProvince({
                      province,
                      ...clickedCoordinates
                    });
                  }}
                  style={{
                    default: {
                      fill: isSelected ? '#dc7f5f' : isHovered ? '#0f6d70' : '#9fc7c7',
                      stroke: '#fdfaf4',
                      strokeWidth: 1.2,
                      outline: 'none',
                      cursor: 'pointer'
                    },
                    hover: {
                      fill: '#0f6d70',
                      stroke: '#fdfaf4',
                      strokeWidth: 1.2,
                      outline: 'none',
                      cursor: 'pointer'
                    },
                    pressed: {
                      fill: '#102430',
                      stroke: '#fdfaf4',
                      strokeWidth: 1.2,
                      outline: 'none'
                    }
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
