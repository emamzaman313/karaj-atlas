import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const $=s=>document.querySelector(s), status=$('#status'), mapEl=$('#map');
const setStatus=s=>status.textContent=s;
let map,protocol,archive,usingLocal=false,geojsonReady=false;
const config={archive:'./data/karaj.pmtiles',geojson:'./data/karaj-osm.geojson',center:[50.98,35.84],zoom:11.3};
const onlineStyle={version:8,sources:{osmPreview:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm-preview',type:'raster',source:'osmPreview'}]};
function vectorStyle(){return {version:8,sources:{karaj:{type:'vector',url:'pmtiles://'+new URL(config.archive,location.href).href}},layers:[
{id:'background',type:'background',paint:{'background-color':'#101a29'}},
{id:'land',type:'fill',source:'karaj','source-layer':'landuse',paint:{'fill-color':'#17283a','fill-opacity':.65}},
{id:'water',type:'fill',source:'karaj','source-layer':'water',paint:{'fill-color':'#163b55'}},
{id:'roads',type:'line',source:'karaj','source-layer':'transportation',paint:{'line-color':['match',['get','class'],'motorway','#d9ad60','primary','#b9a06c','#52647b'],'line-width':['interpolate',['linear'],['zoom'],9,.35,15,2.4,18,7]}},
{id:'buildings',type:'fill',source:'karaj','source-layer':'building',paint:{'fill-color':'#61738a','fill-opacity':.72}}
]};}
async function chooseStyle(){
 try{protocol=new Protocol();maplibregl.addProtocol('pmtiles',protocol.tile);archive=new PMTiles(new URL(config.archive,location.href).href);await archive.getHeader();protocol.add(archive);usingLocal=true;return vectorStyle();}
 catch(e){console.info('No local PMTiles archive; use OSM raster preview.',e);return onlineStyle;}
}
async function addGeoJSON(){
 try{
  const response=await fetch(config.geojson,{cache:'no-store'});
  if(!response.ok)throw new Error('GeoJSON file not found');
  const data=await response.json();
  if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Invalid GeoJSON FeatureCollection');
  map.addSource('karaj-osm-local',{type:'geojson',data, promoteId:'id'});
  map.addLayer({id:'osm-buildings-fill',type:'fill',source:'karaj-osm-local',filter:['has','building'],paint:{'fill-color':'#d8b36a','fill-opacity':.34,'fill-outline-color':'#e4c987'}});
  map.addLayer({id:'osm-roads-line',type:'line',source:'karaj-osm-local',filter:['has','highway'],paint:{'line-color':'#65b7d8','line-width':['interpolate',['linear'],['zoom'],11,.5,16,2.5]}});
  map.addLayer({id:'osm-poi-circle',type:'circle',source:'karaj-osm-local',filter:['any',['has','amenity'],['has','shop'],['has','tourism'],['has','historic'],['has','healthcare']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,2,16,5],'circle-color':'#e5bf70','circle-stroke-color':'#101827','circle-stroke-width':1}});
  geojsonReady=true;setStatus('دادهٔ OSM محلی فعال · '+data.features.length.toLocaleString('fa-IR')+' عارضه · انتساب © OpenStreetMap');
 }catch(e){console.info('Local GeoJSON not found; overlays skipped.',e);setStatus(usingLocal?'PMTiles محلی فعال؛ GeoJSON جداگانه موجود نیست.':'نقشهٔ پایهٔ آنلاین فعال · برای overlay واقعی، اسکریپت دریافت داده اجرا شود.');}
}
async function initMap(){
 const style=await chooseStyle();
 map=new maplibregl.Map({container:mapEl,center:config.center,zoom:config.zoom,minZoom:8,maxZoom:19,pitch:0,bearing:0,attributionControl:true,style});
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
 map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-left');
 map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:false},trackUserLocation:false}),'top-left');
 map.on('load',async()=>{$('#loading').hidden=true;setStatus('نقشه آماده است؛ بررسی دادهٔ محلی…');await addGeoJSON();});
 map.on('error',e=>{console.error('[KarajAtlas]',e.error||e);setStatus('خطای نقشه/شبکه؛ فایل داده یا اتصال بررسی شود.');});
 map.on('click',e=>{const f=map.queryRenderedFeatures(e.point)[0];if(!f)return;const p=f.properties||{};$('#feature-title').textContent=p.name||p['name:fa']||p.class||p.amenity||'عارضه';$('#feature-info').textContent=Object.entries(p).slice(0,14).map(([k,v])=>k+': '+v).join(' · ')||'اطلاعات اضافی موجود نیست';$('#feature-panel').hidden=false;});
}
function toggleLayer(name,visible){const ids={roads:['roads','osm-roads-line'],buildings:['buildings','osm-buildings-fill'],water:['water'],land:['land'],poi:['osm-poi-circle']};ids[name]?.forEach(id=>{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');});}
function wireUI(){
 document.querySelectorAll('[data-layer]').forEach(i=>i.addEventListener('change',()=>toggleLayer(i.dataset.layer,i.checked)));
 $('#close-feature').addEventListener('click',()=>$('#feature-panel').hidden=true);
 $('#reset-view').addEventListener('click',()=>map?.flyTo({center:config.center,zoom:config.zoom,pitch:0,bearing:0,duration:900}));
 $('#search').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.value.trim())setStatus('جست‌وجوی «'+e.target.value.trim()+'» پس از ساخت نمایهٔ نام‌ها فعال می‌شود.');});
}
wireUI();initMap();
