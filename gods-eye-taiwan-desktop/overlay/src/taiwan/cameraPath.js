import * as Cesium from 'cesium';
export function createCameraPath({viewer,onStatus=()=>{}}){
  let handler=null,line=null,points=[],drawing=false,frame=null,priorInputs=null,playing=false,color='#ffca55';
  let lookYaw=0,lookPitch=Cesium.Math.toRadians(-25),looking=false;
  const keys=new Set();let playbackGeneration=0;
  const cameraInputs=()=>viewer.scene.screenSpaceCameraController;
  function restore(){if(priorInputs!==null){cameraInputs().enableInputs=priorInputs;priorInputs=null;}viewer.canvas.style.cursor='';}
  function stop(){const owned=playing||!!handler||priorInputs!==null;playbackGeneration++;if(frame!==null)cancelAnimationFrame(frame);frame=null;playing=false;if(owned)viewer.camera.cancelFlight();looking=false;keys.clear();handler?.destroy();handler=null;drawing=false;if(owned){restore();viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);}viewer.scene.requestRender();}
  function cancel(){stop();if(line)viewer.entities.remove(line);line=null;points=[];onStatus('已取消運鏡');}
  function pick(pixel){const scene=viewer.scene;let position;if(scene.pickPositionSupported)try{position=scene.pickPosition(pixel);}catch{}return position || scene.globe.pick(viewer.camera.getPickRay(pixel),scene) || viewer.camera.pickEllipsoid(pixel,scene.globe.ellipsoid);}
  function append(pixel){const position=pick(pixel);if(!position)return;const c=Cesium.Cartographic.fromCartesian(position);if(points.length && Cesium.Cartesian3.distance(position,Cesium.Cartesian3.fromRadians(points.at(-1).longitude,points.at(-1).latitude,points.at(-1).height))<1)return;if(points.length>=2000)return;points.push(c);viewer.scene.requestRender();}
  function start(options={}){
    cancel();color=/^#[0-9a-f]{6}$/i.test(options.color)?options.color:'#ffca55';priorInputs=cameraInputs().enableInputs;cameraInputs().enableInputs=false;viewer.canvas.style.cursor='crosshair';
    line=viewer.entities.add({polyline:{positions:new Cesium.CallbackProperty(()=>points.map(p=>Cesium.Cartesian3.fromRadians(p.longitude,p.latitude,p.height+2)),false),width:3,material:Cesium.Color.fromCssColorString(color),depthFailMaterial:Cesium.Color.fromCssColorString(color)}});
    handler=new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction(event=>{drawing=true;points=[];append(event.position);},Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(event=>{if(drawing)append(event.endPosition);},Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction(event=>{if(!drawing)return;append(event.position);drawing=false;onStatus(`運鏡軌跡已繪製（${points.length} 個點）；按「確定運鏡」開始空拍機觀看。`);},Cesium.ScreenSpaceEventType.LEFT_UP);
    onStatus('按住滑鼠左鍵自由畫運鏡軌跡線，放開後按「確定運鏡」。');
  }
  function play({duration=25,eyeHeight=80}={}){
    if(points.length<2)throw new Error('請先在地圖畫出至少兩個點的運鏡軌跡');
    duration=Math.max(5,Math.min(180,Number(duration)||25));eyeHeight=Math.max(2,Math.min(5000,Number(eyeHeight)||80));
    stop();const playback=playbackGeneration;if(line)line.show=false;viewer.trackedEntity=undefined;
    // Corner cutting preserves the endpoints and removes hand-drawn zigzags.
    let smooth=points.map(c=>Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,c.height));
    for(let pass=0;pass<2;pass++){const next=[smooth[0]];for(let i=0;i<smooth.length-1;i++){next.push(Cesium.Cartesian3.lerp(smooth[i],smooth[i+1],.25,new Cesium.Cartesian3()),Cesium.Cartesian3.lerp(smooth[i],smooth[i+1],.75,new Cesium.Cartesian3()));}next.push(smooth.at(-1));smooth=next;}
    const path=smooth.map(c=>Cesium.Cartographic.fromCartesian(c));
    const route=[];for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],geo=new Cesium.EllipsoidGeodesic(a,b),n=Math.max(1,Math.ceil(geo.surfaceDistance/30));if(route.length+n>30000)throw new Error('運鏡路線過長，請縮小範圍後重畫');for(let j=0;j<n;j++){const c=geo.interpolateUsingFraction(j/n);c.height=a.height+(b.height-a.height)*j/n;route.push(c);}}route.push(path.at(-1));
    const xyz=route.map(c=>Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,Math.max(c.height,viewer.scene.globe.getHeight(c) || 0)+eyeHeight));
    const lengths=[0];for(let i=1;i<xyz.length;i++)lengths.push(lengths.at(-1)+Cesium.Cartesian3.distance(xyz[i-1],xyz[i]));const total=lengths.at(-1);if(total<1){restore();throw new Error('軌跡長度不足，請重新繪製');}
    // Native camera dragging would fight the animated position. Handle Ctrl
    // look separately and retain its angular offsets for the entire flight.
    priorInputs=cameraInputs().enableInputs;cameraInputs().enableInputs=false;playing=true;lookYaw=0;lookPitch=Cesium.Math.toRadians(-25);looking=false;
    viewer.canvas.style.cursor='grab';viewer.canvas.focus({preventScroll:true});
    handler=new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction(()=>{looking=true;viewer.canvas.style.cursor='grabbing';},Cesium.ScreenSpaceEventType.LEFT_DOWN,Cesium.KeyboardEventModifier.CTRL);
    handler.setInputAction(event=>{if(!looking)return;lookYaw+=(event.endPosition.x-event.startPosition.x)*.004;lookPitch=Math.max(Cesium.Math.toRadians(-85),Math.min(Cesium.Math.toRadians(85),lookPitch+(event.endPosition.y-event.startPosition.y)*.004));viewer.scene.requestRender();},Cesium.ScreenSpaceEventType.MOUSE_MOVE,Cesium.KeyboardEventModifier.CTRL);
    const releaseLook=()=>{looking=false;viewer.canvas.style.cursor='grab';};
    handler.setInputAction(releaseLook,Cesium.ScreenSpaceEventType.LEFT_UP,Cesium.KeyboardEventModifier.CTRL);
    handler.setInputAction(releaseLook,Cesium.ScreenSpaceEventType.LEFT_UP);
    let lastTime=null,elapsed=0,baseHeading=null;
    function sample(distance){let lo=1,hi=lengths.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(lengths[mid]<distance)lo=mid+1;else hi=mid;}const t=(distance-lengths[lo-1])/(lengths[lo]-lengths[lo-1] || 1);return Cesium.Cartesian3.lerp(xyz[lo-1],xyz[lo],Math.max(0,Math.min(1,t)),new Cesium.Cartesian3());}
    function routeHeading(position,distance){const normal=Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position),east=Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z,normal,new Cesium.Cartesian3()),new Cesium.Cartesian3()),north=Cesium.Cartesian3.cross(normal,east,new Cesium.Cartesian3());const ahead=Math.max(8,Math.min(100,total*.015));const tangent=Cesium.Cartesian3.subtract(sample(Math.min(total,distance+ahead)),sample(Math.max(0,distance-ahead)),new Cesium.Cartesian3());return Math.atan2(Cesium.Cartesian3.dot(tangent,east),Cesium.Cartesian3.dot(tangent,north));}
    const offset=new Cesium.Cartesian3(),speed=Math.max(10,Math.min(100,total/duration));
    onStatus('空拍機運鏡中；Ctrl＋左鍵拖曳調整角度，WASD 前後左右、Q 降低／E 升高；可按「停止運鏡」結束。');
    const animate=time=>{if(!playing || playback!==playbackGeneration)return;cameraInputs().enableInputs=false;
      const dt=lastTime===null?0:Math.min(.1,Math.max(0,(time-lastTime)/1000));lastTime=time;elapsed+=dt;
      const fraction=Math.min(1,elapsed/duration),progress=fraction*fraction*(3-2*fraction),distance=total*progress;let position=sample(distance);
      const normal=Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(position),east=Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z,normal,new Cesium.Cartesian3()),new Cesium.Cartesian3()),north=Cesium.Cartesian3.cross(normal,east,new Cesium.Cartesian3());
      const targetHeading=routeHeading(position,distance);baseHeading ??=targetHeading;const delta=Math.atan2(Math.sin(targetHeading-baseHeading),Math.cos(targetHeading-baseHeading));baseHeading+=delta*(1-Math.exp(-dt*6));const heading=baseHeading+lookYaw;
      const forward=Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(north,Math.cos(heading),new Cesium.Cartesian3()),Cesium.Cartesian3.multiplyByScalar(east,Math.sin(heading),new Cesium.Cartesian3()),new Cesium.Cartesian3());
      const right=Cesium.Cartesian3.cross(forward,normal,new Cesium.Cartesian3());
      for(const [positive,negative,axis] of [['KeyW','KeyS',forward],['KeyD','KeyA',right],['KeyE','KeyQ',normal]]){const amount=(Number(keys.has(positive))-Number(keys.has(negative)))*speed*dt;Cesium.Cartesian3.add(offset,Cesium.Cartesian3.multiplyByScalar(axis,amount,new Cesium.Cartesian3()),offset);}
      Cesium.Cartesian3.add(position,offset,position);
      const cartographic=Cesium.Cartographic.fromCartesian(position),floor=(viewer.scene.globe.getHeight(cartographic)||0)+2;
      if(cartographic.height<floor)position=Cesium.Cartesian3.fromRadians(cartographic.longitude,cartographic.latitude,floor);
      viewer.camera.setView({destination:position,orientation:{heading,pitch:lookPitch,roll:0}});viewer.scene.requestRender();if(fraction>=1){stop();onStatus('已完成空拍機運鏡，可繼續自由操作視角');return;}frame=requestAnimationFrame(animate);
    };
    // Cesium interpolates the current camera into the route before playback.
    // This also gives 3D tiles time to stream toward the flight destination.
    viewer.camera.flyTo({destination:xyz[0],orientation:{heading:routeHeading(xyz[0],0),pitch:lookPitch,roll:0},duration:2,
      complete:()=>{Promise.resolve().then(()=>{if(playing && playback===playbackGeneration){cameraInputs().enableInputs=false;frame=requestAnimationFrame(animate);}});},
      cancel:()=>{if(playing && playback===playbackGeneration){stop();onStatus('運鏡已停止；仍可重播軌跡');}}});
  }
  const abort=()=>{if(handler || playing){stop();onStatus('運鏡已停止；仍可重播軌跡');}};
  const keyDown=event=>{if(!playing || event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;if(event.code==='Escape'){abort();return;}if(/^Key[WASDQE]$/.test(event.code) && !event.ctrlKey && !event.altKey && !event.metaKey){keys.add(event.code);event.preventDefault();}};
  const keyUp=event=>{keys.delete(event.code);if(event.key==='Control')looking=false;};
  window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',abort);viewer.canvas.addEventListener('pointercancel',abort);
  return {start,play,cancel,stop,get active(){return !!handler || playing;},destroy(){cancel();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',abort);viewer.canvas.removeEventListener('pointercancel',abort);}};
}
