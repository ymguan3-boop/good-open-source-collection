import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import { openCctvWall } from './cctvWallViewer.js';

export function createCctvWall({viewer,root,onChange,onAnalyze}) {
  let cameras=[],selected=[],handler=null,points=[],drawing=false,priorInputs=true,overlay=null,markers=null,epoch=0,controller=null;
  const state=()=>({total:cameras.length,count:selected.length,selecting:!!handler});
  function notify(message){onChange(message,state());}
  function cancelSelection(){const active=!!handler;handler?.destroy();handler=null;drawing=false;overlay?.remove();overlay=null;if(active){viewer.canvas.style.cursor='';viewer.scene.screenSpaceCameraController.enableInputs=priorInputs;}viewer.scene.requestRender();}
  function hideMarkers(){if(markers)markers.show=false;cancelSelection();}
  let closeViewer=null;
  function closeWall(){closeViewer?.();closeViewer=null;epoch++;controller?.abort();controller=null;}
  function stop(){cancelSelection();closeWall();if(markers){viewer.scene.primitives.remove(markers);markers=null;}selected=[];cameras=[];notify('CCTV 已關閉');}
  async function load() {
    stop();const current=epoch;controller=new AbortController();notify('正在讀取全台灣官方 CCTV 目錄…');
    const response=await fetch('/api/taiwan/cctv/sources',{cache:'no-store',signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error || `CCTV HTTP ${response.status}`);if(current!==epoch)return;
    cameras=result.sources.filter(c=>Number.isFinite(c.lon)&&Number.isFinite(c.lat));
    markers=viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    for(const camera of cameras)markers.add({position:Cesium.Cartesian3.fromDegrees(camera.lon,camera.lat,30),pixelSize:7,color:Cesium.Color.CYAN,outlineColor:Cesium.Color.BLACK,outlineWidth:1,disableDepthTestDistance:Number.POSITIVE_INFINITY});
    viewer.scene.requestRender();notify(`已載入全台 ${cameras.length} 支官方國道 CCTV 位置；請圈選後按確定。`);
  }
  function begin() {
    if(!cameras.length)throw new Error('請先載入全台 CCTV 目錄');
    cancelSelection();selected=[];closeWall();markers.show=true;priorInputs=viewer.scene.screenSpaceCameraController.enableInputs;
    overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('tw-cctv-selection');overlay.setAttribute('aria-hidden','true');viewer.container.append(overlay);
    const shape=document.createElementNS('http://www.w3.org/2000/svg','polygon');overlay.append(shape);
    handler=new Cesium.ScreenSpaceEventHandler(viewer.canvas);viewer.canvas.style.cursor='crosshair';
    handler.setInputAction(event=>{drawing=true;points=[[event.position.x,event.position.y]];viewer.scene.screenSpaceCameraController.enableInputs=false;},Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(event=>{if(!drawing)return;const p=[event.endPosition.x,event.endPosition.y],last=points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<3)return;points.push(p);shape.setAttribute('points',points.map(p=>p.join(',')).join(' '));},Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction(()=>{
      if(!drawing)return;drawing=false;viewer.scene.screenSpaceCameraController.enableInputs=priorInputs;
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      if(maxX-minX<8 || maxY-minY<8){notify('請按住滑鼠左鍵畫出圈選範圍。');return;}
      const pixelArea=Math.abs(points.reduce((sum,p,i)=>{const next=points[(i+1)%points.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
      // A diagonal drag is a rectangular selection; a closed freehand loop retains its outline.
      if(points.length<3 || pixelArea<(maxX-minX)*(maxY-minY)*0.08)points=[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]];
      shape.setAttribute('points',points.map(p=>p.join(',')).join(' '));
      const polygon=turf.polygon([[...points,points[0]]]);const canvas=viewer.canvas;
      selected=cameras.filter(camera=>{const position=Cesium.Cartesian3.fromDegrees(camera.lon,camera.lat,30);const projected=Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene,position);if(!projected || projected.x<0 || projected.y<0 || projected.x>canvas.clientWidth || projected.y>canvas.clientHeight)return false;const normal=Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position);const toward=Cesium.Cartesian3.subtract(viewer.camera.positionWC,position,new Cesium.Cartesian3());if(Cesium.Cartesian3.dot(normal,toward)<=0)return false;return turf.booleanPointInPolygon(turf.point([projected.x,projected.y]),polygon);});
      notify(`圈選 ${selected.length} 支 CCTV；按「確定觀看」開啟同一視窗。`);
    },Cesium.ScreenSpaceEventType.LEFT_UP);
    notify('在地圖按住滑鼠左鍵畫出圈選範圍，放開後按確定。');
  }
  function show() {
    if(!selected.length)throw new Error('圈選範圍內沒有 CCTV，請重新圈選或使用一鍵觀看所有影像');
    cancelSelection();closeWall();if(markers)markers.show=false;
    closeViewer=openCctvWall({root,cameras:selected,onClose:closeWall,onAnalyze});
  }
  async function showAll(){if(!cameras.length)await load();selected=[...cameras];show();notify(`已開啟全台 ${selected.length} 支目錄；每頁 12 路連續播放。`);}
  return {load,begin,show,showAll,stop,hideMarkers,state,destroy:stop};
}
