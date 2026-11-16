import type {FeatureCollection,Geometry} from 'geojson';
export type AtlasData=FeatureCollection<Geometry,Record<string,unknown>>;
export type ImportOptions={maxFeatures?:number;onProgress?:(done:number,total:number)=>void};
export type ImportReport={accepted:number;skipped:number;duplicateIds:number;invalidGeometry:number;missingProperties:number};
const validCoord=(v:unknown):boolean=>Array.isArray(v)&&typeof v[0]==='number'&&typeof v[1]==='number'&&Number.isFinite(v[0])&&Number.isFinite(v[1])&&v[0]>=-180&&v[0]<=180&&v[1]>=-90&&v[1]<=90;
function geometryValid(g:Geometry|null):boolean{
 if(!g)return false;
 const visit=(v:unknown):boolean=>Array.isArray(v)&&typeof v[0]==='number'&&typeof v[1]==='number'?validCoord(v):Array.isArray(v)&&v.every(visit);
 return 'coordinates'in g&&visit(g.coordinates);
}
export function sanitizeGeoJSON(input:AtlasData,options:ImportOptions={}):{data:AtlasData;report:ImportReport}{
 const report:ImportReport={accepted:0,skipped:0,duplicateIds:0,invalidGeometry:0,missingProperties:0};
 const seen=new Set<string>(),max=Math.max(1,options.maxFeatures??2_000_000);
 const features=[];
 for(let i=0;i<input.features.length&&features.length<max;i++){
  const feature=input.features[i];if(!feature){report.skipped++;continue;}
  if(!geometryValid(feature.geometry)){report.invalidGeometry++;report.skipped++;continue;}
  const id=feature.id===undefined?null:String(feature.id);
  if(id&&seen.has(id)){report.duplicateIds++;report.skipped++;continue;}if(id)seen.add(id);
  if(!feature.properties||!Object.keys(feature.properties).length)report.missingProperties++;
  features.push({type:'Feature' as const,id:feature.id,geometry:feature.geometry,properties:feature.properties||{}});
  report.accepted++;if(i%1000===0)options.onProgress?.(i,input.features.length);
 }
 options.onProgress?.(input.features.length,input.features.length);
 return {data:{type:'FeatureCollection',features},report};
}
export function estimateGeoJSONBytes(data:AtlasData):number{return new TextEncoder().encode(JSON.stringify(data)).byteLength;}
