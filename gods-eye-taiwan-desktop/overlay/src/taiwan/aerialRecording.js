const types=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];

/** Only the Cesium canvas is copied. Panels, cursor, HUD and other DOM never enter the video. */
export function createAerialRecording({canvas,governor,onStatus=()=>{},onComplete=()=>{}}){
  let recorder=null,stream=null,frame=null,output=null,chunks=[],finish=null,failure=null,started=0,pausedAt=0,pausedTime=0,quality='auto',closing=null,completing=false;
  function available(){return typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function'&&types.some(t=>MediaRecorder.isTypeSupported(t));}
  async function start(choice='auto'){
    if(recorder||completing)throw new Error('正在錄影或儲存前一次影片，請稍候');if(!available())throw new Error('瀏覽器不支援 WebM 錄影，請使用新版 Chrome 或 Edge');
    quality=choice;const selected=choice==='auto'?(governor?.pressured?'720p':'1080p'):choice;if(!['720p','1080p'].includes(selected))throw new Error('錄影品質無效');
    output=document.createElement('canvas');output.width=selected==='720p'?1280:1920;output.height=selected==='720p'?720:1080;const ctx=output.getContext('2d',{alpha:false});if(!ctx)throw new Error('無法建立錄影畫布');
    const copy=()=>{const scale=Math.min(output.width/Math.max(1,canvas.width),output.height/Math.max(1,canvas.height)),w=canvas.width*scale,h=canvas.height*scale;ctx.fillStyle='#000';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(canvas,(output.width-w)/2,(output.height-h)/2,w,h);};
    chunks=[];failure=null;started=performance.now();pausedAt=0;pausedTime=0;let last=0;const draw=now=>{if(!recorder)return;const fps=governor?.pressured?15:24;if(recorder.state==='recording'&&now-last>=1000/fps){try{copy();last=now;}catch(error){failure=new Error(`無法錄製目前圖資：${error.message}`);void stop();return;}}frame=requestAnimationFrame(draw);};
    try{copy();stream=output.captureStream(24);recorder=new MediaRecorder(stream,{mimeType:types.find(t=>MediaRecorder.isTypeSupported(t)),videoBitsPerSecond:selected==='720p'?3500000:6500000});}catch(error){cleanup();output=null;throw error;}
    const complete=new Promise((resolve,reject)=>{finish={resolve,reject};});complete.catch(()=>{});recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};recorder.onerror=e=>{failure=e.error||new Error('錄影失敗');void stop();};recorder.onstop=async()=>{completing=true;const done=finish,blob=new Blob(chunks,{type:recorder?.mimeType||'video/webm'}),duration=((pausedAt||performance.now())-started-pausedTime)/1000,result={video:blob,duration,quality:selected,width:output?.width,height:output?.height};cleanup();try{if(failure)throw failure;await onComplete(result);done?.resolve(result);}catch(error){done?.reject(error);}finally{finish=null;output=null;completing=false;}};
    try{recorder.start(1000);}catch(error){finish.reject(error);finish=null;cleanup();output=null;throw error;}frame=requestAnimationFrame(draw);onStatus(`錄影開始（${selected}，只錄製 3D 地圖畫布）`);closing=complete;return {quality:selected};
  }
  function cleanup(){if(frame!==null)cancelAnimationFrame(frame);frame=null;stream?.getTracks().forEach(t=>t.stop());stream=null;recorder=null;chunks=[];}
  async function stop(){if(!recorder)return closing;const result=closing;if(recorder.state!=='inactive')recorder.stop();return result;}
  return {available,start,stop,pause(){if(recorder?.state==='recording'){pausedAt=performance.now();recorder.pause();}},resume(){if(recorder?.state==='paused'){pausedTime+=performance.now()-pausedAt;pausedAt=0;recorder.resume();}},download(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},get active(){return !!recorder;},get seconds(){return recorder?((pausedAt||performance.now())-started-pausedTime)/1000:0;},get quality(){return quality;},async destroy(){try{await stop();}finally{cleanup();output=null;}}};
}
