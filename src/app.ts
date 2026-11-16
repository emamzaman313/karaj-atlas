import maplibregl, { type Map as MLMap, type MapLayerMouseEvent, type MapLibreEvent } from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

type Props = Record<string, unknown> & { name?: string; 'name:fa'?: string; 'name:en'?: string; building?: string; highway?: string; amenity?: string; height_source?: string; render_height_m?: number; render_base_m?: number };
type LocalFeature = import('geojson').Feature<import('geojson').Geometry, Props>;
type LocalCollection = import('geojson').FeatureCollection<import('geojson').Geometry, Props>;
type SearchItem = { feature: LocalFeature; label: string; props: Props; center: [number, number] | null };
const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Required UI element missing: ${selector}`);
  return el;
};
const status = $('#status'), mapEl = $('#map'), resultsEl = $('#search-results'), setStatus = (s: string) => { status.textContent = s; };
const config = { archive: './data/karaj.pmtiles', geojson: './data/karaj-3d.geojson', center: [50.98, 35.84] as [number, number], zoom: 11.3 };
let map: MLMap | undefined, archive: PMTiles | undefined, usingLocal = false, geojsonReady = false, threeD = false;
let searchIndex: SearchItem[] = [];
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
function featureCenter(geometry: import('geojson').Geometry | null): [number, number] | null {
  if (!geometry) return null;
  const points: [number, number][] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') points.push([value[0], value[1]]);
    else if (Array.isArray(value)) value.forEach(walk);
  };
  if ('coordinates' in geometry) walk(geometry.coordinates);
  if (!points.length) return null;
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
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
  const entries = preferred.filter(([key]) => properties[key] !== undefined).concat(Object.entries(properties).filter(([key]) => !preferred.some(([p]) => p === key)).slice(0, 12).map(([k]) => [k,k] as [string,string]));
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
    map!.addSource('karaj-osm-local', { type: 'geojson', data });
    map!.addLayer({ id: 'osm-buildings-2d', type: 'fill', source: 'karaj-osm-local', filter: ['has', 'building'], paint: { 'fill-color': '#d8b36a', 'fill-opacity': .35, 'fill-outline-color': '#e4c987' } });
    map!.addLayer({ id: 'osm-buildings-3d', type: 'fill-extrusion', source: 'karaj-osm-local', filter: ['has', 'building'], layout: { visibility: 'none' }, paint: {
      'fill-extrusion-color': ['match', ['get', 'height_source'], 'osm_height', '#c4a16a', 'estimated_from_levels_3m', '#8c9db3', '#65758a'],
      'fill-extrusion-height': ['to-number', ['get', 'render_height_m'], 9], 'fill-extrusion-base': ['to-number', ['get', 'render_base_m'], 0], 'fill-extrusion-opacity': .88
    } });
    map!.addLayer({ id: 'osm-roads-line', type: 'line', source: 'karaj-osm-local', filter: ['has', 'highway'], paint: { 'line-color': '#65b7d8', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, .5, 16, 2.5] } });
    map!.addLayer({ id: 'osm-poi-circle', type: 'circle', source: 'karaj-osm-local', filter: ['any', ['has', 'amenity'], ['has', 'shop'], ['has', 'tourism'], ['has', 'historic'], ['has', 'healthcare']], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 5], 'circle-color': '#e5bf70', 'circle-stroke-color': '#101827', 'circle-stroke-width': 1 } });
    geojsonReady = true;
    searchIndex = data.features.flatMap((f): SearchItem[] => { const props = f.properties; if (!props || !(props.name || props['name:fa'] || props['name:en'])) return []; return [{ feature: f, label: String(props['name:fa'] || props.name || props['name:en']), props, center: featureCenter(f.geometry) }]; });
    setStatus(`OSM محلی: ${data.features.length.toLocaleString('fa-IR')} عارضه؛ ساختمان 3D آمادهٔ فعال‌سازی`);
  } catch (error) { console.info('Local GeoJSON absent:', error); setStatus(usingLocal ? 'PMTiles محلی فعال؛ GeoJSON ساختمان‌ها هنوز قرار نگرفته.' : 'پیش‌نمایش آنلاین؛ فایل GeoJSON محلی برای ساختمان‌ها لازم است.'); }
}
function renderSearchResults(items: SearchItem[]): void {
  resultsEl.replaceChildren();
  items.forEach((item) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result'; button.textContent = item.label; button.title = item.label; button.setAttribute('aria-label', 'نمایش ' + item.label);
    button.addEventListener('click', () => { if (item.center) map?.flyTo({ center: item.center, zoom: 16, duration: 900 }); showFeature(item.props, item.label); });
    resultsEl.append(button);
  });
  resultsEl.hidden = items.length === 0;
}
function toggle3D(on: boolean): void {
  if (!geojsonReady || !map) { setStatus('برای 3D ابتدا GeoJSON محلی را دریافت و آماده کنید.'); ($('#mode-3d') as HTMLInputElement).checked = false; return; }
  threeD = on; map.setLayoutProperty('osm-buildings-2d', 'visibility', on ? 'none' : 'visible'); map.setLayoutProperty('osm-buildings-3d', 'visibility', on ? 'visible' : 'none');
  map.easeTo({ pitch: on ? 58 : 0, bearing: on ? -18 : 0, duration: 850 }); setStatus(on ? 'نمای سه‌بعدی ساختمان‌ها فعال · ارتفاع‌ها با برچسب منبع' : 'نمای دوبعدی فعال');
}
function toggleLayer(name: string, visible: boolean): void {
  const ids: Record<string, string[]> = { roads: ['roads', 'osm-roads-line'], buildings: ['buildings', 'osm-buildings-2d', 'osm-buildings-3d'], water: ['water'], land: ['land'], poi: ['osm-poi-circle'] };
  ids[name]?.forEach(id => { if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); });
}
async function initMap(): Promise<void> {
  const style = await chooseStyle();
  map = new maplibregl.Map({ container: mapEl, center: config.center, zoom: config.zoom, minZoom: 8, maxZoom: 19, pitch: 0, bearing: 0, attributionControl: {}, style });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left'); map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), 'top-left');
  map.on('load', async () => { $('#loading').hidden = true; await addGeoJSON(); });
  map.on('error', (event: MapLibreEvent & { error?: Error }) => { console.error('[KarajAtlas]', event.error || event); setStatus('خطای نقشه/شبکه؛ اتصال یا داده بررسی شود.'); });
  map.on('click', (event: MapLayerMouseEvent) => { const features = map!.queryRenderedFeatures(event.point); const feature = features.find(f => f.source === 'karaj-osm-local') || features[0]; if (feature) showFeature((feature.properties || {}) as Props); });
}
function wireUI(): void {
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input => input.addEventListener('change', () => toggleLayer(input.dataset.layer || '', input.checked)));
  $('#mode-3d').addEventListener('change', (event) => toggle3D((event.target as HTMLInputElement).checked));
  $('#close-feature').addEventListener('click', () => { $('#feature-panel').hidden = true; });
  $('#reset-view').addEventListener('click', () => map?.flyTo({ center: config.center, zoom: config.zoom, pitch: threeD ? 58 : 0, bearing: threeD ? -18 : 0, duration: 900 }));
  $('#search').addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return; const query = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase('fa'); if (!query) return;
    const hits = searchIndex.filter(item => item.label.toLocaleLowerCase('fa').includes(query) || Object.entries(item.props).some(([key, value]) => key.startsWith('name:') && String(value).toLocaleLowerCase('fa').includes(query))).slice(0, 8);
    if (!hits.length) { renderSearchResults([]); setStatus('نتیجه‌ای در دادهٔ محلی پیدا نشد؛ داده ممکن است ناقص باشد.'); return; }
    renderSearchResults(hits); setStatus('یافتن ' + hits.length + ' نتیجه؛ روی مورد دلخواه کلیک کنید.');
  });
}
wireUI(); void initMap();
