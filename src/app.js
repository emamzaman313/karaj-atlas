import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const $ = (s) => document.querySelector(s);
const status = $('#status');
const setStatus = (s) => status.textContent = s;
const mapEl = $('#map');
let map, protocol, archive, activeLayer = 'streets';

const config = {
  // Put a locally generated PMTiles file at public/data/karaj.pmtiles.
  archive: './data/karaj.pmtiles',
  center: [50.98, 35.84], // approximate city center for initial camera only
  zoom: 11.3
};

function initMap() {
  protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  archive = new PMTiles(config.archive);
  protocol.add(archive);

  map = new maplibregl.Map({
    container: mapEl,
    center: config.center,
    zoom: config.zoom,
    minZoom: 8,
    maxZoom: 19,
    pitch: 0,
    bearing: 0,
    attributionControl: true,
    style: {
      version: 8,
      sources: {
        karaj: {
          type: 'vector',
          url: 'pmtiles://' + new URL(config.archive, location.href).href
        }
      },
      layers: [
        {id:'background',type:'background',paint:{'background-color':'#101a29'}},
        {id:'land',type:'fill',source:'karaj', 'source-layer':'landuse',
          paint:{'fill-color':'#17283a','fill-opacity':0.65}},
        {id:'water',type:'fill',source:'karaj','source-layer':'water',
          paint:{'fill-color':'#163b55'}},
        {id:'roads',type:'line',source:'karaj','source-layer':'transportation',
          paint:{'line-color':['match',['get','class'],'motorway','#d9ad60','primary','#b9a06c','#52647b'],
                 'line-width':['interpolate',['linear'],['zoom'],9,0.35,15,2.4,18,7]}},
        {id:'buildings',type:'fill',source:'karaj','source-layer':'building',
          paint:{'fill-color':'#61738a','fill-opacity':0.72}}
      ]
    }
  });
  map.addControl(new maplibregl.NavigationControl({visualizePitch:true}), 'top-left');
  map.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}), 'bottom-left');
  map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:false},trackUserLocation:false}), 'top-left');
  map.on('load', () => {
    setStatus('نقشه بارگذاری شد · داده از بستهٔ محلی');
    $('#loading').hidden = true;
    $('#map').focus();
  });
  map.on('error', e => {
    console.error('[KarajAtlas map]', e.error || e);
    setStatus('خطای نقشه: فایل PMTiles یا لایه‌ها بررسی شود.');
  });
  map.on('click', e => {
    const features = map.queryRenderedFeatures(e.point);
    if (!features.length) return;
    const f = features[0], props = f.properties || {};
    $('#feature-title').textContent = props.name || props.name_fa || props.class || 'عارضهٔ نقشه';
    $('#feature-info').textContent = Object.entries(props).slice(0,12).map(([k,v])=>k+': '+v).join(' · ') || 'اطلاعات اضافی موجود نیست.';
    $('#feature-panel').hidden = false;
  });
}

function toggleLayer(name, visible) {
  const ids = {roads:['roads'], buildings:['buildings'], water:['water'], land:['land']};
  (ids[name] || []).forEach(id => {
    if (map && map.getLayer(id)) map.setLayoutProperty(id,'visibility',visible?'visible':'none');
  });
}
function wireUI() {
  document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => toggleLayer(input.dataset.layer,input.checked)));
  $('#close-feature').addEventListener('click',()=>$('#feature-panel').hidden=true);
  $('#reset-view').addEventListener('click',()=>map?.flyTo({center:config.center,zoom:config.zoom,pitch:0,bearing:0,duration:900}));
  $('#search').addEventListener('keydown',e=>{
    if(e.key==='Enter') {
      const q=e.target.value.trim();
      if(!q) return;
      setStatus('جست‌وجوی نام: '+q+' — اتصال نمایهٔ نام‌ها در مرحلهٔ داده انجام می‌شود.');
    }
  });
}
wireUI();
initMap();
