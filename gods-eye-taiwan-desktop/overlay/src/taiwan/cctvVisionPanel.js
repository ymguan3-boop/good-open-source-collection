import { openCctvWall } from './cctvWallViewer.js';
import { createCctvInferenceScheduler } from './cctvInferenceScheduler.js';

/** Monitoring is separate from the single existing AI assistant conversation. */
export function createCctvVisionPanel({manager,governor,onAnalyze,onResult=()=>{},onError=()=>{},onSource=()=>{},onClose=()=>{}}){
  let wall=null,closed=true,destroyed=false;
  const work=new Map();
  const panel=manager.create({id:'cctv-vision',title:'📹 CCTV 監看',width:450,height:640,onClose:()=>{close();onClose();}});
  panel.body.innerHTML=`<div class="tw-vision-controls"><div class="tw-actions"><button data-vision-source="view">目前視野</button><button data-vision-source="select">圈選</button><button data-vision-source="all">全臺目錄</button><button data-vision-source="confirm">確定觀看</button></div><p class="tw-note">點選畫面的「一鍵辨識」，完整結果會顯示於 AI 空間助理。</p><p data-vision-status role="status" class="tw-note">請選擇 CCTV 範圍。</p></div><div data-vision-wall></div>`;
  const scheduler=createCctvInferenceScheduler({onStatus:()=>refresh(),onResult:()=>refresh(),onError:()=>refresh()});
  // Internal policy remains automatic; users never need runtime/model settings.
  scheduler.setProfile(governor?.profile==='eco'?'eco':'balanced'); scheduler.setModel('auto'); scheduler.setPressure(Boolean(governor?.pressured));
  const unsubscribe=governor?.subscribe(snapshot=>{scheduler.setPressure(snapshot);refresh();});
  const abort=signal=>{if(signal?.aborted||closed||destroyed)throw new DOMException('辨識已取消','AbortError');};
  function refresh(){panel.setSummary(`${wall?.frameSources().length||0} 路｜${work.size?'辨識中…':'監看中'}`);}
  async function recognize(id,{frame,signal}){
    if(work.has(id))return work.get(id);
    const task=Promise.resolve().then(async()=>{
      let result,lastError;
      try{
        abort(signal);
        const primary=scheduler.configuration().model;
        for(const model of [...new Set([primary,'nano'])]){
          abort(signal);
          try{result=await scheduler.sampleOnce(id,{frame,model,requestId:frame.requestId});break;}
          catch(error){if(error.name==='AbortError')throw error;lastError=error;}
        }
        abort(signal);
        if(result){
          result={...result,camera:frame.camera,cameraName:frame.cameraName,method:'本機 AI',content:'依本次固定截圖進行本機物件偵測與畫面占用率估計。事故、積水、施工與道路阻斷：無法判定。',semanticAssessment:{accident:'無法判定',flooding:'無法判定',construction:'無法判定',roadBlock:'無法判定'}};
        }else if(typeof onAnalyze==='function'){
          const cloud=await onAnalyze({model:'auto-free',image:frame.screenshot,cameraId:frame.cameraId,cameraName:frame.cameraName,requestId:frame.requestId,observedAt:frame.observedAt,capturedAt:frame.capturedAt,sourceObservedAt:frame.sourceObservedAt,source:frame.source,location:{lon:frame.camera?.lon,lat:frame.camera?.lat},prompt:'請依這張固定 CCTV 截圖辨識可見的人、自行車、汽車、機車、公車、卡車及交通狀況。無法可靠判定的數量、事故、積水或道路阻斷請寫無法判定，不得補造數字。'},{signal});
          if(!String(cloud?.content||'').trim())throw new Error('免費辨識服務沒有回傳結果');
          result={...cloud,counts:{person:null,bicycle:null,car:null,motorcycle:null,bus:null,truck:null},boxes:[],congestion:{level:'unknown',label:'無法判定'},method:'免費 AI',backend:'free-cloud'};
        }else throw lastError||new Error('目前沒有可用的免費辨識方式');
        abort(signal);
        const event={...result,cameraId:frame.cameraId,cameraName:frame.cameraName,camera:frame.camera,requestId:frame.requestId,screenshot:frame.screenshot,capturedAt:frame.capturedAt,receivedAt:frame.receivedAt,sourceObservedAt:frame.sourceObservedAt,observedAt:frame.observedAt,source:frame.source,imageWidth:frame.imageData.width,imageHeight:frame.imageData.height,completedAt:new Date().toISOString()};
        await onResult(event); return event;
      }catch(error){
        if(error.name!=='AbortError'&&!signal?.aborted&&!closed)await onError({cameraId:frame.cameraId,cameraName:frame.cameraName,camera:frame.camera,requestId:frame.requestId,capturedAt:frame.capturedAt,sourceObservedAt:frame.sourceObservedAt,source:frame.source,screenshot:frame.screenshot,error});
        throw error;
      }finally{if(work.get(id)===task)work.delete(id);refresh();}
    });
    work.set(id,task);refresh();return task;
  }
  const click=async event=>{const button=event.target.closest('button');if(!button?.dataset.visionSource)return;try{await onSource(button.dataset.visionSource);}catch(error){panel.body.querySelector('[data-vision-status]').textContent=error.message;}};
  panel.element.addEventListener('click',click);
  function replaceCameras(cameras){
    scheduler.stop();wall?.dispose();work.clear();closed=false;
    wall=openCctvWall({root:panel.body.querySelector('[data-vision-wall]'),cameras,onClose:close,onLocal:recognize,onPage:()=>queueMicrotask(()=>{if(!wall||closed)return;scheduler.stop();scheduler.setSources(wall.frameSources());refresh();})});
    scheduler.setSources(wall.frameSources());panel.body.querySelector('[data-vision-status]').textContent=`${cameras.length} 支 CCTV，可選擇畫面辨識。`;refresh();panel.show();
  }
  function close(){closed=true;scheduler.stop();wall?.dispose();wall=null;work.clear();refresh();}
  return {show(){panel.show();},replaceCameras,hide:()=>panel.hide(),stop(){scheduler.stop();wall?.cancelRecognition();wall?.pause();},close,panel,scheduler,get active(){return !closed;},destroy(){if(destroyed)return;destroyed=true;unsubscribe?.();close();scheduler.destroy();panel.element.removeEventListener('click',click);panel.destroy();}};
}
