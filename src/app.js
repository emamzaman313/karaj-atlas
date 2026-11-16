import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const $=s=>document.querySelector(s), status=$('#status'), mapEl=$('#map');
const setStatus=s=>status.textContent=s;
let map,protocol,archive,usingLocal=false;
const config={archive:'./data/karaj.pmtiles',center:[50.98,35.84],zoom:11.3};

const onlineStyle={version:8,sources:{osmPreview:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm-preview',type:'raster',source:'osmPreview'}]};
function vectorStyle(){return {version:8,sources:{karaj:{type:'vector',url:'pmtiles://'+new URL(config.archive,location.href).href}},layers:[
{id:'background',type:'background',paint:{'background-color':'#101a29'}},
{id:'land',type:'fill',source:'karaj','source-layer':'landuse',paint:{'fill-color':'#17283a','fill-opacity':.65}},
{id:'water',type:'fill',source:'karaj','source-layer':'water',paint:{'fill-color':'#163b55'}},
{id:'roads',type:'line',source:'karaj','source-layer':'transportation',paint:{'line-color':['match',['get','class'],'motorway','#d9ad60','primary','#b9a06c','#52647b'],'line-width':['interpolate',['linear'],['zoom'],9,.35,15,2.4,18,7]}},
{id:'buildings',type:'fill',source:'karaj','source-layer':'building',paint:{'fill-color':'#61738a','fill-opacity':.72}}
]};}

async function chooseStyle(){
 try{
  protocol=new Protocol();maplibregl.addProtocol('pmtiles',protocol.tile);
  archive=new PMTiles(new URL(config.archive,location.href).href);
  await archive.getHeader(); protocol.add(archive); usingLocal=true; return vectorStyle();
 }catch(e){console.info('Local PMTiles not present; online preview selected.',e);return onlineStyle;}
}
async function initMap(){
 const style=await chooseStyle();
 map=new maplibregl.Map({container:mapEl,center:config.center,zoom:config.zoom,minZoom:8,maxZoom:19,pitch:0,bearing:0,attributionControl:true,style});
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
 map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-left');
 map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:false},trackUserLocation:false}),'top-left');
 map.on('load',()=>{$('#loading').hidden=true;setStatus(usingLocal?'حالت محلی PMTiles فعال است.':'نقشهٔ پایهٔ آنلاین فعال است؛ حالت آفلاین با PMTiles محلی.');});
 map.on('error',e=>{console.error('[KarajAtlas]',e.error||e);setStatus('خطای نقشه/شبکه؛ فایل داده یا اتصال بررسی شود.');});
 map.on('click',e=>{const f=map.queryRenderedFeatures(e.point)[0];if(!f)return;const p=f.properties||{};$('#feature-title').textContent=p.name||p.name_fa||p.class||'عارضه';$('#feature-info').textContent=Object.entries(p).slice(0,12).map(([k,v])=>k+': '+v).join(' · ')||'اطلاعات اضافی موجود نیست';$('#feature-panel').hidden=false;});
}
function toggleLayer(name,visible){if(!usingLocal)return;const ids={roads:['roads'],buildings:['buildings'],water:['water'],land:['land']};ids[name]?.forEach(id=>{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');});}
function wireUI(){
 document.querySelectorAll('[data-layer]').forEach(i=>i.addEventListener('change',()=>toggleLayer(i.dataset.layer,i.checked)));
 $('#close-feature').addEventListener('click',()=>$('#feature-panel').hidden=true);
 $('#reset-view').addEventListener('click',()=>map?.flyTo({center:config.center,zoom:config.zoom,pitch:0,bearing:0,duration:900}));
 $('#search').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.value.trim())setStatus('جست‌وجوی «'+e.target.value.trim()+'» پس از ساخت نمایهٔ نام‌ها فعال می‌شود.');});
}
wireUI();initMap();
