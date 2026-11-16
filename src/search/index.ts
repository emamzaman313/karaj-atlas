import type { Feature, FeatureCollection, Geometry } from 'geojson';
export type AtlasFeature=Feature<Geometry,Record<string,unknown>>;
export type AtlasFeatureCollection=FeatureCollection<Geometry,Record<string,unknown>>;
export type SearchDocument={feature:AtlasFeature;label:string;normalized:string;properties:Record<string,unknown>};
const normalize=(value:unknown):string=>String(value??'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[ـًٌٍَُِّْ]/g,'').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).toLocaleLowerCase('fa').trim();
export class AtlasSearchIndex{
 private documents:SearchDocument[]=[];
 build(collection:AtlasFeatureCollection):void{
  this.documents=collection.features.flatMap(feature=>{
   const properties=feature.properties||{};if(!Object.keys(properties).length)return [];
   const label=String(properties['name:fa']||properties.name||properties['name:en']||properties.amenity||properties.shop||properties.highway||properties.building||properties['addr:street']||'عارضهٔ بدون نام');
   const normalized=normalize(Object.entries(properties).map(([k,v])=>k+' '+String(v??'')).join(' '));
   return [{feature,label,normalized,properties}];
  });
 }
 search(query:string,mode:'name'|'address'|'all'='all',limit=30):SearchDocument[]{
  const q=normalize(query);if(q.length<2)return [];
  const ranked=this.documents.map(doc=>{
   const name=normalize(doc.properties['name:fa']||doc.properties.name||doc.properties['name:en']||'');
   const address=normalize(['addr:street','addr:place','addr:housenumber','addr:suburb','addr:district'].map(k=>doc.properties[k]||'').join(' '));
   const target=mode==='name'?name:mode==='address'?address:doc.normalized;
   const score=target===q?100:target.startsWith(q)?65:target.includes(q)?35:0;
   return {doc,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return ranked.slice(0,Math.max(1,limit)).map(x=>x.doc);
 }
 get size():number{return this.documents.length;}
}
