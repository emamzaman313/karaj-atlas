import type {FeatureCollection,Geometry} from 'geojson';
export type AtlasFeatureCollection=FeatureCollection<Geometry,Record<string,unknown>>;
export type StorageInfo={name:string;bytes:number;updatedAt:number;features:number};
const DB_NAME='karaj-atlas-local',STORE='datasets',VERSION=1;
function openDB():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'name'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function saveDataset(name:string,data:AtlasFeatureCollection):Promise<StorageInfo>{
 const db=await openDB(),record={name,data,bytes:new TextEncoder().encode(JSON.stringify(data)).byteLength,updatedAt:Date.now(),features:data.features.length};
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 db.close();return {name,bytes:record.bytes,updatedAt:record.updatedAt,features:record.features};
}
export async function loadDataset(name:string):Promise<AtlasFeatureCollection|null>{
 const db=await openDB();const result=await new Promise<any>((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).get(name);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();return result?.data??null;
}
export async function listDatasets():Promise<StorageInfo[]>{
 const db=await openDB();const rows=await new Promise<any[]>((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();return rows.map(r=>({name:r.name,bytes:r.bytes,updatedAt:r.updatedAt,features:r.features}));
}
export async function deleteDataset(name:string):Promise<void>{
 const db=await openDB();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(name);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
}
