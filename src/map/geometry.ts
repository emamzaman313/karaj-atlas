import type { Geometry } from 'geojson';
export type LngLat = [number, number];
export function geometryCoordinates(geometry: Geometry | null): LngLat[] {
  const points: LngLat[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1])) points.push([value[0], value[1]]);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  if (geometry && 'coordinates' in geometry) visit(geometry.coordinates);
  return points;
}
export function geometryCenter(geometry: Geometry | null): LngLat | null {
  const points = geometryCoordinates(geometry);
  if (!points.length) return null;
  return [points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];
}
export function geometryBounds(geometry: Geometry | null): [[number,number],[number,number]] | null {
  const points=geometryCoordinates(geometry); if(!points.length)return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return [[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]];
}
