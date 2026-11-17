import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { normalizeFa } from './search/normalize';
import { AtlasSearchIndex } from './search';
import { geometryCenter } from './map/geometry';
import { MOTAHARI_VIEW, isInMotahariView, motahariHighlightData } from './map/motahari-focus';
import { buildWalkingNetwork, findWalkingRoute, measureMeters } from './map/routing';
import { LAYERS, DEFAULT_VISIBILITY, type LayerId } from './map/layers';
import { inspectGeoJSON } from './data/inspect';
import { sanitizeGeoJSON } from './data/sanitize';
import { saveDataset, loadDataset, listDatasets } from './data/local-store';
import type { BuildingFeature, ThreeBuildingPreview } from './three/building-preview';
import { watchNetwork } from './core/network';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

// MapLibre v6 needs its worker bundled as a separate Vite asset.
setWorkerUrl(maplibreWorkerUrl);

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
const config = { archive: './data/karaj.pmtiles', geojson: './data/karaj-3d.geojson', center: MOTAHARI_VIEW.center, zoom: MOTAHARI_VIEW.zoom };
const OFFLINE_CACHE = 'karaj-atlas-offline-data-v1';
let map: MLMap | undefined, archive: PMTiles | undefined, usingLocal = false, geojsonReady = false, threeD = false;
let allSearchIndex: SearchItem[] = [];
let motahariPlaces:SearchItem[]=[];
const searchItemByFeature = new WeakMap<LocalFeature, SearchItem>();
const rankedSearch=new AtlasSearchIndex();
let localData: LocalCollection | null = null;
let threePreview:ThreeBuildingPreview|undefined;
let threePreviewMounted=false;
let layerState:LayerState={...DEFAULT_VISIBILITY};
let walkingNetwork:ReturnType<typeof buildWalkingNetwork>|undefined;
let navigationMode:'route'|'measure'|null=null;
let navigationPoints:[number,number][]=[];
// The atlas renders its own map from the locally hosted Karaj dataset. Never
// fall back to a third-party tile service when a dataset file is missing.
const emptyLocalStyle: maplibregl.StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'atlas-background', type: 'background', paint: { 'background-color': '#101a29' } }] };
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
async function loadArchiveStyle(mapInstance: MLMap): Promise<void> {
  setStatus('در حال بارگذاری داده‌های نقشه…');
  try {
    const protocol = new Protocol(); maplibregl.addProtocol('pmtiles', protocol.tile);
    archive = new PMTiles(new URL(config.archive, location.href).href);
    await Promise.race([
      archive.getHeader(),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('PMTiles header request timed out')), 4000))
    ]);
    protocol.add(archive);
    usingLocal = true;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Map style load timed out')), 8000);
      mapInstance.once('style.load', () => { window.clearTimeout(timer); resolve(); });
      mapInstance.setStyle(vectorStyle());
    });
    addSelectionLayer();
    applyLayerState();
  } catch (error) {
    console.info('Local PMTiles unavailable; keeping the atlas-owned canvas ready for local GeoJSON.', error);
  }
  try { await addGeoJSON(); applyLayerState(); }
  catch(error) { console.warn('[KarajAtlas] local dataset unavailable',error); setStatus('نمای اختصاصی اطلس آماده است؛ بستهٔ دادهٔ شهر هنوز در دسترس نیست.'); }
  addNavigationLayers();
  void refreshOfflineMapStatus();
}
function safeText(value:unknown):string {
  if(value===null||value===undefined)return '';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
  return JSON.stringify(value);
}
function makeSearchItems(data: LocalCollection): SearchItem[] {
  const items: SearchItem[] = [];
  for (const feature of data.features) {
    const props = feature.properties;
    if (!props || !Object.keys(props).length) continue;
    const label = String(props['name:fa'] || props.name || props['name:en'] || props.amenity || props.shop || props.highway || props.building || props['addr:street'] || 'عارضهٔ بدون نام');
    const item = { feature, label, props, center: geometryCenter(feature.geometry) };
    items.push(item);
    searchItemByFeature.set(feature, item);
  }
  return items;
}
function addMotahariParkHighlight(data: LocalCollection): void {
  if (!map || !map.isStyleLoaded()) return;
  const parkData = motahariHighlightData(data as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
  const source = map.getSource('motahari-park') as import('maplibre-gl').GeoJSONSource | undefined;
  if (source) source.setData(parkData);
  else map.addSource('motahari-park', { type: 'geojson', data: parkData });
  if (!map.getLayer('motahari-park-fill')) map.addLayer({
    id: 'motahari-park-fill', type: 'fill', source: 'motahari-park',
    paint: { 'fill-color': '#60d9a0', 'fill-opacity': 0.22 }
  });
  if (!map.getLayer('motahari-park-outline')) map.addLayer({
    id: 'motahari-park-outline', type: 'line', source: 'motahari-park',
    paint: { 'line-color': '#72f0b3', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 4], 'line-opacity': 0.98 }
  });
  if (!map.getLayer('motahari-park-label')) map.addLayer({
    id: 'motahari-park-label', type: 'symbol', source: 'motahari-park',
    layout: { 'text-field': ['coalesce', ['get', 'name:fa'], ['get', 'name']], 'text-font': ['Open Sans Bold'], 'text-size': 13, 'text-offset': [0, 1.1], 'text-allow-overlap': true },
    paint: { 'text-color': '#d8ffe9', 'text-halo-color': '#123324', 'text-halo-width': 2 }
  });
}
function addNavigationLayers(): void {
  if (!map || !map.isStyleLoaded()) return;
  if (!map.getSource('local-navigation')) map.addSource('local-navigation', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer('local-navigation-line')) map.addLayer({ id: 'local-navigation-line', type: 'line', source: 'local-navigation', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#ffbf5c', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 17, 8], 'line-opacity': .96, 'line-blur': .3 } });
  if (!map.getLayer('local-navigation-points')) map.addLayer({ id: 'local-navigation-points', type: 'circle', source: 'local-navigation', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 8, 'circle-color': ['match', ['get', 'role'], 'start', '#63e6a4', 'end', '#ff7185', '#ffd166'], 'circle-stroke-color': '#111b27', 'circle-stroke-width': 2.5 } });
}
function setNavigationData(features:import('geojson').Feature<import('geojson').Geometry,Record<string,unknown>>[]):void {
  const source=map?.getSource('local-navigation') as import('maplibre-gl').GeoJSONSource|undefined;
  source?.setData({type:'FeatureCollection',features});
}
function stopNavigation(clear=true):void {
  navigationMode=null; navigationPoints=[];
  $('#navigation-mode').textContent='انتخاب مسیر پیاده';
  $('#measure-mode').textContent='اندازه‌گیری فاصله';
  if(clear){setNavigationData([]);$('#navigation-result').textContent='';}
  map?.getCanvas().classList.remove('map-picking');
}
function beginNavigation(mode:'route'|'measure'):void {
  if(!localData){setStatus('دادهٔ محلی برای ابزارهای محدوده بارگذاری نشده است.');return;}
  stopNavigation(); navigationMode=mode;
  $('#navigation-mode').textContent=mode==='route'?'لغو انتخاب مسیر':'انتخاب مسیر پیاده';
  $('#measure-mode').textContent=mode==='measure'?'لغو اندازه‌گیری':'اندازه‌گیری فاصله';
  map?.getCanvas().classList.add('map-picking');
  $('#navigation-result').textContent=mode==='route'?'نقطهٔ شروع را روی نقشه انتخاب کن.':'نقطهٔ اول اندازه‌گیری را انتخاب کن.';
  setStatus('روی نقشه دو نقطه انتخاب کن. برای لغو، دوباره همان دکمه را بزن.');
}
function finishNavigationPoint(point:[number,number]):void {
  navigationPoints.push(point);
  const markers=navigationPoints.map((coordinates,index)=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates},properties:{role:index===0?'start':'end'}}));
  setNavigationData(markers);
  if(navigationPoints.length===1){$('#navigation-result').textContent='نقطهٔ اول ثبت شد؛ نقطهٔ مقصد را انتخاب کن.';return;}
  const [start,end]=navigationPoints;
  if(navigationMode==='measure'){
    const meters=measureMeters(start,end);
    setNavigationData([...markers,{type:'Feature',geometry:{type:'LineString',coordinates:[start,end]},properties:{role:'measure'}}]);
    $('#navigation-result').textContent=`فاصلهٔ مستقیم: ${meters>=1000?`${(meters/1000).toFixed(2)} کیلومتر`:`${Math.round(meters)} متر`}`;
    setStatus('فاصلهٔ مستقیم بین دو نقطه محاسبه شد.'); stopNavigation(false); return;
  }
  $('#navigation-result').textContent='در حال محاسبهٔ مسیر روی گذرهای محلی…';
  window.setTimeout(()=>{
    if(!localData)return;
    walkingNetwork ||= buildWalkingNetwork(localData as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
    const route=findWalkingRoute(walkingNetwork,start,end);
    if(!route){$('#navigation-result').textContent='مسیر پیوسته‌ای در دادهٔ خیابان‌های این محدوده پیدا نشد؛ دو نقطه را نزدیک‌تر به گذرها انتخاب کن.';setStatus('مسیر در دادهٔ محلی پیدا نشد.');stopNavigation(false);return;}
    setNavigationData([...markers,route.feature as import('geojson').Feature<import('geojson').Geometry,Record<string,unknown>>]);
    const roadText=route.roads.length?` · ${route.roads.slice(0,4).join('، ')}`:'';
    $('#navigation-result').textContent=`مسیر پیادهٔ پیشنهادی · ${(route.meters/1000).toFixed(2)} کیلومتر · حدود ${route.minutes.toLocaleString('fa-IR')} دقیقه${roadText}`;
    setStatus('مسیر بر پایهٔ راه‌های ثبت‌شدهٔ OSM محاسبه شد؛ پوشش مسیرهای پیاده تضمین‌شده نیست.');
    stopNavigation(false);
    map?.fitBounds([[Math.min(start[0],end[0]),Math.min(start[1],end[1])],[Math.max(start[0],end[0]),Math.max(start[1],end[1])]],{padding:90,duration:700,maxZoom:16});
  },30);
}
function placeCategory(item:SearchItem):string {
  return String(item.props.leisure || item.props.amenity || item.props.shop || item.props.tourism || item.props.healthcare || item.props.sport || item.props.public_transport || 'other');
}
function placeCategoryLabel(category:string):string {
  const labels:Record<string,string>={park:'پارک و فضای سبز',garden:'باغ',school:'مدرسه',college:'دانشگاه',hospital:'بیمارستان',clinic:'درمانگاه',pharmacy:'داروخانه',doctors:'پزشک',bank:'بانک',atm:'خودپرداز',restaurant:'رستوران',cafe:'کافه',fast_food:'فست‌فود',supermarket:'سوپرمارکت',convenience:'فروشگاه محلی',bakery:'نانوایی',clothes:'پوشاک',sports_centre:'مجموعهٔ ورزشی',fitness_centre:'باشگاه',cinema:'سینما',library:'کتابخانه',place_of_worship:'مکان مذهبی',bus_station:'پایانهٔ اتوبوس',bus_stop:'ایستگاه اتوبوس',toilets:'سرویس بهداشتی',fuel:'جایگاه سوخت',other:'سایر'};
  return labels[category]||category.replaceAll('_',' ');
}
function renderMotahariPlaces():void {
  const select=$('#motahari-category') as HTMLSelectElement, list=$('#motahari-places');
  const selected=select.value||'all';
  const filtered=motahariPlaces.filter(item=>selected==='all'||placeCategory(item)===selected);
  list.replaceChildren();
  const origin:[number,number]=[50.98837,35.83335];
  filtered.sort((a,b)=>Number(Boolean(b.props.leisure==='park'))-Number(Boolean(a.props.leisure==='park'))||Math.hypot((a.center![0]-origin[0])*90000,(a.center![1]-origin[1])*111000)-Math.hypot((b.center![0]-origin[0])*90000,(b.center![1]-origin[1])*111000));
  for(const item of filtered.slice(0,24)){
    const button=document.createElement('button');button.type='button';button.className='search-result';button.textContent=`${item.label} · ${placeCategoryLabel(placeCategory(item))}`;
    button.addEventListener('click',()=>selectSearchItem(item));list.append(button);
  }
  if(!filtered.length){const note=document.createElement('p');note.className='muted';note.textContent='برای این دسته در محدوده موردی ثبت نشده است.';list.append(note);}
}
function updateMotahariPlaces(data: LocalCollection): void {
  const relevant = makeSearchItems(data).filter(item => item.label!=='عارضهٔ بدون نام' && isInMotahariView(item.feature as import('geojson').Feature<import('geojson').Geometry,Record<string,unknown>>) && item.center && (item.props.amenity || item.props.shop || item.props.leisure || item.props.tourism || item.props.healthcare || item.props.public_transport || item.props.sport));
  motahariPlaces=relevant;
  const counts = new Map<string, number>();
  for (const item of relevant) {
    const category = placeCategory(item);
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  const summary = $('#motahari-summary');
  summary.textContent = `${relevant.length.toLocaleString('fa-IR')} مکان نام‌دار در دادهٔ OSM · ${counts.size.toLocaleString('fa-IR')} دسته‌بندی · مرتب‌شده از نزدیک بوستان خانواده`;
  const select=$('#motahari-category') as HTMLSelectElement;select.replaceChildren();
  const all=document.createElement('option');all.value='all';all.textContent=`همهٔ دسته‌ها (${relevant.length.toLocaleString('fa-IR')})`;select.append(all);
  [...counts.keys()].sort((a,b)=>placeCategoryLabel(a).localeCompare(placeCategoryLabel(b),'fa')).forEach(category=>{const option=document.createElement('option');option.value=category;option.textContent=`${placeCategoryLabel(category)} (${counts.get(category)!.toLocaleString('fa-IR')})`;select.append(option);});
  renderMotahariPlaces();
}
function focusMotahari(): void {
  map?.fitBounds([[MOTAHARI_VIEW.west, MOTAHARI_VIEW.south], [MOTAHARI_VIEW.east, MOTAHARI_VIEW.north]], { padding: 48, duration: 850, maxZoom: MOTAHARI_VIEW.zoom });
  $('#motahari-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function focusFamilyPark(): void {
  map?.flyTo({ center: [50.98837, 35.83335], zoom: 16.2, duration: 850 });
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
    if (!usingLocal) {
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
    }
    geojsonReady = true;
    allSearchIndex = makeSearchItems(data);
    addMotahariParkHighlight(data);
    updateMotahariPlaces(data);
    rankedSearch.build(data as import('geojson').FeatureCollection<import('geojson').Geometry,Record<string,unknown>>);
    setStatus(`دادهٔ محلی: ${report.total.toLocaleString('fa-IR')} عارضه · ساختمان ${report.buildings.toLocaleString('fa-IR')} · نام‌دار ${report.named.toLocaleString('fa-IR')} · مختصات نامعتبر ${report.invalidCoordinates.toLocaleString('fa-IR')}`);
  } catch (error) { console.info('Local GeoJSON absent:', error); setStatus(usingLocal ? 'نقشهٔ برداری محلی فعال است؛ GeoJSON ساختمان‌ها هنوز در بسته نیست.' : 'صفحهٔ نقشه و ابزارها آماده‌اند؛ برای نمایش شهر، بستهٔ دادهٔ محلی اطلس باید دریافت شود.'); }
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
  const quote = (value: unknown) => {
    let text = formatValue(value);
    // Keep exported rows inert when opened in spreadsheet software.
    if (/^[\s\u0000-\u001f]*[=+@]/.test(text) || /^[\s\u0000-\u001f]*-/.test(text)) text = `'${text}`;
    return '"' + text.replaceAll('"','""') + '"';
  };
  const rows = [keys.map(quote).join(','), ...localData.features.map(f => keys.map(k => quote(f.properties?.[k])).join(','))];
  const csv = '\uFEFF' + rows.join('\r\n');
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
  if (geojsonReady && !usingLocal) {
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
  // Show the atlas canvas immediately; archive metadata may take a while on a
  // first visit or when the user has a slow connection.
  const mapInstance = new maplibregl.Map({ container: mapEl, center: config.center, zoom: config.zoom, minZoom: 8, maxZoom: 19, pitch: 0, bearing: 0, attributionControl: { customAttribution: '© OpenStreetMap contributors · دادهٔ محلی اطلس کرج' }, style: emptyLocalStyle });
  map = mapInstance;
  mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left'); mapInstance.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  mapInstance.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), 'top-left');
  mapInstance.once('load', () => { $('#loading').hidden = true; void loadArchiveStyle(mapInstance); });
  mapInstance.on('error', event => { console.error('[KarajAtlas]', event.error || event); setStatus('خطای نقشه/شبکه؛ اتصال یا داده بررسی شود.'); });
  mapInstance.on('mousemove', (event: MapLayerMouseEvent) => { mapInstance.getCanvas().style.cursor = mapInstance.queryRenderedFeatures(event.point).length ? 'pointer' : ''; });
  mapInstance.on('click', (event: MapLayerMouseEvent) => {
    if(navigationMode){finishNavigationPoint([event.lngLat.lng,event.lngLat.lat]);return;}
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
 if(map?.getSource('karaj-osm-local'))(map.getSource('karaj-osm-local') as import('maplibre-gl').GeoJSONSource).setData(usingLocal?{...localData,features:localData.features.filter(feature=>Boolean(feature.properties?.building||feature.properties?.['building:part']))}:localData);
 else if(map?.isStyleLoaded())await addGeoJSON(localData);
 allSearchIndex=makeSearchItems(localData);
 addMotahariParkHighlight(localData);
 updateMotahariPlaces(localData);
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
  $('#focus-motahari')?.addEventListener('click', focusMotahari);
  $('#focus-family-park')?.addEventListener('click', focusFamilyPark);
  $('#motahari-category')?.addEventListener('change',renderMotahariPlaces);
  $('#navigation-mode')?.addEventListener('click',()=>navigationMode==='route'?stopNavigation():beginNavigation('route'));
  $('#measure-mode')?.addEventListener('click',()=>navigationMode==='measure'?stopNavigation():beginNavigation('measure'));
  $('#clear-navigation')?.addEventListener('click',()=>stopNavigation());
  $('#show-all-layers')?.addEventListener('click', () => setAllLayers(true));
  $('#hide-all-layers')?.addEventListener('click', () => setAllLayers(false));
  $('#toggle-three-preview')?.addEventListener('click',async()=>{
    const panel=$('#three-panel'),button=$('#toggle-three-preview') as HTMLButtonElement;panel.hidden=!panel.hidden;
    button.setAttribute('aria-expanded',String(!panel.hidden));
    button.textContent=panel.hidden?'بازکردن نمای ساختمان‌ها':'بستن نمای ساختمان‌ها';
    if(panel.hidden)return;
    if(!localData){setStatus('برای نمای Three.js ابتدا GeoJSON محلی را دریافت کنید.');panel.hidden=true;button.setAttribute('aria-expanded','false');button.textContent='بازکردن نمای ساختمان‌ها';return;}
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
      button.setAttribute('aria-expanded','false');button.textContent='بازکردن نمای ساختمان‌ها';
      setStatus('نمای سه‌بعدی در این دستگاه بارگذاری نشد.');
      return;
    }
    const origin={lng:config.center[0],lat:config.center[1]};
    const buildings=localData.features
      .filter(feature=>Boolean(feature.properties?.building))
      .map(feature=>({feature,center:geometryCenter(feature.geometry)}))
      .filter((item):item is {feature:LocalFeature;center:[number,number]}=>item.center!==null)
      .map(item=>({feature:item.feature,distance:Math.hypot((item.center[0]-origin.lng)*111320*Math.cos(origin.lat*Math.PI/180),(item.center[1]-origin.lat)*111320)}))
      .filter(item=>item.distance<=2200)
      .sort((a,b)=>a.distance-b.distance)
      .slice(0,1200)
      .map(item=>item.feature) as BuildingFeature[];
    const count=threePreview.setBuildings(buildings,origin);
    setStatus(`Three.js: ${count.toLocaleString('fa-IR')} ساختمان نزدیک مرکز کرج · حداکثر ۱٬۲۰۰`);
  });
  const search = $('#search') as HTMLInputElement;
  let searchTimer = 0;
  const runSearch = (): void => {
    const query = normalizeFa(search.value);
    if (query.length < 2) { renderSearchResults([]); return; }
    const mode=(search.dataset.mode||'name') as 'name'|'address'|'all';
    const hits=rankedSearch.search(search.value,mode,100).map(doc=>searchItemByFeature.get(doc.feature)).filter((item): item is SearchItem => {
      if (!item) return false;
      return !($('#search-in-motahari') as HTMLInputElement).checked || isInMotahariView(item.feature as import('geojson').Feature<import('geojson').Geometry,Record<string,unknown>>);
    }).slice(0,25);
    renderSearchResults(hits);
    setStatus(hits.length ? `جست‌وجو: ${hits.length} نتیجه` : 'نتیجه‌ای در دادهٔ محلی پیدا نشد.');
  };
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    if (normalizeFa(search.value).length < 2) { renderSearchResults([]); return; }
    searchTimer = window.setTimeout(runSearch, 120);
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { window.clearTimeout(searchTimer); search.value = ''; renderSearchResults([]); }
    if (event.key === 'Enter') { window.clearTimeout(searchTimer); runSearch(); resultsEl.querySelector<HTMLButtonElement>('.search-result')?.click(); }
  });
}
wireUI();
watchNetwork(state=>{const badge=$('#network-state');badge.textContent=state==='online'?'آنلاین':'آفلاین';badge.dataset.state=state;});
void initMap();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const isLocalDevelopment = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocalDevelopment) {
    // Avoid stale cached modules/styles during local development.
    void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())));
  } else {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js')
      .then(() => console.info('[KarajAtlas] app shell caching enabled'))
      .catch(error => console.warn('[KarajAtlas] service worker registration failed', error)));
  }
}

