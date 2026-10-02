import * as Cesium from 'cesium';
export const LABEL_FONTS=['標楷體','新細明體','微軟正黑體','IBM Plex Sans TC'];
const family={'標楷體':'DFKai-SB','新細明體':'PMingLiU','微軟正黑體':'Microsoft JhengHei','IBM Plex Sans TC':'IBM Plex Sans TC'};
export function normalizeLabelStyle(style={}){
  return {text:String(style.text || '').trim().slice(0,500),font:LABEL_FONTS.includes(style.font)?style.font:'微軟正黑體',color:/^#[0-9a-f]{6}$/i.test(style.color)?style.color:'#ffffff',weight:style.weight==='bold'?'bold':'normal',size:Math.min(64,Math.max(10,Number(style.size)||18))};
}
export function applyAnnotationLabel(layer){
  if(!layer.dataMetadata?.annotationLabel)return;
  const style=normalizeLabelStyle(layer.dataMetadata.annotationLabel);
  for(const entity of layer.dataSource.entities.values){
    entity.billboard=undefined;entity.point=undefined;
    entity.label={text:style.text,font:`${style.weight} ${style.size}px "${family[style.font]}", sans-serif`,fillColor:Cesium.Color.fromCssColorString(style.color),style:Cesium.LabelStyle.FILL_AND_OUTLINE,outlineColor:Cesium.Color.BLACK,outlineWidth:1,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,pixelOffset:new Cesium.Cartesian2(0,-12),disableDepthTestDistance:Infinity};
  }
  layer.viewer.scene.requestRender();
}
