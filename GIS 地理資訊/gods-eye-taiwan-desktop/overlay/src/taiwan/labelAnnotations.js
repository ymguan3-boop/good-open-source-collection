import * as Cesium from 'cesium';
import { addGeoJSON } from './dataImport.js';
import { normalizeLabelStyle } from './labelStyles.js';
import { removeLayer, listLayers, getLayer } from './layerRegistry.js';
export function createLabelAnnotations({viewer,onResult}){
  let handler=null,revision=0,drag=null,pendingRestore=null;
  const dragHandler=new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  function surface(point){
    const scene=viewer.scene,ray=viewer.camera.getPickRay(point);
    if(scene.pickPositionSupported){try{const position=scene.pickPosition(point);if(position)return position;}catch{}}
    return (ray && scene.globe.pick(ray,scene)) || viewer.camera.pickEllipsoid(point,scene.globe.ellipsoid);
  }
  function finishDrag(commit=true){
    if(!drag)return;const current=drag;drag=null;
    // Wait for the final disabled-camera frame to consume drag input, so the
    // camera cannot apply the same accumulated movement after release.
    pendingRestore?.();
    let unsubscribe;const restore=()=>{unsubscribe?.();pendingRestore=null;viewer.scene.screenSpaceCameraController.enableInputs=current.cameraInputs;};
    pendingRestore=restore;
    if(viewer.scene.postRender)unsubscribe=viewer.scene.postRender.addEventListener(restore);else restore();
    viewer.canvas.style.cursor=handler?'crosshair':'';
    if(!commit && getLayer(current.layer.id)){current.entity.position=Cesium.Cartesian3.fromDegrees(...current.original);(current.entity.label || current.entity.billboard).heightReference=current.heightReference;}
    if(commit && getLayer(current.layer.id)){
      current.feature.geometry.coordinates=[...current.coordinates];current.layer.aiReports=[];
      window.dispatchEvent(new CustomEvent('gev-tw:layers-changed',{detail:listLayers()}));
      onResult({mode:'label',layerId:current.layer.id,status:'標籤位置已更新；匯出 JSON 會保存新位置'});
    }
    viewer.scene.requestRender();
  }
  dragHandler.setInputAction(event=>{
    if(handler || drag)return;
    pendingRestore?.();
    const candidates=viewer.scene.drillPick?.(event.position,8) || [viewer.scene.pick(event.position)];
    let entity,layer;
    for(const picked of candidates){const candidate=picked?.id || picked?.primitive?.id;if(!candidate?.label && !candidate?.billboard)continue;
      layer=listLayers().find(item=>item.visible && item.dataMetadata?.annotationLabel && item.dataSource?.entities.contains(candidate));if(layer){entity=candidate;break;}}
    if(!layer)return;
    const feature=layer?.geojson?.features.find(item=>item.geometry?.type==='Point');if(!feature)return;
    drag={layer,entity,feature,original:[...feature.geometry.coordinates],heightReference:(entity.label || entity.billboard).heightReference?.getValue?.(Cesium.JulianDate.now()) ?? Cesium.HeightReference.CLAMP_TO_GROUND,coordinates:[...feature.geometry.coordinates],cameraInputs:viewer.scene.screenSpaceCameraController.enableInputs};
    viewer.scene.screenSpaceCameraController.enableInputs=false;viewer.canvas.style.cursor='grabbing';
  },Cesium.ScreenSpaceEventType.LEFT_DOWN);
  dragHandler.setInputAction(event=>{
    if(!drag)return;const point=surface(event.endPosition);if(!point)return;
    const c=Cesium.Cartographic.fromCartesian(point);drag.coordinates=[Cesium.Math.toDegrees(c.longitude),Cesium.Math.toDegrees(c.latitude),c.height];
    (drag.entity.label || drag.entity.billboard).heightReference=Cesium.HeightReference.NONE;
    drag.entity.position=Cesium.Cartesian3.fromDegrees(...drag.coordinates);viewer.scene.requestRender();
  },Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  dragHandler.setInputAction(()=>finishDrag(),Cesium.ScreenSpaceEventType.LEFT_UP);
  const abortDrag=()=>{finishDrag(false);pendingRestore?.();},checkLayer=()=>{if(drag && (!getLayer(drag.layer.id) || !drag.layer.visible))finishDrag(false);};
  window.addEventListener('blur',abortDrag);viewer.canvas.addEventListener('pointercancel',abortDrag);
  const release=event=>{if(drag && event.button===0)finishDrag();};window.addEventListener('pointerup',release);
  window.addEventListener('gev-tw:layers-changed',checkLayer);
  function cancel(){finishDrag(false);pendingRestore?.();revision++;handler?.destroy();handler=null;viewer.canvas.style.cursor='';}
  function start(options){
    const style=normalizeLabelStyle(options);if(!style.text)throw new Error('請先輸入標籤文字');
    cancel();const current=revision;viewer.canvas.style.cursor='crosshair';handler=new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction(async event=>{
      try{
        const scene=viewer.scene;let position=null;
        if(scene.pickPositionSupported)try{position=scene.pickPosition(event.position);}catch{}
        position ||= scene.globe.pick(viewer.camera.getPickRay(event.position),scene) || viewer.camera.pickEllipsoid(event.position,scene.globe.ellipsoid);
        if(!position)return;
        const c=Cesium.Cartographic.fromCartesian(position),coordinates=[Cesium.Math.toDegrees(c.longitude),Cesium.Math.toDegrees(c.latitude),c.height];
        handler?.destroy();handler=null;viewer.canvas.style.cursor='';
        const layer=await addGeoJSON({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates},properties:{name:style.text}}]},`標籤：${style.text.slice(0,40)}`,viewer,{kind:'annotation-label',flyTo:false,metadata:{source:'使用者地圖註記',dataMetadata:{annotationLabel:style}}});
        if(current!==revision){removeLayer(layer.id);return;}
        onResult({mode:'label',layerId:layer.id,status:'標籤已新增，可拖曳地圖上的文字移動，或在圖層項下修改樣式'});
      }catch(error){onResult({mode:'label',status:error.message});}
    },Cesium.ScreenSpaceEventType.LEFT_CLICK);
    onResult({mode:'label',status:'在地圖點選要放置標籤的位置'});
  }
  return {start,cancel,destroy(){cancel();dragHandler.destroy();window.removeEventListener('blur',abortDrag);viewer.canvas.removeEventListener('pointercancel',abortDrag);window.removeEventListener('pointerup',release);window.removeEventListener('gev-tw:layers-changed',checkLayer);}};
}
