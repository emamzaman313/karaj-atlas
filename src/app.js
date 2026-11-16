import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const $=s=>document.querySelector(s),status=$('#status'),mapEl=$('#map'),setStatus=s=>status.textContent=s;
let map,protocol,archive,usingLocal=false,geojsonReady=false,threeD=false,searchIndex=[];
const config={archive:'./data/karaj.pmtiles',geojson:'./data/karaj-3d.geojson',center:[50.98,35.84],zoom:11.3};
const onlineStyle={version:8,sources:{osmPreview:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm-preview',type:'raster',source:'osmPreview'}]};
function vectorStyle(){return {version:8,sources:{karaj:{type:'vector',url:'pmtiles://'+new URL(config.archive,location.href).href}},layers:[
{id:'background',type:'background',paint:{'background-color':'#101a29'}},
{id:'land',type:'fill',source:'karaj','source-layer':'landuse',paint:{'fill-color':'#17283a','fill-opacity':.65}},
{id:'water',type:'fill',source:'karaj','source-layer':'water',paint:{'fill-color':'#163b55'}},
{id:'roads',type:'line',source:'karaj','source-layer':'transportation',paint:{'line-color':['match',['get','class'],'motorway','#d9ad60','primary','#b9a06c','#52647b'],'line-width':['interpolate',['linear'],['zoom'],9,.35,15,2.4,18,7]}},
{id:'buildings',type:'fill',source:'karaj','source-layer':'building',paint:{'fill-color':'#61738a','fill-opacity':.72}}
]};}
async function chooseStyle(){try{protocol=new Protocol();maplibregl.addProtocol('pmtiles',protocol.tile);archive=new PMTiles(new URL(config.archive,location.href).href);await archive.getHeader();protocol.add(archive);usingLocal=true;return vectorStyle();}catch(e){console.info('No local PMTiles archive; online raster preview selected.',e);return onlineStyle;}}
async function addGeoJSON(){
 try{
  const response=await fetch(config.geojson,{cache:'no-store'});if(!response.ok)throw new Error('3D GeoJSON unavailable');
  const data=await response.json();if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Invalid GeoJSON');
  map.addSource('karaj-osm-local',{type:'geojson',data});
  map.addLayer({id:'osm-buildings-2d',type:'fill',source:'karaj-osm-local',filter:['has','building'],paint:{'fill-color':'#d8b36a','fill-opacity':.35,'fill-outline-color':'#e4c987'}});
  map.addLayer({id:'osm-buildings-3d',type:'fill-extrusion',source:'karaj-osm-local',filter:['has','building'],layout:{visibility:'none'},paint:{
   'fill-extrusion-color':['match',['get','height_source'],'osm_height','#c4a16a','estimated_from_levels_3m','#8c9db3','#65758a'],
   'fill-extrusion-height':['to-number',['get','render_height_m'],9],
   'fill-extrusion-base':['to-number',['get','render_base_m'],0],
   'fill-extrusion-opacity':.88
  }});
  map.addLayer({id:'osm-roads-line',type:'line',source:'karaj-osm-local',filter:['has','highway'],paint:{'line-color':'#65b7d8','line-width':['interpolate',['linear'],['zoom'],11,.5,16,2.5]}});
  map.addLayer({id:'osm-poi-circle',type:'circle',source:'karaj-osm-local',filter:['any',['has','amenity'],['has','shop'],['has','tourism'],['has','historic'],['has','healthcare']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,2,16,5],'circle-color':'#e5bf70','circle-stroke-color':'#101827','circle-stroke-width':1}});
  geojsonReady=true;searchIndex=data.features.filter(f=>f.properties&&(f.properties.name||f.properties['name:fa']||f.properties['name:en'])).map(f=>({feature:f,label:String(f.properties['name:fa']||f.properties.name||f.properties['name:en']),props:f.properties,center:featureCenter(f.geometry)}));setStatus('OSM محلی: '+data.features.length.toLocaleString('fa-IR')+' عارضه؛ ساختمان 3D آمادهٔ فعال‌سازی');
 }catch(e){console.info('Local data absent:',e);setStatus(usingLocal?'PMTiles محلی فعال؛ GeoJSON ساختمان‌ها هنوز قرار نگرفته.':'پیش‌نمایش آنلاین؛ فایل GeoJSON محلی برای ساختمان‌ها لازم است.');}
}
function featureCenter(g){\n if(!g||!g.coordinates)return null;let pts=[];const walk=x=>{if(Array.isArray(x)&&typeof x[0]==='number'&&typeof x[1]==='number')pts.push(x);else if(Array.isArray(x))x.forEach(walk)};walk(g.coordinates);if(!pts.length)return null;return [pts.reduce((a,p)=>a+p[0],0)/pts.length,pts.reduce((a,p)=>a+p[1],0)/pts.length];\n}\nfunction toggle3D(on){
 if(!geojsonReady){setStatus('برای 3D ابتدا GeoJSON محلی را دریافت و آماده کنید.');$('#mode-3d').checked=false;return;}
 threeD=on;map.setLayoutProperty('osm-buildings-2d','visibility',on?'none':'visible');map.setLayoutProperty('osm-buildings-3d','visibility',on?'visible':'none');
 map.easeTo({pitch:on?58:0,bearing:on?-18:0,duration:850});
 setStatus(on?'نمای سه‌بعدی ساختمان‌ها فعال · ارتفاع‌ها با برچسب منبع':'نمای دوبعدی فعال');
}
function toggleLayer(name,visible){const ids={roads:['roads','osm-roads-line'],buildings:['buildings','osm-buildings-2d','osm-buildings-3d'],water:['water'],land:['land'],poi:['osm-poi-circle']};ids[name]?.forEach(id=>{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');});}
async function initMap(){
 const style=await chooseStyle();map=new maplibregl.Map({container:mapEl,center:config.center,zoom:config.zoom,minZoom:8,maxZoom:19,pitch:0,bearing:0,attributionControl:true,style});
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-left');map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:false},trackUserLocation:false}),'top-left');
 map.on('load',async()=>{$('#loading').hidden=true;await addGeoJSON();});
 map.on('error',e=>{console.error('[KarajAtlas]',e.error||e);setStatus('خطای نقشه/شبکه؛ اتصال یا داده بررسی شود.');});
 map.on('click',e=>{const f=map.queryRenderedFeatures(e.point)[0];if(!f)return;const p=f.properties||{};$('#feature-title').textContent=p.name||p['name:fa']||p.class||p.amenity||p.building||'عارضه';$('#feature-info').textContent=Object.entries(p).slice(0,16).map(([k,v])=>k+': '+v).join(' · ')||'ویژگی موجود نیست';$('#feature-panel').hidden=false;});
}
function wireUI(){document.querySelectorAll('[data-layer]').forEach(i=>i.addEventListener('change',()=>toggleLayer(i.dataset.layer,i.checked)));
 $('#mode-3d').addEventListener('change',e=>toggle3D(e.target.checked));$('#close-feature').addEventListener('click',()=>$('#feature-panel').hidden=true);
 $('#reset-view').addEventListener('click',()=>map?.flyTo({center:config.center,zoom:config.zoom,pitch:threeD?58:0,bearing:threeD?-18:0,duration:900}));
 $('#search').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const q=e.target.value.trim().toLocaleLowerCase('fa');if(!q)return;const hits=searchIndex.filter(x=>x.label.toLocaleLowerCase('fa').includes(q)||Object.entries(x.props).some(([k,v])=>k.startsWith('name:')&&String(v).toLocaleLowerCase('fa').includes(q))).slice(0,8);if(!hits.length){setStatus('نتیجه‌ای در دادهٔ محلی پیدا نشد؛ داده ممکن است ناقص باشد.');return;}const h=hits[0];if(h.center)map.flyTo({center:h.center,zoom:16,duration:900});setStatus('نتایج جست‌وجو: '+hits.map(x=>x.label).join('، '));if(h.feature){const p=h.props;$('#feature-title').textContent=h.label;$('#feature-info').textContent=Object.entries(p).slice(0,20).map(([k,v])=>k+': '+v).join(' · ');$('#feature-panel').hidden=false;}});
}
wireUI();initMap();
