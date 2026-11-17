import type { Feature, FeatureCollection, Geometry } from 'geojson';

// Viewport for the requested corridor. This is a map focus area, not an
// administrative or surveyed neighborhood boundary.
export const MOTAHARI_VIEW = {
  west: 50.9665,
  south: 35.828,
  east: 51.003,
  north: 35.861,
  center: [50.98475, 35.8445] as [number, number],
  zoom: 14.05
};

export function isInMotahariView(feature: Feature<Geometry, Record<string, unknown>>): boolean {
  const [west, south, east, north] = [MOTAHARI_VIEW.west, MOTAHARI_VIEW.south, MOTAHARI_VIEW.east, MOTAHARI_VIEW.north];
  const coords: number[][] = [];
  const visitCoords = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') coords.push(value as number[]);
    else value.forEach(visitCoords);
  };
  const visitGeometry = (geometry: Geometry): void => {
    if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(visitGeometry);
    else visitCoords(geometry.coordinates);
  };
  visitGeometry(feature.geometry);
  return coords.some(([lng, lat]) => lng >= west && lng <= east && lat >= south && lat <= north);
}

export function motahariHighlightData(features: FeatureCollection<Geometry, Record<string, unknown>>): FeatureCollection<Geometry, Record<string, unknown>> {
  const matches = features.features.filter(feature => {
    const tags = feature.properties || {};
    return isInMotahariView(feature) && tags.leisure === 'park' && /بوستان خانواده|khanevadeh park/i.test(String(tags.name || tags['name:fa'] || tags['name:en'] || ''));
  });
  return { type: 'FeatureCollection', features: matches };
}
