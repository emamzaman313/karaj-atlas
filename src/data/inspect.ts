import type { FeatureCollection, Geometry } from 'geojson';
export type AtlasDataReport = {
  total:number; points:number; lines:number; polygons:number; named:number;
  buildings:number; roads:number; poi:number; bbox:[number,number,number,number]|null;
  invalidCoordinates:number;
};
export function inspectGeoJSON(data:FeatureCollection<Geometry,Record<string,unknown>>):AtlasDataReport {
  const report:AtlasDataReport={total:data.features.length,points:0,lines:0,polygons:0,named:0,buildings:0,roads:0,poi:0,bbox:null,invalidCoordinates:0};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const visit=(v:unknown):void=>{
    if(Array.isArray(v)&&typeof v[0]==='number'&&typeof v[1]==='number'){
      const [x,y]=v;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x < -180||x>180||y < -90||y>90){report.invalidCoordinates++;return;}
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    } else if(Array.isArray(v))v.forEach(visit);
  };
  for(const feature of data.features){
    const g=feature.geometry, p=feature.properties||{};
    if(!g){report.invalidCoordinates++;continue;}
    if(g.type==='Point'||g.type==='MultiPoint')report.points++;
    else if(g.type==='LineString'||g.type==='MultiLineString')report.lines++;
    else report.polygons++;
    visit('coordinates'in g?g.coordinates:null);
    if(p.name||p['name:fa']||p['name:en'])report.named++;
    if(p.building||p['building:part'])report.buildings++;
    if(p.highway)report.roads++;
    if(['amenity','shop','tourism','historic','leisure','healthcare'].some(k=>p[k]))report.poi++;
  }
  if(Number.isFinite(minX))report.bbox=[minX,minY,maxX,maxY];
  return report;
}
