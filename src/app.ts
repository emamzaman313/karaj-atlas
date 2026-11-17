import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl';
import { normalizeFa } from './search/normalize';
import { AtlasSearchIndex } from './search';
import { geometryCenter } from './map/geometry';
import { LAYERS, DEFAULT_VISIBILITY, type LayerId } from './map/layers';
import { inspectGeoJSON } from './data/inspect';
import { sanitizeGeoJSON } from './data/sanitize';
import { saveDataset, loadDataset, listDatasets } from './data/local-store';
import type { BuildingFeature, ThreeBuildingPreview } from './three/building-preview';
import { watchNetwork } from './core/network';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

type Props = Record<string, unknown> & { name?: string; 'name:fa'?: string; 'name:en'?: string; building?: string; highway?: string; amenity?: string; height_source?: string; render_height_m?: number; render_base_m?: number };
type LocalFeature = import('geojson').Feature<import('geojson').Geometry, Props>;
type LocalCollection = import('geojson').FeatureCollection<import('geojson').Geometry, Props>;
type SearchItem = { feature: LocalFeature; label: string; props: Props; center: [number, number] | null };
type LayerState = typeof DEFAULT_VISIBILITY;
const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Required UI element missing: ${selector}`);
  return el;
};
const status = $('#status'), mapEl = $('#map'), resultsEl = $('#search-results'), setStatus = (s: string) => { status.textContent = s; };
const config = { archive: './data/karaj.pmtiles', geojson: './data/karaj-3d.geojson', center: [50.98, 35.84] as [number, number], zoom: 11.3 };
const OFFLINE_CACHE = 'karaj-atlas-offline-data-v1';
let map: MLMap | undefined, archive: PMTiles | undefined, usingLocal = false, geojsonReady = false, threeD = false;
let searchIndex: SearchItem[] = [];
let allSearchIndex: SearchItem[] = [];
const rankedSearch=new AtlasSearchIndex();
let localData: LocalCollection | null = null;
let threePreview:ThreeBuildingPreview|undefined;
let threePreviewMounted=false;
let layerState:LayerState={...DEFAULT_VISIBILITY};
const onlineStyle: maplibregl.StyleSpecification = { version: 8, sources: { osmPreview: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm-preview', type: 'raster', source: 'osmPreview' }] };
function vectorStyle(): maplibregl.StyleSpecification {
  return { version: 8, sources: { karaj: { type: 'vector', url: 'pmtiles://' + new URL(config.archive, location.href).href } }, layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#101a29' } },
    { id: 'land', type: 'fill', source: 'karaj', 'source-layer': 'landuse', paint: { 'fill-color': '#17283a', 'fill-opacity': .65 } },
    { id: 'water', type: 'fill', source: 'karaj', 'source-layer': 'water', paint: { 'fill-color': '#163b55' } },
    { id: 'roads', type: 'line', source: 'karaj', 'source-layer': 'transportation', paint: { 'line-color': ['match', ['get', 'class'], 'motorway', '#d9ad60', 'primary', '#b9a06c', '#52647b'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, .35, 15, 2.4, 18, 7] } },
    { id: 'poi-vector', type: 'circle', source: 'karaj', 'source-layer': 'poi', filter: ['any', ['has', 'amenity'], ['has', 'shop'], ['has', 'tourism'], ['has', 'historic'], ['has', 'healthcare'], ['has', 'public_transport']], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 5], 'circle-color': '#e5bf70', 'circle-stroke-color': '#101827', 'circle-stroke-width': 1 } },
    { id: 'buildings-3d-vector', type: 'fill-extrusion', source: 'karaj', 'source-layer': 'building', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': ['match', ['get', 'height_source'], 'osm_height', '#c4a16a', 'estimated_from_levels_3m', '#8c9db3', '#65758a'], 'fill-extrusion-height': ['case', ['has', 'render_height_m'], ['to-number', ['get', 'render_height_m'], 9], ['has', 'height'], ['to-number', ['get', 'height'], 9], ['has', 'building:levels'], ['*', ['to-number', ['get', 'building:levels'], 3], 3], 9], 'fill-extrusion-base': ['to-number', ['get', 'render_base_m'], ['to-number', ['get', 'min_height'], 0]], 'fill-extrusion-opacity': .88 } },
    { id: 'buildings', type: 'fill', source: 'karaj', 'source-layer': 'building', paint: { 'fill-color': '#61738a', 'fill-opacity': .72 } }
  ] };
}
async function chooseStyle(): Promise<maplibregl.StyleSpecification> {
  try {
    const protocol = new Protocol(); maplibregl.addProtocol('pmtiles', protocol.tile);
    archive = new PMTiles(new URL(config.archive, location.href).href); await archive.getHeader(); protocol.add(archive); usingLocal = true; return vectorStyle();
  } catch (error) { console.info('Local PMTiles unavailable; raster fallback.', error); return onlineStyle; }
}
function safeText(value:unknown):string {
  if(value===null||value===undefined)return '';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  return JSON.stringify(value);
}
function coordinatesOf(geometry:import('geojson').Geometry|null):[number,number][] {
  const result:[number,number][]=[];
  const walk=(v:unknown):void=>{
    if(Array.isArray(v)&&typeof v[0]==='number'&&typeof v[1]==='number'&&Number.isFinite(v[0])&&Number.isFinite(v[1]))result.push([v[0],v[1]]);
    else if(Array.isArray(v))v.forEach(walk);
  };
  if(geometry&&'coordinates'in geometry)walk(geometry.coordinates);
  return result;
}
function geometryBounds(geometry:import('geojson').Geometry|null):[[number,number],[number,number]]|null {
  const pts=coordinatesOf(geometry);if(!pts.length)return null;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  return [[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]];
}
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function showFeature(properties: Props, fallback = 'عارضه'): void {
  const title = String(properties['name:fa'] || properties.name || properties['name:en'] || properties.class || properties.amenity || properties.shop || properties.building || fallback);
  $('#feature-title').textContent = title;
  const panel = $('#feature-info'); panel.replaceChildren();
  const preferred: [string, string][] = [
    ['name:fa','نام فارسی'],['name','نام'],['name:en','نام انگلیسی'],['amenity','کاربری'],['shop','نوع فروشگاه'],['tourism','گردشگری'],['leisure','تفریح'],['public_transport','حمل‌ونقل عمومی'],['railway','راه‌آهن'],['natural','طبیعت'],['landuse','کاربری زمین'],['addr:suburb','محله'],['addr:district','ناحیه'],['addr:postcode','کد پستی'],
    ['highway','نوع راه'],['building','نوع ساختمان'],['addr:street','خیابان'],['addr:housenumber','شماره'],['addr:city','شهر'],
    ['height','ارتفاع ثبت‌شده'],['render_height_m','ارتفاع نمایشی (متر)'],['building:levels','تعداد طبقات'],['height_source','منبع ارتفاع'],['operator','متولی'],['phone','تلفن'],['website','وب‌سایت'],['opening_hours','ساعات فعالیت'],['wheelchair','دسترسی ویلچر']
  ];
  const entries: [string,string][] = [...preferred.filter(([key]) => properties[key] !== undefined), ...Object.entries(properties).filter(([key]) => !preferred.some(([p]) => p === key)).slice(0, 12).map(([key]) => [key,key] as [string,string])];
  for (const [key,label] of entries) {
    const row=document.createElement('div'); row.className='feature-row';
    const name=document.createElement('span'); name.className='feature-key'; name.textContent=label;
    const value=document.createElement('span'); value.className='feature-value'; value.textContent=formatValue(properties[key]); value.dir='auto';
    row.append(name,value); panel.append(row);
  }
  $('#feature-panel').hidden = false;
}
async function addGeoJSON(override?: LocalCollection): Promise<void> {
  try {
    let data: LocalCollection;
    if (override) data = override;
    else { const response = await fetch(config.geojson, { cache: 'no-store' }); if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`); data = await response.json() as LocalCollection; }
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid GeoJSON FeatureCollection');
    localData = data;
    const report=inspectGeoJSON(data as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
    map!.addSource('karaj-osm-local', { type: 'geojson', data });
    map!.addLayer({ id: 'osm-landuse-fill', type: 'fill', source: 'karaj-osm-local', filter: ['any', ['has', 'landuse'], ['has', 'natural'], ['has', 'leisure']], paint: { 'fill-color': ['match', ['get', 'natural'], 'wood', '#244735', 'grassland', '#294b3c', 'water', '#17415c', '#263c35'], 'fill-opacity': .48, 'fill-outline-color': '#526c59' } });
    map!.addLayer({ id: 'osm-water-fill', type: 'fill', source: 'karaj-osm-local', filter: ['any', ['has', 'water'], ['all', ['has', 'natural'], ['==', ['get', 'natural'], 'water']]], paint: { 'fill-color': '#1b5278', 'fill-opacity': .78 } });
    map!.addLayer({ id: 'osm-water-line', type: 'line', source: 'karaj-osm-local', filter: ['has', 'waterway'], paint: { 'line-color': '#4b9ac7', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, .7, 16, 3] } });
    map!.addLayer({ id: 'osm-buildings-2d', type: 'fill', source: 'karaj-osm-local', filter: ['has', 'building'], paint: { 'fill-color': '#d8b36a', 'fill-opacity': .35, 'fill-outline-color': '#e4c987' } });
    map!.addLayer({ id: 'osm-buildings-3d', type: 'fill-extrusion', source: 'karaj-osm-local', filter: ['has', 'building'], layout: { visibility: 'none' }, paint: {
      'fill-extrusion-color': ['match', ['get', 'height_source'], 'osm_height', '#c4a16a', 'estimated_from_levels_3m', '#8c9db3', '#65758a'],
      'fill-extrusion-height': ['to-number', ['get', 'render_height_m'], 9], 'fill-extrusion-base': ['to-number', ['get', 'render_base_m'], 0], 'fill-extrusion-opacity': .88
    } });
    map!.addLayer({ id: 'osm-roads-line', type: 'line', source: 'karaj-osm-local', filter: ['has', 'highway'], paint: { 'line-color': '#65b7d8', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, .5, 16, 2.5] } });
    map!.addLayer({ id: 'osm-poi-circle', type: 'circle', source: 'karaj-osm-local', filter: ['any', ['has', 'amenity'], ['has', 'shop'], ['has', 'tourism'], ['has', 'historic'], ['has', 'healthcare'], ['has', 'public_transport']], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 5], 'circle-color': '#e5bf70', 'circle-stroke-color': '#101827', 'circle-stroke-width': 1 } });
    geojsonReady = true;
    allSearchIndex = data.features.flatMap((f): SearchItem[] => { const props=f.properties; if(!props || !Object.keys(props).length)return []; const label=String(props['name:fa'] || props.name || props['name:en'] || props.amenity || props.shop || props.highway || props.building || props['addr:street'] || 'عارضهٔ بدون نام'); return [{feature:f,label,props,center:geometryCenter(f.geometry)}]; });
    searchIndex = allSearchIndex;
    rankedSearch.build(data as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
    setStatus(`دادهٔ محلی: ${report.total.toLocaleString('fa-IR')} عارضه · ساختمان ${report.buildings.toLocaleString('fa-IR')} · نام‌دار ${report.named.toLocaleString('fa-IR')} · مختصات نامعتبر ${report.invalidCoordinates.toLocaleString('fa-IR')}`);
  } catch (error) { console.info('Local GeoJSON absent:', error); setStatus(usingLocal ? 'PMTiles محلی فعال؛ GeoJSON ساختمان‌ها هنوز قرار نگرفته.' : 'پیش‌نمایش آنلاین؛ فایل GeoJSON محلی برای ساختمان‌ها لازم است.'); }
}
function renderSearchResults(items: SearchItem[]): void {
  resultsEl.replaceChildren();
  items.forEach((item) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result'; button.textContent = item.label; button.title = item.label; button.setAttribute('aria-label', 'نمایش ' + item.label);
    button.addEventListener('click', () => selectSearchItem(item));
    resultsEl.append(button);
  });
  resultsEl.hidden = items.length === 0;
}
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob); const anchor=document.createElement('a');
  anchor.href=url; anchor.download=filename; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportLocalGeoJSON(): void {
  if (!localData) { setStatus('دادهٔ GeoJSON محلی بارگذاری نشده است.'); return; }
  downloadBlob('karaj-osm-export.geojson',new Blob([JSON.stringify(localData)],{type:'application/geo+json'}));
  setStatus('خروجی GeoJSON آماده شد.');
}
function exportFeatureCSV(): void {
  if (!localData) { setStatus('دادهٔ محلی برای خروجی در دسترس نیست.'); return; }
  const keys = Array.from(new Set(localData.features.flatMap(f => Object.keys(f.properties || {})))).sort();
  const quote = (value: unknown) => '"' + formatValue(value).replaceAll('"','""') + '"';
  const rows = [keys.map(quote).join(','), ...localData.features.map(f => keys.map(k => quote(f.properties?.[k])).join(','))];
  const csv = '\uFEFF' + rows.join('\\r\
');
  downloadBlob('karaj-attributes.csv', new Blob([csv], {type:'text/csv;charset=utf-8'}));
  setStatus('CSV ویژگی‌های محلی صادر شد.');
}
function setSearchMode(mode:'name'|'address'|'all'):void {
  const input=$('#search') as HTMLInputElement; input.dataset.mode=mode; input.placeholder=mode==='address'?'جست‌وجوی خیابان یا شماره…':mode==='all'?'جست‌وجوی همهٔ ویژگی‌ها…':'جست‌وجوی نام مکان…';
}
function addSelectionLayer(): void {
  if(!map || map.getLayer('selection-halo'))return;
  map.addSource('karaj-selection',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'selection-halo',type:'circle',source:'karaj-selection',paint:{'circle-radius':14,'circle-color':'#ffd36a','circle-opacity':.22,'circle-stroke-color':'#ffe4a1','circle-stroke-width':2}});
}
function selectSearchItem(item:SearchItem):void {
  if(item.center)map?.flyTo({center:item.center,zoom:16,duration:750});
  showFeature(item.props,item.label);
  const src=map?.getSource('karaj-selection') as import('maplibre-gl').GeoJSONSource|undefined;
  if(src&&item.center)src.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:item.center},properties:{}}]});
}
function toggle3D(on: boolean): void {
  if ((!geojsonReady && !usingLocal) || !map) { setStatus('برای نمای سه‌بعدی، PMTiles یا GeoJSON محلی لازم است.'); ($('#mode-3d') as HTMLInputElement).checked = false; return; }
  threeD = on;
  if (geojsonReady) {
    map.setLayoutProperty('osm-buildings-2d', 'visibility', on ? 'none' : 'visible');
    map.setLayoutProperty('osm-buildings-3d', 'visibility', on ? 'visible' : 'none');
  }
  if (usingLocal && map.getLayer('buildings-3d-vector')) {
    map.setLayoutProperty('buildings', 'visibility', on ? 'none' : 'visible');
    map.setLayoutProperty('buildings-3d-vector', 'visibility', on ? 'visible' : 'none');
  }
  map.easeTo({ pitch: on ? 58 : 0, bearing: on ? -18 : 0, duration: 850 });
  setStatus(on ? 'نمای سه‌بعدی ساختمان‌ها فعال · ارتفاع OSM/تخمین طبقات' : 'نمای دوبعدی فعال');
}
function applyLayerState():void {
  (Object.keys(layerState) as (keyof LayerState)[]).forEach(name=>toggleLayer(name,layerState[name]));
}
function setAllLayers(visible:boolean):void {
  (Object.keys(layerState) as (keyof LayerState)[]).forEach(name=>{layerState[name]=visible;});
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input=>input.checked=visible);
  applyLayerState();
}
function toggleLayer(name:string,visible:boolean):void {
  const layer=LAYERS.find(item=>item.id===name);
  if(!layer)return;
  layer.layerIds.forEach(id=>{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');});
  layerState[layer.id]=visible;
}
async function initMap(): Promise<void> {
  const style = await chooseStyle();
  const mapInstance = new maplibregl.Map({ container: mapEl, center: config.center, zoom: config.zoom, minZoom: 8, maxZoom: 19, pitch: 0, bearing: 0, attributionControl: {}, style });
  map = mapInstance;
  mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left'); mapInstance.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  mapInstance.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), 'top-left');
  mapInstance.on('load', async () => { $('#loading').hidden = true; addSelectionLayer(); try { await addGeoJSON(); } catch(error) { console.warn('[KarajAtlas] local dataset unavailable',error); setStatus('نقشهٔ پایه آماده است؛ دادهٔ ساختمان‌ها/لایه‌های محلی هنوز بارگذاری نشده.'); } void refreshOfflineMapStatus(); });
  mapInstance.on('error', event => { console.error('[KarajAtlas]', event.error || event); setStatus('خطای نقشه/شبکه؛ اتصال یا داده بررسی شود.'); });
  mapInstance.on('mousemove', (event: MapLayerMouseEvent) => { mapInstance.getCanvas().style.cursor = mapInstance.queryRenderedFeatures(event.point).length ? 'pointer' : ''; });
  mapInstance.on('click', (event: MapLayerMouseEvent) => {
    const rendered=mapInstance.queryRenderedFeatures(event.point);
    const feature=rendered.find(f=>f.source==='karaj-osm-local')||rendered[0];
    if(!feature){$('#feature-panel').hidden=true;return;}
    showFeature((feature.properties||{}) as Props);
    if(feature.geometry.type==='Point'){
      const source=mapInstance.getSource('karaj-selection') as import('maplibre-gl').GeoJSONSource|undefined;
      source?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:feature.geometry,properties:{}}]});
    }
  });
}
async function loadLocalCollection(data:LocalCollection,sourceLabel:string):Promise<void>{
 const clean=sanitizeGeoJSON(data as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
 localData=clean.data as LocalCollection;
 if(map?.getSource('karaj-osm-local'))(map.getSource('karaj-osm-local') as import('maplibre-gl').GeoJSONSource).setData(localData);
 else if(map?.isStyleLoaded())await addGeoJSON(localData);
 allSearchIndex=localData.features.flatMap((f):SearchItem[]=>{const props=f.properties;if(!props||!Object.keys(props).length)return [];const label=String(props['name:fa']||props.name||props['name:en']||props.amenity||props.shop||props.highway||props.building||props['addr:street']||'عارضهٔ بدون نام');return [{feature:f,label,props,center:geometryCenter(f.geometry)}];});
 searchIndex=allSearchIndex;
 rankedSearch.build(localData as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
 const report=inspectGeoJSON(localData as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
 setStatus(`${sourceLabel}: ${report.total.toLocaleString('fa-IR')} عارضه · ${clean.report.skipped.toLocaleString('fa-IR')} حذف/نامعتبر`);
}
async function refreshStorageInfo():Promise<void>{
 const items=await listDatasets();$('#storage-info').textContent=items.length?items.map(x=>`${x.name} · ${x.features.toLocaleString('fa-IR')} عارضه · ${(x.bytes/1048576).toFixed(1)} MB`).join(' | '):'هنوز داده‌ای ذخیره نشده است.';
}
async function refreshOfflineMapStatus():Promise<void>{
 const button=$('#download-offline-map') as HTMLButtonElement,remove=$('#remove-offline-map') as HTMLButtonElement,status=$('#offline-map-status');
 if(!('caches'in window)||!('serviceWorker'in navigator)){status.textContent='ذخیرهٔ آفلاین در این مرورگر پشتیبانی نمی‌شود.';button.disabled=true;return;}
 try{const cache=await caches.open(OFFLINE_CACHE),saved=await cache.match(new URL(config.archive,location.href).href);
  if(saved){const bytes=Number(saved.headers.get('Content-Length'))||Number(saved.headers.get('X-Offline-Size'))||0;status.textContent=`نقشه برای استفادهٔ آفلاین ذخیره شده${bytes?` · ${(bytes/1048576).toFixed(1)} مگابایت`:''}.`;remove.hidden=false;button.textContent='به‌روزرسانی نقشهٔ آفلاین';}
  else{status.textContent='نقشهٔ آفلاین هنوز ذخیره نشده است.';remove.hidden=true;}
 }catch{status.textContent='وضعیت ذخیرهٔ آفلاین قابل خواندن نیست.';}
}
async function saveOfflineMap():Promise<void>{
 const button=$('#download-offline-map') as HTMLButtonElement,progress=$('#offline-map-progress') as HTMLProgressElement,status=$('#offline-map-status');
 button.disabled=true;progress.hidden=false;progress.value=0;status.textContent='در حال دریافت بستهٔ نقشه…';
 try{
  const url=new URL(config.archive,location.href),response=await fetch(url,{cache:'no-store'});if(!response.ok||!response.body)throw new Error(`PMTiles HTTP ${response.status}`);
  const total=Number(response.headers.get('Content-Length'))||0,reader=response.body.getReader(),chunks:Uint8Array[]=[];let received=0;
  while(true){const {done,value}=await reader.read();if(done)break;if(value){chunks.push(value);received+=value.byteLength;progress.value=total?Math.min(99,received/total*100):0;status.textContent=total?`دریافت بستهٔ نقشه · ${(received/1048576).toFixed(1)} از ${(total/1048576).toFixed(1)} مگابایت`:`دریافت بستهٔ نقشه · ${(received/1048576).toFixed(1)} مگابایت`;}}
  const bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const magic=new TextDecoder().decode(bytes.subarray(0,7));if(magic!=='PMTiles')throw new Error('PMTiles header invalid');
  const headers=new Headers(response.headers);headers.set('Content-Length',String(bytes.byteLength));headers.set('X-Offline-Size',String(bytes.byteLength));
  const cache=await caches.open(OFFLINE_CACHE);await cache.put(url.href,new Response(bytes,{status:200,headers}));
  progress.value=100;status.textContent=`نقشه ذخیره شد · ${(bytes.byteLength/1048576).toFixed(1)} مگابایت · لایه‌های محلی در حالت آفلاین در دسترس‌اند.`;
  ($('#remove-offline-map') as HTMLButtonElement).hidden=false;button.textContent='به‌روزرسانی نقشهٔ آفلاین';
 }catch(error){console.error('[KarajAtlas] offline map download failed',error);status.textContent='ذخیرهٔ نقشه ناموفق شد؛ اتصال یا فضای خالی دستگاه را بررسی کنید.';}
 finally{button.disabled=false;setTimeout(()=>{progress.hidden=true;},1200);}
}
async function removeOfflineMap():Promise<void>{
 const url=new URL(config.archive,location.href),cache=await caches.open(OFFLINE_CACHE);await cache.delete(url.href);$('#offline-map-status').textContent='نقشهٔ آفلاین حذف شد.';($('#remove-offline-map') as HTMLButtonElement).hidden=true;($('#download-offline-map') as HTMLButtonElement).textContent='ذخیرهٔ نقشه برای حالت آفلاین';
}
function wireUI(): void {
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input =>
    input.addEventListener('change', () => toggleLayer(input.dataset.layer || '', input.checked)));
  $('#mode-3d').addEventListener('change', event => toggle3D((event.target as HTMLInputElement).checked));
  $('#close-feature').addEventListener('click', () => { $('#feature-panel').hidden = true; });
  $('#export-geojson')?.addEventListener('click', exportLocalGeoJSON);
  const importInput=$('#geojson-import') as HTMLInputElement;
  importInput.addEventListener('change',async()=>{
    const file=importInput.files?.[0];if(!file)return;
    if(file.size>200*1024*1024){setStatus('حجم GeoJSON بیش از سقف ۲۰۰ مگابایت است؛ فایل کوچک‌تر یا PMTiles استفاده کنید.');importInput.value='';return;}
    try{setStatus('در حال خواندن GeoJSON…');const parsed=JSON.parse(await file.text()) as LocalCollection;await loadLocalCollection(parsed,file.name);setStatus('ورود داده کامل شد؛ برای ماندگاری ذخیره را بزنید.');}
    catch(error){console.error(error);setStatus('فایل GeoJSON نامعتبر یا غیرقابل خواندن است.');}
  });
  $('#save-local-data')?.addEventListener('click',async()=>{
    if(!localData){setStatus('ابتدا GeoJSON وارد یا دریافت کنید.');return;}
    try{const info=await saveDataset('karaj-main',localData as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);await refreshStorageInfo();setStatus(`ذخیره شد · ${info.features.toLocaleString('fa-IR')} عارضه`);}
    catch(error){console.error(error);setStatus('ذخیره مرورگر ناموفق؛ ظرفیت/مجوز را بررسی کنید.');}
  });
  $('#load-local-data')?.addEventListener('click',async()=>{
    try{const saved=await loadDataset('karaj-main');if(!saved){setStatus('ذخیره‌ای با نام karaj-main پیدا نشد.');return;}await loadLocalCollection(saved as LocalCollection,'بازیابی IndexedDB');await refreshStorageInfo();}
    catch(error){console.error(error);setStatus('بازیابی IndexedDB ناموفق شد.');}
  });
  void refreshStorageInfo();
  $('#download-offline-map')?.addEventListener('click',()=>void saveOfflineMap());
  $('#remove-offline-map')?.addEventListener('click',()=>void removeOfflineMap());
  void refreshOfflineMapStatus();
  $('#export-csv')?.addEventListener('click', exportFeatureCSV);
  document.querySelectorAll<HTMLButtonElement>('[data-search-mode]').forEach(button =>
    button.addEventListener('click', () => setSearchMode(button.dataset.searchMode as 'name'|'address'|'all')));
  $('#reset-view').addEventListener('click', () => map?.flyTo({
    center: config.center, zoom: config.zoom, pitch: threeD ? 58 : 0,
    bearing: threeD ? -18 : 0, duration: 900
  }));
  $('#show-all-layers')?.addEventListener('click', () => setAllLayers(true));
  $('#hide-all-layers')?.addEventListener('click', () => setAllLayers(false));
  $('#toggle-three-preview')?.addEventListener('click',async()=>{
    const panel=$('#three-panel');panel.hidden=!panel.hidden;
    if(panel.hidden)return;
    if(!localData){setStatus('برای نمای Three.js ابتدا GeoJSON محلی را دریافت کنید.');panel.hidden=true;return;}
    try {
      if(!threePreview){
        setStatus('در حال آماده‌سازی نمای سه‌بعدی…');
        const module=await import('./three/building-preview');
        if(panel.hidden)return;
        threePreview=new module.ThreeBuildingPreview();
      }
      if(!threePreviewMounted){threePreview.mount($('#three-canvas') as HTMLCanvasElement);threePreviewMounted=true;}
    } catch(error) {
      console.error('[KarajAtlas] Three.js preview failed to load',error);
      panel.hidden=true;
      setStatus('نمای سه‌بعدی در این دستگاه بارگذاری نشد.');
      return;
    }
    const buildings=localData.features.filter(f=>Boolean(f.properties?.building)) as BuildingFeature[];
    const count=threePreview.setBuildings(buildings,{lng:config.center[0],lat:config.center[1]});
    setStatus(`Three.js: ${count.toLocaleString('fa-IR')} footprint در محدودهٔ مدل`);
  });
  const search = $('#search') as HTMLInputElement;
  search.addEventListener('input', () => {
    const query = normalizeFa(search.value);
    if (query.length < 2) { renderSearchResults([]); return; }
    const mode=(search.dataset.mode||'name') as 'name'|'address'|'all';
    const hits=rankedSearch.search(search.value,mode,25).map(doc=>allSearchIndex.find(item=>item.feature===doc.feature)).filter((item):item is SearchItem=>Boolean(item));
    renderSearchResults(hits);
    setStatus(hits.length ? `جست‌وجو: ${hits.length} نتیجه` : 'نتیجه‌ای در دادهٔ محلی پیدا نشد.');
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { search.value = ''; renderSearchResults([]); }
    if (event.key === 'Enter') resultsEl.querySelector<HTMLButtonElement>('.search-result')?.click();
  });
}
wireUI();
watchNetwork(state=>{const badge=$('#network-state');badge.textContent=state==='online'?'آنلاین':'آفلاین';badge.dataset.state=state;});
void initMap();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js')
    .then(() => console.info('[KarajAtlas] app shell caching enabled'))
    .catch(error => console.warn('[KarajAtlas] service worker registration failed', error)));
}

