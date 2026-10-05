import * as Cesium from 'cesium';
import { removeLayer, getLayer } from './layerRegistry.js';
export const LABEL_FONTS=['標楷體','新細明體','微軟正黑體','IBM Plex Sans TC'];
const family={'標楷體':'DFKai-SB','新細明體':'PMingLiU','微軟正黑體':'Microsoft JhengHei','IBM Plex Sans TC':'IBM Plex Sans TC'};
export function normalizeLabelStyle(style={}){
  return {hud:style.hud===true,bubble:style.bubble===true,text:String(style.text || '').trim().slice(0,500),font:LABEL_FONTS.includes(style.font)?style.font:'微軟正黑體',color:/^#[0-9a-f]{6}$/i.test(style.color)?style.color:'#ffffff',weight:style.weight==='bold'?'bold':'normal',size:Math.min(64,Math.max(10,Number(style.size)||18))};
}
export function applyAnnotationLabel(layer){
  if(!layer.dataMetadata?.annotationLabel)return;
  const style=normalizeLabelStyle(layer.dataMetadata.annotationLabel);
  for(const entity of layer.dataSource.entities.values){
    entity.billboard=undefined;entity.point=undefined;
    if(style.hud){entity.label=undefined;const image=voicePlaceLabelImage(style);entity.billboard={image,width:image.width/2,height:image.height/2,heightReference:layer.geojson?.features?.[0]?.geometry?.coordinates?.length>=3 ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND,verticalOrigin:Cesium.VerticalOrigin.BOTTOM,disableDepthTestDistance:Infinity};continue;}
    if(style.bubble){entity.label=undefined;entity.billboard={image:bubbleImage(style),heightReference:layer.geojson?.features?.[0]?.geometry?.coordinates?.length>=3 ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND,verticalOrigin:Cesium.VerticalOrigin.BOTTOM,disableDepthTestDistance:Infinity};continue;}
    entity.label={text:style.text,font:`${style.weight} ${style.size}px "${family[style.font]}", sans-serif`,fillColor:Cesium.Color.fromCssColorString(style.color),style:Cesium.LabelStyle.FILL_AND_OUTLINE,outlineColor:Cesium.Color.BLACK,outlineWidth:1,heightReference:layer.geojson?.features?.[0]?.geometry?.coordinates?.length>=3 ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND,pixelOffset:new Cesium.Cartesian2(0,-12),disableDepthTestDistance:Infinity};
  }
  layer.viewer.scene.requestRender();
}

// A voice landmark is temporary. One lifecycle per layer, including repeated
// requests for the same place and removal before its expiry.
const activeHuds=new WeakMap();
export function cancelVoicePlaceHud(layer){activeHuds.get(layer)?.();}
export function activateVoicePlaceHud(layer,{durationMs=5000}={}){
  cancelVoicePlaceHud(layer);
  if(!layer?.dataMetadata?.temporaryVoicePlace || !layer.dataMetadata.annotationLabel?.hud)return;
  const started=performance.now(),duration=Math.min(5000,Math.max(1,Number(durationMs)||5000));
  const pulse=new Cesium.CallbackProperty(()=>Cesium.Color.WHITE.withAlpha(.55+.45*(.5+.5*Math.cos((performance.now()-started)*Math.PI/1000))),false);
  for(const entity of layer.dataSource.entities.values)if(entity.billboard)entity.billboard.color=pulse;
  const render=()=>layer.viewer?.scene.requestRender();
  const unlisten=layer.viewer?.scene.preUpdate?.addEventListener(render);
  let timer=setTimeout(()=>{cleanup();if(getLayer(layer.id)===layer)removeLayer(layer.id);},duration);
  const previousDispose=layer.dispose;
  const cleanup=()=>{if(timer!==null)clearTimeout(timer);timer=null;unlisten?.();activeHuds.delete(layer);if(layer.dispose===dispose)layer.dispose=previousDispose;};
  const dispose=()=>{cleanup();previousDispose?.();};layer.dispose=dispose;activeHuds.set(layer,cleanup);
  render();
}

// Voice landmarks follow the same compact dark name plate as route locations.
// Keep the old export as an alias for integrations written before this style update.
export function voicePlaceLabelImage(style){
  const canvas=document.createElement('canvas'),c=canvas.getContext('2d'),size=Math.min(30,Math.max(18,Number(style.size)||20)),font=`bold ${size}px "Microsoft JhengHei", sans-serif`;
  c.font=font;
  const lines=[];let line='';
  for(const char of String(style.text || '').trim().slice(0,500)){if(c.measureText(line+char).width>440 && line){lines.push(line);line='';}line+=char;}
  if(line)lines.push(line);
  const textWidth=Math.max(24,...lines.map(value=>c.measureText(value).width));
  const width=Math.ceil(textWidth)+20,height=Math.max(1,lines.length)*(size+6)+10;
  canvas.width=width*2;canvas.height=height*2;c.scale(2,2);
  c.fillStyle='rgba(7,23,34,.84)';c.fillRect(0,0,width,height);
  c.strokeStyle='rgba(211,236,245,.55)';c.lineWidth=1;c.strokeRect(.5,.5,width-1,height-1);
  c.font=font;c.textBaseline='middle';c.textAlign='center';c.fillStyle='#ffffff';
  lines.forEach((value,index)=>c.fillText(value,width/2,5+(size+6)*(index+.5)));
  return canvas;
}
export const neonHudImage=voicePlaceLabelImage;

function bubbleImage(style){
  const canvas=document.createElement('canvas'),c=canvas.getContext('2d'),font=`bold ${style.size}px "Microsoft JhengHei", sans-serif`;
  c.font=font;const text=style.text.slice(0,80),width=Math.min(600,Math.ceil(c.measureText(text).width)+40),height=style.size+54;
  canvas.width=width*2;canvas.height=height*2;c.scale(2,2);c.font=font;c.shadowColor='#0006';c.shadowBlur=4;c.shadowOffsetY=2;
  c.beginPath();c.roundRect(2,2,width-4,height-27,12);c.moveTo(width*.25,height-25);c.lineTo(width*.47,height-3);c.lineTo(width*.43,height-25);c.closePath();c.fillStyle='#91bafa';c.fill();c.shadowColor='transparent';c.strokeStyle='#4a7bb8';c.lineWidth=1.5;c.stroke();
  c.fillStyle='#081526';c.textAlign='center';c.textBaseline='middle';c.fillText(text,width/2,(height-25)/2,width-24);return canvas;
}
