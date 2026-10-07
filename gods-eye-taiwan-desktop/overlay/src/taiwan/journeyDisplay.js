import * as Cesium from 'cesium';
import * as turf from '@turf/turf';
import {SEAT_NAMES} from './farePreference.js';
import { illustrativeModelPlacement } from './navigationDisplay.js';
import { attachRoutePicker, markRouteEntity, routePickInfo } from './routePick.js';

export const JOURNEY_MODELS = Object.freeze({
  WALK:{file:'person',pixels:56,diameter:2.0}, BUS:{file:'bus',pixels:80,diameter:12.5},
  TRA:{file:'tra',pixels:80,diameter:21}, HSR:{file:'hsr',pixels:80,diameter:27},
  METRO:{file:'metro',pixels:80,diameter:20}, LRT:{file:'lrt',pixels:72,diameter:23},
  BIKE:{file:'bicycle',pixels:56,diameter:2.1},
});
const names={WALK:'步行',BUS:'公車',TRA:'臺鐵',HSR:'高鐵',METRO:'捷運',LRT:'輕軌',BIKE:'公共自行車'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function journeySegmentDescription(s){
  const fare=s.fare,quotes=fare?.quotes?.length?fare.quotes:fare?[fare]:[];
  return `<b>${escape(names[s.mode]||s.mode)} ${escape(s.trainNumber||s.routeName||'')}</b><p>${escape(s.from?.name)} → ${escape(s.to?.name)}</p><p>${escape(s.departureTime)} → ${escape(s.arrivalTime)}</p><p>車種：${escape(s.transportType||'無差別／未提供')}；座位／車廂：${escape(SEAT_NAMES[fare?.seatClass]||'無差別／未提供')}</p><p>該段票價${fare?.estimated?'（估算）':''}：${Number.isFinite(fare?.amount)?'NT$'+escape(fare.amount):'目前無可靠資料'}</p>${quotes.map(q=>`<p>${escape(q.ticketType||fare.ticketType||'')} ${q.quantity?'× '+escape(q.quantity):''}：${Number.isFinite(q.amount)?'NT$'+escape(q.amount):'無可靠資料'}；${escape(q.source||'未取得')}${q.sourceUrl&&/^https:\/\//.test(q.sourceUrl)?' <a target="_blank" rel="noopener noreferrer" href="'+escape(q.sourceUrl)+'">官方來源</a>':''}；資料更新 ${escape(q.sourceUpdatedAt||'官方未提供')}；驗證時間 ${escape(q.fetchedAt||'未提供')}${q.effectiveFrom?'；生效 '+escape(q.effectiveFrom):''}</p>`).join('')}<p>${escape((fare?.quotes||[]).filter(q=>q.estimated).map(q=>q.estimateBasis).join('；'))} ${escape(fare?.notice||'')}</p>`;
}
/** Uses the application's Cesium viewer and the same display placement as navigation. */
export function createJourneyDisplay({viewer,governor,beforeCamera=()=>{},onStatus=()=>{},onPick=()=>{}}){
  let source=null,plan=null,paths=[],entity=null,index=0,fraction=0,speed=1,running=false,view='free',raf=null,last=0,style={color:'#ffac45',width:2};
  let missingPathNotice='',generation=0,destroyed=false,frameAt=0,pressured=!!governor?.pressured,lastCamera=null,lastViewport='',surface=null;const missing=new Set(),retired=[];
  const releaseGovernor=governor?.subscribe(snapshot=>{pressured=!!snapshot.pressured;});
  const stop=()=>{running=false;if(raf!==null)cancelAnimationFrame(raf);raf=null;emit();};
  const segment=()=>plan?.segments?.[index];
  function emit(){if(!plan)return;onStatus({running,routeVisible:source?.show!==false,notice:missingPathNotice,index,fraction,mode:segment()?.mode,speed,view,total:plan.segments.length,label:`行程模擬｜${index+1}/${plan.segments.length} ${names[segment()?.mode]||''}`,segment:segment(),remainingDistanceMeters:paths.slice(index).reduce((n,p,i)=>n+(p?.length||0)*1000*(i?1:1-fraction),0)});}
  function retire(target){if(!target)return;retired.push(target);if(retired.length>20)retired.shift();source?.entities.remove(target);}
  function clear(){stop();generation++;if(entity){retired.push(entity);if(retired.length>20)retired.shift();}if(source)viewer.dataSources.remove(source,true);source=null;entity=null;plan=null;paths=[];missingPathNotice='';missing.clear();surface=null;lastCamera=null;onPick(null);}
  function setStyle(patch){style={...style,...patch};style.width=Math.max(.5,Math.min(16,Number(style.width)||2));if(!/^#[0-9a-f]{6}$/i.test(style.color))style.color='#369cff';for(const e of source?.entities.values||[])if(e.polyline){e.polyline.width=style.width;e.polyline.material=new Cesium.PolylineDashMaterialProperty({color:Cesium.Color.fromCssColorString(style.color),dashLength:16});}viewer.scene.requestRender();}
  async function load(next,{style:nextStyle}={}){
    if(destroyed)return;clear();plan=next;index=0;fraction=0;view='free';const epoch=generation;
    const added=new Cesium.CustomDataSource('大眾運輸旅程');source=added;await viewer.dataSources.add(added);if(epoch!==generation){viewer.dataSources.remove(added,true);return;}
    const nodes=new Map();paths=plan.segments.map((s,i)=>{
      const coordinates=s.geometry?.coordinates;
      if(s.geometry?.type!=='LineString'||!Array.isArray(coordinates)||coordinates.length<2 || !coordinates.every(p=>p.length>=2&&p.slice(0,2).every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))return null;
      const line=turf.lineString(coordinates),length=turf.length(line);
      markRouteEntity(source.entities.add({id:`transit-leg-${i}`,name:`${names[s.mode]||s.mode}｜${s.routeName||''}`,description:journeySegmentDescription(s),polyline:{positions:Cesium.Cartesian3.fromDegreesArray(coordinates.flatMap(p=>p.slice(0,2))),width:style.width,clampToGround:true,material:new Cesium.PolylineDashMaterialProperty({color:Cesium.Color.fromCssColorString(style.color),dashLength:16})}}),'transit');
      return {line,length};
    });
    plan.segments.forEach((s,i)=>{for(const [key,p]of [['from',s.from],['to',s.to]]){
      if(!Number.isFinite(p?.lat)||!Number.isFinite(p?.lon))continue;const id=`${p.lon},${p.lat},${p.name}`;if(nodes.has(id))continue;nodes.set(id,p);
      markRouteEntity(source.entities.add({name:p.name,position:Cesium.Cartesian3.fromDegrees(p.lon,p.lat),point:{pixelSize:9,color:i===0&&key==='from'?Cesium.Color.LIME:Cesium.Color.GOLD,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Infinity},label:{text:p.name,font:'14px sans-serif',showBackground:true,distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,2500),pixelOffset:new Cesium.Cartesian2(0,-20),heightReference:Cesium.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Infinity},description:journeySegmentDescription(s)+`<p>資料狀態：${escape(s.realtimeStatus)}；下一段：${escape(names[plan.segments[i+1]?.mode]||'抵達終點')}</p>`}),'transit');
    }});
    if(nextStyle)setStyle(nextStyle);update();emit();viewer.scene.requestRender();
  }
  function update(){
    const s=segment(),path=paths[index];if(!source||source.show===false||!s)return;
    if(!path){if(entity){retire(entity);entity=null;}return;}
    if(entity)entity.description=journeySegmentDescription(s);
    const coordinates=turf.along(path.line,path.length*fraction).geometry.coordinates;
    const ahead=turf.along(path.line,Math.min(path.length,path.length*fraction+.02)).geometry.coordinates;
    const behind=turf.along(path.line,Math.max(0,path.length*fraction-.02)).geometry.coordinates;
    const bearing=turf.bearing(turf.point(fraction<.999?coordinates:behind),turf.point(fraction<.999?ahead:coordinates));
    const def=JOURNEY_MODELS[s.mode];if(!def)return;
    let height=viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(...coordinates))??0;
    const sampledAt=performance.now();
    // Ground queries can render a pick pass. Limit them while moving, and never
    // sample our current or retiring illustrative models as physical terrain.
    if(!surface || sampledAt-surface.at>500 || Math.abs(surface.lon-coordinates[0])+Math.abs(surface.lat-coordinates[1])>.003){
      try{const sampled=viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(...coordinates),[...source.entities.values,...retired]);if(Number.isFinite(sampled))height=Math.max(height,sampled);}catch{/* Globe remains available. */}
      surface={at:sampledAt,lon:coordinates[0],lat:coordinates[1],height};
    }else height=Math.max(height,surface.height);
    const placed=illustrativeModelPlacement(viewer,coordinates[0],coordinates[1],height,def.pixels,def.diameter);
    const orientation=Cesium.Transforms.headingPitchRollQuaternion(placed.position,new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(bearing)-Math.PI/2,0,0));
    if(!entity || entity.properties?.mode?.getValue()!==s.mode){
      if(entity)retire(entity);
      entity=markRouteEntity(source.entities.add({id:'transit-simulation',name:'行程模擬',description:journeySegmentDescription(s),position:placed.position,orientation,properties:{mode:s.mode},model:{uri:`/models/taiwan-${def.file}.glb`,scale:placed.scale,minimumPixelSize:def.pixels,shadows:Cesium.ShadowMode.DISABLED}}),'transit');
      const candidate=entity,epoch=generation;
      // Model availability check is lazy and independent of planning/API requests.
      if(missing.has(s.mode))fallback(candidate,s.mode);else fetch(`/models/taiwan-${def.file}.glb`,{method:'HEAD'}).then(r=>{if(!r.ok)throw Error();}).catch(()=>{if(epoch===generation&&entity===candidate){missing.add(s.mode);fallback(candidate,s.mode);}});
    }else{entity.position=placed.position;entity.orientation=orientation;if(entity.model)entity.model.scale=placed.scale;}
    if(view==='follow'){
      // 80 m above / 150 m behind aims at the vehicle at a 28 degree pitch.
      // A 20 m trail put the vehicle below the camera viewport.
      const chase=turf.destination(turf.point(coordinates),.15,bearing+180).geometry.coordinates;
      viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(...chase,height+80+placed.lift),orientation:{heading:Cesium.Math.toRadians(bearing),pitch:Cesium.Math.toRadians(-28),roll:0}});
    }
  }
  function fallback(target,mode){target.model=undefined;target.billboard={image:`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="44"><rect width="100" height="44" rx="6" fill="#123b50"/><text x="50" y="29" text-anchor="middle" fill="white" font-size="20">${names[mode]}</text></svg>`)}`,width:80,height:36,disableDepthTestDistance:Infinity};emit();viewer.scene.requestRender();}
  function frame(now){if(!running||destroyed)return;const dt=Math.min(.15,last?(now-last)/1000:0);last=now;
    const durations=plan.segments.map(s=>Math.max(1,(Date.parse(s.arrivalTime)-Date.parse(s.departureTime))/1000||1)),total=durations.reduce((a,b)=>a+b,0);
    // At 1x, the whole journey is compressed to two minutes, weighted by timetable duration.
    const duration=Math.max(2,120*durations[index]/total);fraction+=dt*speed/duration;
    if(fraction>=1){if(index<plan.segments.length-1){index++;fraction=0;if(!paths[index]){missingPathNotice='此段缺少可核實線型，已停止行進示意；班次及票價結論仍保留。';stop();}}else{fraction=1;stop();}}
    if(now-frameAt>=(pressured?100:33)){frameAt=now;update();emit();viewer.scene.requestRender();}if(running)raf=requestAnimationFrame(frame);
  }
  const projection=()=>{if(!plan||source?.show===false||running)return;const camera=viewer.camera.positionWC,viewport=`${viewer.canvas.clientWidth},${viewer.canvas.clientHeight}`;
    if(!lastCamera||Cesium.Cartesian3.distance(camera,lastCamera)>.1||viewport!==lastViewport){lastCamera=Cesium.Cartesian3.clone(camera);lastViewport=viewport;update();}
  };
  const releaseRender=viewer.scene.postRender.addEventListener(projection);
  // This viewer intentionally disables Cesium's InfoBox. Reuse the application's
  // floating window for our own journey entities without replacing other picks.
  const releasePick=attachRoutePicker({viewer,type:'transit',getSource:()=>source,onPick:picked=>{
    onPick(routePickInfo('transit',{title:picked.name||'旅程路段',html:picked.description?.getValue(viewer.clock.currentTime)||'',routeId:generation}));
  }});
  function hideRoute(expectedRouteId){
    if(expectedRouteId!==undefined&&String(expectedRouteId)!==String(generation))return {ok:false,stale:true};
    if(!source)return {ok:false,hidden:false};
    stop();view='free';source.show=false;onPick(null);emit();viewer.scene.requestRender();return {ok:true,hidden:true};
  }
  function showRoute(){
    if(!source||!plan)return {ok:false};
    source.show=true;update();emit();viewer.scene.requestRender();return {ok:true};
  }
  const releaseError=viewer.scene.renderError?.addEventListener((_scene,error)=>{if(entity&&/model|gltf|glb/i.test(error?.message||''))fallback(entity,segment()?.mode);});
  function overview(){
    // Display-scaled vehicles are intentionally lifted. They must never enlarge
    // the camera bounds: derive those exclusively from authoritative map coordinates.
    const points=[];
    for(const s of plan?.segments||[]){
      for(const p of [s.from,s.to])if(Number.isFinite(p?.lon)&&Number.isFinite(p?.lat))points.push(Cesium.Cartesian3.fromDegrees(p.lon,p.lat));
      if(s.geometry?.type==='LineString')for(const p of s.geometry.coordinates||[])if(p?.slice(0,2).every(Number.isFinite))points.push(Cesium.Cartesian3.fromDegrees(p[0],p[1]));
    }
    if(!points.length)return;
    const sphere=Cesium.BoundingSphere.fromPoints(points);
    beforeCamera();viewer.camera.flyToBoundingSphere(sphere,{duration:1,offset:new Cesium.HeadingPitchRange(0,Cesium.Math.toRadians(-55),Math.max(600,sphere.radius*3))});
  }
  return {load,setStyle,stop,clear,hideRoute,showRoute,play(){if(!plan)throw Error('請先規劃旅程');if(!paths[index])throw Error('此段缺少可靠路徑資料，仍可查看班次與切換下一段');if(!running){showRoute();if(index===plan.segments.length-1&&fraction>=1){index=0;fraction=0;update();}beforeCamera();running=true;last=0;raf=requestAnimationFrame(frame);emit();}},pause:stop,previous(){stop();index=Math.max(0,index-1);fraction=0;update();emit();viewer.scene.requestRender();},next(){stop();index=Math.min((plan?.segments.length||1)-1,index+1);fraction=0;update();emit();viewer.scene.requestRender();},setSpeed(value){speed=[1,2,5,10].includes(Number(value))?Number(value):1;emit();},setView(value){showRoute();view=value;if(value==='overview'&&source){overview();}else if(value==='next'&&segment()?.to){beforeCamera();const p=segment().to;viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(p.lon,p.lat,500)});}update();emit();viewer.scene.requestRender();},destroy(){if(destroyed)return;clear();destroyed=true;releasePick();retired.length=0;releaseGovernor?.();releaseRender();releaseError?.();},get plan(){return plan;}};
}
