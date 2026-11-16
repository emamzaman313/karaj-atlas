import type {FeatureCollection,Geometry} from 'geojson';
export type AtlasCollection=FeatureCollection<Geometry,Record<string,unknown>>;
export type DataSourceKind='remote'|'local-file'|'indexeddb'|'pmtiles';
export type DataSourceStatus={kind:DataSourceKind;label:string;available:boolean;detail:string};
export const DATA_SOURCE_LABELS:Record<DataSourceKind,string>={remote:'کاشی آنلاین OSM', 'local-file':'GeoJSON محلی','indexeddb':'ذخیره مرورگر','pmtiles':'آرشیو PMTiles'};
export async function fetchGeoJSON(url:string,signal?:AbortSignal):Promise<AtlasCollection>{
 const response=await fetch(url,{signal,cache:'no-store'});
 if(!response.ok)throw new Error(`HTTP ${response.status} هنگام دریافت GeoJSON`);
 const data=await response.json() as AtlasCollection;
 if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('GeoJSON ساختار FeatureCollection ندارد');
 return data;
}
export function humanBytes(bytes:number):string{
 if(bytes<1024)return `${bytes} B`;const units=['KB','MB','GB','TB'];let value=bytes/1024,index=0;
 while(value>=1024&&index<units.length-1){value/=1024;index++;}
 return `${value.toLocaleString('fa-IR',{maximumFractionDigits:1})} ${units[index]}`;
}
export function featureCount(data:AtlasCollection):number{return data.features.length;}
