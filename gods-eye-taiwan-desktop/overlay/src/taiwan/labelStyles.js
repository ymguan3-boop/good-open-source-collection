import * as Cesium from 'cesium';
export const LABEL_FONTS=['標楷體','新細明體','微軟正黑體','IBM Plex Sans TC'];
const family={'標楷體':'DFKai-SB','新細明體':'PMingLiU','微軟正黑體':'Microsoft JhengHei','IBM Plex Sans TC':'IBM Plex Sans TC'};
export function normalizeLabelStyle(style={}){
  return {bubble:style.bubble===true,text:String(style.text || '').trim().slice(0,500),font:LABEL_FONTS.includes(style.font)?style.font:'微軟正黑體',color:/^#[0-9a-f]{6}$/i.test(style.color)?style.color:'#ffffff',weight:style.weight==='bold'?'bold':'normal',size:Math.min(64,Math.max(10,Number(style.size)||18))};
}
export function applyAnnotationLabel(layer){
  if(!layer.dataMetadata?.annotationLabel)return;
  const style=normalizeLabelStyle(layer.dataMetadata.annotationLabel);
  for(const entity of layer.dataSource.entities.values){
    entity.billboard=undefined;entity.point=undefined;
    if(style.bubble){entity.label=undefined;entity.billboard={image:bubbleImage(style),heightReference:layer.geojson?.features?.[0]?.geometry?.coordinates?.length>=3 ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND,verticalOrigin:Cesium.VerticalOrigin.BOTTOM,disableDepthTestDistance:Infinity};continue;}
    entity.label={text:style.text,font:`${style.weight} ${style.size}px "${family[style.font]}", sans-serif`,fillColor:Cesium.Color.fromCssColorString(style.color),style:Cesium.LabelStyle.FILL_AND_OUTLINE,outlineColor:Cesium.Color.BLACK,outlineWidth:1,heightReference:layer.geojson?.features?.[0]?.geometry?.coordinates?.length>=3 ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND,pixelOffset:new Cesium.Cartesian2(0,-12),disableDepthTestDistance:Infinity};
  }
  layer.viewer.scene.requestRender();
}

function bubbleImage(style){
  const canvas=document.createElement('canvas'),c=canvas.getContext('2d'),font=`bold ${style.size}px "Microsoft JhengHei", sans-serif`;
  c.font=font;const text=style.text.slice(0,80),width=Math.min(600,Math.ceil(c.measureText(text).width)+40),height=style.size+54;
  canvas.width=width*2;canvas.height=height*2;c.scale(2,2);c.font=font;c.shadowColor='#0006';c.shadowBlur=4;c.shadowOffsetY=2;
  c.beginPath();c.roundRect(2,2,width-4,height-27,12);c.moveTo(width*.25,height-25);c.lineTo(width*.47,height-3);c.lineTo(width*.43,height-25);c.closePath();c.fillStyle='#91bafa';c.fill();c.shadowColor='transparent';c.strokeStyle='#4a7bb8';c.lineWidth=1.5;c.stroke();
  c.fillStyle='#081526';c.textAlign='center';c.textBaseline='middle';c.fillText(text,width/2,(height-25)/2,width-24);return canvas;
}
