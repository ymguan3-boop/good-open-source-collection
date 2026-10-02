import * as Cesium from 'cesium';
import { addGeoJSON } from './dataImport.js';
import { normalizeLabelStyle } from './labelStyles.js';
import { removeLayer } from './layerRegistry.js';
export function createLabelAnnotations({viewer,onResult}){
  let handler=null,revision=0;
  function cancel(){revision++;handler?.destroy();handler=null;viewer.canvas.style.cursor='';}
  function start(options){
    const style=normalizeLabelStyle(options);if(!style.text)throw new Error('請先輸入標籤文字');
    cancel();const current=revision;viewer.canvas.style.cursor='crosshair';handler=new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction(async event=>{
      try{
        const scene=viewer.scene;let position=null;
        if(scene.pickPositionSupported)try{position=scene.pickPosition(event.position);}catch{}
        position ||= scene.globe.pick(viewer.camera.getPickRay(event.position),scene) || viewer.camera.pickEllipsoid(event.position,scene.globe.ellipsoid);
        if(!position)return;
        const c=Cesium.Cartographic.fromCartesian(position),coordinates=[Cesium.Math.toDegrees(c.longitude),Cesium.Math.toDegrees(c.latitude)];
        handler?.destroy();handler=null;viewer.canvas.style.cursor='';
        const layer=await addGeoJSON({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates},properties:{name:style.text}}]},`標籤：${style.text.slice(0,40)}`,viewer,{kind:'annotation-label',flyTo:false,metadata:{source:'使用者地圖註記',dataMetadata:{annotationLabel:style}}});
        if(current!==revision){removeLayer(layer.id);return;}
        onResult({mode:'label',layerId:layer.id,status:'標籤已新增，可在圖層項下修改文字及樣式'});
      }catch(error){onResult({mode:'label',status:error.message});}
    },Cesium.ScreenSpaceEventType.LEFT_CLICK);
    onResult({mode:'label',status:'在地圖點選要放置標籤的位置'});
  }
  return {start,cancel,destroy:cancel};
}
