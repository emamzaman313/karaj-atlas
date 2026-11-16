import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Feature, Geometry, Polygon, MultiPolygon } from 'geojson';
type BuildingProps=Record<string,unknown>&{building?:string;render_height_m?:number;height_source?:string};
export type BuildingFeature=Feature<Geometry,BuildingProps>;
export type PreviewOrigin={lng:number;lat:number};
const METERS_PER_DEG=111320;
function localXY(coord:number[],origin:PreviewOrigin):[number,number]{
  const x=(coord[0]-origin.lng)*METERS_PER_DEG*Math.cos(origin.lat*Math.PI/180);
  const y=(coord[1]-origin.lat)*METERS_PER_DEG;
  return [x,y];
}
function shapeFromPolygon(polygon:Polygon,origin:PreviewOrigin):THREE.Shape|null{
  const ring=polygon.coordinates[0];if(!ring||ring.length<4)return null;
  const shape=new THREE.Shape();
  ring.forEach((coord,index)=>{const [x,y]=localXY(coord,origin);if(index===0)shape.moveTo(x,y);else shape.lineTo(x,y);});
  for(const hole of polygon.coordinates.slice(1)){
    if(hole.length<4)continue;const path=new THREE.Path();
    hole.forEach((coord,index)=>{const [x,y]=localXY(coord,origin);if(index===0)path.moveTo(x,y);else path.lineTo(x,y);});
    shape.holes.push(path);
  }
  return shape;
}
/** Lightweight Three.js building-massing preview, separate from MapLibre extrusion. */
export class ThreeBuildingPreview{
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(45,1,.1,100000);
  private renderer:THREE.WebGLRenderer|null=null;
  private controls:OrbitControls|null=null;
  private group=new THREE.Group();
  private resizeObserver:ResizeObserver|null=null;
  constructor(){this.scene.background=new THREE.Color('#0b1420');this.scene.add(new THREE.HemisphereLight(0xdceaff,0x243044,2));const sun=new THREE.DirectionalLight(0xffe0a0,2.4);sun.position.set(800,1200,700);this.scene.add(sun);this.scene.add(this.group);}
  mount(canvas:HTMLCanvasElement):void{
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.target.set(0,0,0);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();this.render();
  }
  setBuildings(features:BuildingFeature[],origin:PreviewOrigin):number{
    this.clear();let count=0;
    for(const feature of features){const geometry=feature.geometry;if(!geometry||!feature.properties?.building)continue;
      const polygons:Polygon[]=geometry.type==='Polygon'?[geometry]:geometry.type==='MultiPolygon'?geometry.coordinates.map(coordinates=>({type:'Polygon',coordinates})):[] as Polygon[];
      const height=Number(feature.properties.render_height_m)||9;
      for(const polygon of polygons){const shape=shapeFromPolygon(polygon,origin);if(!shape)continue;
        const geometry3d=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1});geometry3d.rotateX(-Math.PI/2);
        const source=feature.properties.height_source;
        const color=source==='osm_height'?0xc6a36b:source==='estimated_from_levels_3m'?0x8da4bf:0x65758a;
        const mesh=new THREE.Mesh(geometry3d,new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.08}));mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);count++;
      }
    }
    this.frameBuildings();this.render();return count;
  }
  private frameBuildings():void{
    const bounds=new THREE.Box3().setFromObject(this.group);if(bounds.isEmpty())return;
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());this.controls?.target.copy(center);
    const distance=Math.max(size.x,size.y,size.z,20)*1.35;this.camera.position.set(center.x+distance,center.y+distance*.8,center.z+distance);this.camera.near=Math.max(.1,distance/1000);this.camera.far=distance*100;this.camera.updateProjectionMatrix();
  }
  private resize():void{if(!this.renderer)return;const canvas=this.renderer.domElement;const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.render();}
  render():void{if(!this.renderer)return;this.controls?.update();this.renderer.render(this.scene,this.camera);}
  clear():void{for(const child of [...this.group.children]){const mesh=child as THREE.Mesh;mesh.geometry?.dispose();if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());else mesh.material?.dispose();this.group.remove(child);}}
  dispose():void{this.resizeObserver?.disconnect();this.controls?.dispose();this.clear();this.renderer?.dispose();this.renderer=null;}
}
