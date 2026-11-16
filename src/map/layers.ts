export type LayerId='roads'|'buildings'|'water'|'land'|'poi';
export type LayerDefinition={id:LayerId;label:string;layerIds:string[];defaultVisible:boolean};
export const LAYERS:LayerDefinition[]=[
{id:'roads',label:'راه‌ها',layerIds:['osm-roads-line'],defaultVisible:true},
{id:'buildings',label:'ساختمان‌ها',layerIds:['osm-buildings-2d','osm-buildings-3d'],defaultVisible:true},
{id:'water',label:'آب‌ها',layerIds:['osm-water-fill','osm-water-line'],defaultVisible:true},
{id:'land',label:'کاربری زمین',layerIds:['osm-landuse-fill'],defaultVisible:true},
{id:'poi',label:'مکان‌های مهم',layerIds:['osm-poi-circle'],defaultVisible:true}
];
export type LayerVisibility=Record<LayerId,boolean>;
export const DEFAULT_VISIBILITY:LayerVisibility={roads:true,buildings:true,water:true,land:true,poi:true};
