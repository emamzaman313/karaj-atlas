import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { normalizeFa } from './normalize';
export type AtlasFeature=Feature<Geometry,Record<string,unknown>>;
export type AtlasFeatureCollection=FeatureCollection<Geometry,Record<string,unknown>>;
export type SearchDocument={feature:AtlasFeature;label:string;normalized:string;properties:Record<string,unknown>;tokens:string[]};
const valueText=(value:unknown):string=>Array.isArray(value)?value.map(valueText).join(' '):String(value??'');
const normalize=(value:unknown):string=>normalizeFa(valueText(value)).replace(/[\u200c\u200d]/g,' ').replace(/\s+/g,' ').trim();
const fields={name:['name:fa','name','name:en','official_name','alt_name','short_name'],address:['addr:street','addr:place','addr:housenumber','addr:suburb','addr:district','addr:city','addr:postcode'],kind:['amenity','shop','tourism','historic','healthcare','public_transport','highway','building','leisure','office']};
export class AtlasSearchIndex{
 private documents:SearchDocument[]=[];
 build(collection:AtlasFeatureCollection):void{
  this.documents=collection.features.flatMap(feature=>{
   const properties=feature.properties||{};if(!Object.keys(properties).length)return [];
   const label=String(properties['name:fa']||properties.name||properties['name:en']||properties.amenity||properties.shop||properties.highway||properties.building||properties['addr:street']||'عارضهٔ بدون نام');
   const normalized=normalize(Object.entries(properties).map(([k,v])=>k+' '+valueText(v)).join(' '));
   const tokens=Array.from(new Set(normalized.split(' ').filter(t=>t.length>1)));
   return [{feature,label,normalized,properties,tokens}];
  });
 }
 search(query:string,mode:'name'|'address'|'all'='all',limit=30):SearchDocument[]{
  const q=normalize(query);if(q.length<2)return [];
  const qTokens=q.split(' ').filter(Boolean);
  const ranked=this.documents.map(doc=>{
   const name=normalize(fields.name.map(k=>doc.properties[k]).filter(Boolean).join(' '));
   const address=normalize(fields.address.map(k=>doc.properties[k]).filter(Boolean).join(' '));
   const kinds=normalize(fields.kind.map(k=>doc.properties[k]).filter(Boolean).join(' '));
   const target=mode==='name'?name:mode==='address'?address:doc.normalized;
   let score=0;
   if(target===q)score=120;
   else if(target.startsWith(q))score=90;
   else if(target.includes(q))score=65;
   if(mode==='all'&&score===0){
     const matched=qTokens.filter(t=>doc.tokens.some(d=>d.includes(t))).length;
     if(matched===qTokens.length)score=30+matched*5;
     else if(matched)score=matched*5;
   }
   if(mode==='name'&&name.includes(q))score+=12;
   if(mode==='address'&&address.includes(q) )score+=12;
   if(kinds.includes(q))score+=8;
   return {doc,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.doc.label.localeCompare(b.doc.label,'fa'));
  return ranked.slice(0,Math.max(1,limit)).map(x=>x.doc);
 }
 get size():number{return this.documents.length;}
}
