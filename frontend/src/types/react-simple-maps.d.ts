declare module 'react-simple-maps' {
  import type { Feature, FeatureCollection, Geometry } from 'geojson';
  import type { ComponentType, CSSProperties, MouseEventHandler, ReactNode } from 'react';

  interface GeographyShape extends Feature<Geometry, Record<string, unknown>> {
    rsmKey: string;
  }

  interface GeographyStyle {
    default?: CSSProperties;
    hover?: CSSProperties;
    pressed?: CSSProperties;
  }

  export const ComposableMap: ComponentType<{
    children?: ReactNode;
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    className?: string;
    width?: number;
    height?: number;
  }>;

  export const Geographies: ComponentType<{
    geography: string | FeatureCollection;
    children: (props: { geographies: GeographyShape[] }) => ReactNode;
  }>;

  export const Geography: ComponentType<{
    geography: GeographyShape;
    onMouseEnter?: MouseEventHandler<SVGPathElement>;
    onMouseLeave?: MouseEventHandler<SVGPathElement>;
    onClick?: MouseEventHandler<SVGPathElement>;
    style?: GeographyStyle;
  }>;
}
