import type { Geometry } from 'geojson';
export type LngLat = [number, number];
function visitCoordinates(geometry: Geometry | null, visit: (lng: number, lat: number) => void): void {
  const walk = (value: unknown): void => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      if (Number.isFinite(value[0]) && Number.isFinite(value[1])) visit(value[0], value[1]);
    } else if (Array.isArray(value)) value.forEach(walk);
  };
  if (geometry && 'coordinates' in geometry) walk(geometry.coordinates);
}
export function geometryCoordinates(geometry: Geometry | null): LngLat[] {
  const points: LngLat[] = [];
  visitCoordinates(geometry, (lng, lat) => points.push([lng, lat]));
  return points;
}
export function geometryCenter(geometry: Geometry | null): LngLat | null {
  let lngTotal = 0, latTotal = 0, count = 0;
  visitCoordinates(geometry, (lng, lat) => { lngTotal += lng; latTotal += lat; count++; });
  return count ? [lngTotal / count, latTotal / count] : null;
}
export function geometryBounds(geometry: Geometry | null): [[number,number],[number,number]] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  visitCoordinates(geometry, (lng, lat) => { minLng=Math.min(minLng,lng); minLat=Math.min(minLat,lat); maxLng=Math.max(maxLng,lng); maxLat=Math.max(maxLat,lat); });
  return Number.isFinite(minLng) ? [[minLng,minLat],[maxLng,maxLat]] : null;
}
