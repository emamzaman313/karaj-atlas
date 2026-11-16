import maplibregl, { type Map as MLMap, type MapLayerMouseEvent, type MapLibreEvent } from 'maplibre-gl';
import { normalizeFa } from './search/normalize';
import { AtlasSearchIndex } from './search';
import { geometryCenter } from './map/geometry';
import { LAYERS, DEFAULT_VISIBILITY, type LayerId } from './map/layers';
import { inspectGeoJSON } from './data/inspect';
import { sanitizeGeoJSON } from './data/sanitize';
import { saveDataset, loadDataset, listDatasets } from './data/local-store';
import { ThreeBuildingPreview } from './three/building-preview';
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
let map: MLMap | undefined, archive: PMTiles | undefined, usingLocal = false, geojsonReady = false, threeD = false;
let searchIndex: SearchItem[] = [];
let allSearchIndex: SearchItem[] = [];
const rankedSearch=new AtlasSearchIndex();
let localData: LocalCollection | null = null;
const threePreview=new ThreeBuildingPreview();
let threePreviewMounted=false;
let layerState:LayerState={...DEFAULT_VISIBILITY};
const onlineStyle: maplibregl.StyleSpecification = { version: 8, sources: { osmPreview: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm-preview', type: 'raster', source: 'osmPreview' }] };
function vectorStyle(): maplibregl.StyleSpecification {
  return { version: 8, sources: { karaj: { type: 'vector', url: 'pmtiles://' + new URL(config.archive, location.href).href } }, layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#101a29' } },
    { id: 'land', type: 'fill', source: 'karaj', 'source-layer': 'landuse', paint: { 'fill-color': '#17283a', 'fill-opacity': .65 } },
    { id: 'water', type: 'fill', source: 'karaj', 'source-layer': 'water', paint: { 'fill-color': '#163b55' } },
    { id: 'roads', type: 'line', source: 'karaj', 'source-layer': 'transportation', paint: { 'line-color': ['match', ['get', 'class'], 'motorway', '#d9ad60', 'primary', '#b9a06c', '#52647b'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, .35, 15, 2.4, 18, 7] } },
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
    ['name:fa','نام فارسی'],['name','نام'],['name:en','نام انگلیسی'],['amenity','کاربری'],['shop','نوع فروشگاه'],
    ['highway','نوع راه'],['building','نوع ساختمان'],['addr:street','خیابان'],['addr:housenumber','شماره'],['addr:city','شهر'],
    ['height','ارتفاع ثبت‌شده'],['building:levels','تعداد طبقات'],['height_source','منبع ارتفاع'],['operator','متولی'],['phone','تلفن'],['website','وب‌سایت']
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
async function addGeoJSON(): Promise<void> {
  try {
    const response = await fetch(config.geojson, { cache: 'no-store' }); if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}`);
    const data = await response.json() as LocalCollection;
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid GeoJSON FeatureCollection');
    localData = data;
    const report=inspectGeoJSON(data as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
    map!.addSource('karaj-osm-local', { type: 'geojson', data });
    map!.addLayer({ id: 'osm-buildings-2d', type: 'fill', source: 'karaj-osm-local', filter: ['has', 'building'], paint: { 'fill-color': '#d8b36a', 'fill-opacity': .35, 'fill-outline-color': '#e4c987' } });
    map!.addLayer({ id: 'osm-buildings-3d', type: 'fill-extrusion', source: 'karaj-osm-local', filter: ['has', 'building'], layout: { visibility: 'none' }, paint: {
      'fill-extrusion-color': ['match', ['get', 'height_source'], 'osm_height', '#c4a16a', 'estimated_from_levels_3m', '#8c9db3', '#65758a'],
      'fill-extrusion-height': ['to-number', ['get', 'render_height_m'], 9], 'fill-extrusion-base': ['to-number', ['get', 'render_base_m'], 0], 'fill-extrusion-opacity': .88
    } });
    map!.addLayer({ id: 'osm-roads-line', type: 'line', source: 'karaj-osm-local', filter: ['has', 'highway'], paint: { 'line-color': '#65b7d8', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, .5, 16, 2.5] } });
    map!.addLayer({ id: 'osm-poi-circle', type: 'circle', source: 'karaj-osm-local', filter: ['any', ['has', 'amenity'], ['has', 'shop'], ['has', 'tourism'], ['has', 'historic'], ['has', 'healthcare']], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 5], 'circle-color': '#e5bf70', 'circle-stroke-color': '#101827', 'circle-stroke-width': 1 } });
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
  if (!geojsonReady || !map) { setStatus('برای 3D ابتدا GeoJSON محلی را دریافت و آماده کنید.'); ($('#mode-3d') as HTMLInputElement).checked = false; return; }
  threeD = on; map.setLayoutProperty('osm-buildings-2d', 'visibility', on ? 'none' : 'visible'); map.setLayoutProperty('osm-buildings-3d', 'visibility', on ? 'visible' : 'none');
  map.easeTo({ pitch: on ? 58 : 0, bearing: on ? -18 : 0, duration: 850 }); setStatus(on ? 'نمای سه‌بعدی ساختمان‌ها فعال · ارتفاع‌ها با برچسب منبع' : 'نمای دوبعدی فعال');
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
  map = new maplibregl.Map({ container: mapEl, center: config.center, zoom: config.zoom, minZoom: 8, maxZoom: 19, pitch: 0, bearing: 0, attributionControl: {}, style });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left'); map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), 'top-left');
  map.on('load', async () => { $('#loading').hidden = true; addSelectionLayer(); await addGeoJSON(); });
  map.on('error', (event: MapLibreEvent & { error?: Error }) => { console.error('[KarajAtlas]', event.error || event); setStatus('خطای نقشه/شبکه؛ اتصال یا داده بررسی شود.'); });
  map.on('click', (event: MapLayerMouseEvent) => {
    const feature=map!.queryRenderedFeatures(event.point).find(f=>f.source==='karaj-osm-local')||map!.queryRenderedFeatures(event.point)[0];
    if(!feature)return;
    showFeature((feature.properties||{}) as Props);
    if(feature.geometry.type==='Point'){
      const source=map!.getSource('karaj-selection') as import('maplibre-gl').GeoJSONSource|undefined;
      source?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:feature.geometry,properties:{}}]});
    }
  });
}
async function loadLocalCollection(data:LocalCollection,sourceLabel:string):Promise<void>{
 const clean=sanitizeGeoJSON(data as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
 localData=clean.data as LocalCollection;
 if(map?.getSource('karaj-osm-local'))(map.getSource('karaj-osm-local') as import('maplibre-gl').GeoJSONSource).setData(localData);
 else if(map?.isStyleLoaded())await addGeoJSON();
 allSearchIndex=localData.features.flatMap((f):SearchItem[]=>{const props=f.properties;if(!props||!Object.keys(props).length)return [];const label=String(props['name:fa']||props.name||props['name:en']||props.amenity||props.shop||props.highway||props.building||props['addr:street']||'عارضهٔ بدون نام');return [{feature:f,label,props,center:geometryCenter(f.geometry)}];});
 searchIndex=allSearchIndex;
 rankedSearch.build(localData as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
 const report=inspectGeoJSON(localData as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
 setStatus(`${sourceLabel}: ${report.total.toLocaleString('fa-IR')} عارضه · ${clean.report.skipped.toLocaleString('fa-IR')} حذف/نامعتبر`);
}
async function refreshStorageInfo():Promise<void>{
 const items=await listDatasets();$('#storage-info').textContent=items.length?items.map(x=>`${x.name} · ${x.features.toLocaleString('fa-IR')} عارضه · ${(x.bytes/1048576).toFixed(1)} MB`).join(' | '):'هنوز داده‌ای ذخیره نشده است.';
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
  $('#export-csv')?.addEventListener('click', exportFeatureCSV);
  document.querySelectorAll<HTMLButtonElement>('[data-search-mode]').forEach(button =>
    button.addEventListener('click', () => setSearchMode(button.dataset.searchMode as 'name'|'address'|'all')));
  $('#reset-view').addEventListener('click', () => map?.flyTo({
    center: config.center, zoom: config.zoom, pitch: threeD ? 58 : 0,
    bearing: threeD ? -18 : 0, duration: 900
  }));
  $('#show-all-layers')?.addEventListener('click', () => setAllLayers(true));
  $('#hide-all-layers')?.addEventListener('click', () => setAllLayers(false));
  $('#toggle-three-preview')?.addEventListener('click',()=>{
    const panel=$('#three-panel');panel.hidden=!panel.hidden;
    if(panel.hidden)return;
    if(!localData){setStatus('برای نمای Three.js ابتدا GeoJSON محلی را دریافت کنید.');panel.hidden=true;return;}
    if(!threePreviewMounted){threePreview.mount($('#three-canvas') as HTMLCanvasElement);threePreviewMounted=true;}
    const buildings=localData.features.filter(f=>Boolean(f.properties?.building)) as import('./three/building-preview').BuildingFeature[];
    const count=threePreview.setBuildings(buildings,{lng:config.center[0],lat:config.center[1]});
    setStatus(`Three.js: ${count.toLocaleString('fa-IR')} footprint در محدودهٔ مدل`);
  });
  const search = $('#search') as HTMLInputElement;
  search.addEventListener('input', () => {
    const query = normalizeFa(search.value);
    if (query.length < 2) { renderSearchResults([]); return; }
    const mode=(search.dataset.mode||'name') as 'name'|'address'|'all';
    const hits=rankedSearch.search(search.value,mode,15).map(doc=>allSearchIndex.find(item=>item.feature===doc.feature)).filter((item):item is SearchItem=>Boolean(item));
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
