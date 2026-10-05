import * as Cesium from 'cesium';
import { createCinematicCamera } from './cinematicCamera.js';
import { planPath,makeLocalFlightPlan, prepareAerialFlight } from './aerialFlightPlanner.js';
import { createAerialRecording } from './aerialRecording.js';
import { AERIAL_METHOD_EXAMPLES } from './aerialMethodExamples.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Two modes share one floating manager; filming always requires a manual confirmation. */
export function createCinematicCameraPanel({viewer,manager,governor,beforeStart=()=>{},onStatus=()=>{},onAssistant=()=>{},onRecord,onDeleteRecord,cloudPlanner,listPlanningModels}){
  let panel,method,selection=null,selectionInputs=null,selectionCursor=null,selectionKind=null,drawing=false,dragging=false,points=[],line=null,prepared=null,abort=null,destroyed=false,starting=false,lastVideo=null,videoUrl=null,recordContext=null,confirmedOrigin=false,drawConfirmed=false,planning=false,repairCount=0,savingVideo=false,modelLoading=null,modelAbort=null,modelListError='',placementVersion=0,placementSampling=null,lastRefresh=0;
  const planningModels=new Map();
  const create=options=>(manager.createFloatingPanel||manager.create).call(manager,options);
  const status=message=>{onStatus(message);if(panel)panel.body.querySelector('[data-status]').textContent=message;};
  const core=createCinematicCamera({viewer,governor,beforeStart,onStatus:status,onChange:refresh,onFinished:()=>{void recorder.stop().catch(failure);}});
  const recorder=createAerialRecording({canvas:viewer.canvas,governor,onStatus:status,onComplete:saveRecording});
  const mini=document.createElement('div');mini.className='tw-aerial-mini';mini.innerHTML='<span data-mini-mode>手繪軌跡</span><button data-action="pause">⏸</button><button data-action="stop">■</button><button data-action="show">□</button>';
  panel=create({id:'cinematic-camera',title:'🎥 電影空拍觀察',width:410,height:650,minimizedContent:mini,onHelp:()=>execute('help'),onClose:closeWork});
  panel.body.innerHTML=`<style>
  .tw-aerial{display:grid;gap:8px;font-size:13px}.tw-aerial button,.tw-aerial-mini button{border:1px solid #4389a0;border-radius:6px;background:#0d2c3d;color:#e6f6ff;padding:7px 9px;font:inherit;cursor:pointer}.tw-aerial button:disabled{opacity:.45;cursor:default}.tw-aerial button[aria-pressed=true]{background:#15556c;border-color:#65dcff}.tw-aerial input,.tw-aerial textarea,.tw-aerial select{box-sizing:border-box;width:100%;min-width:0;background:#071e2b;color:#e4f7ff;border:1px solid #426273;border-radius:6px;padding:7px;font:inherit}.tw-aerial textarea{resize:vertical;min-height:110px}.tw-aerial label{display:grid;gap:4px}.tw-aerial-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.tw-aerial-video-actions{display:flex;gap:7px;flex-wrap:wrap}.tw-aerial-video-actions button{flex:1;white-space:nowrap}.tw-aerial p{margin:0;line-height:1.5;overflow-wrap:anywhere}.tw-aerial small{color:#9ebaca;line-height:1.4}.tw-aerial-mini{display:flex;gap:5px;align-items:center}.tw-aerial-mini span{flex:1}.tw-aerial [hidden]{display:none!important}.tw-aerial video{width:100%;max-height:200px;background:#000}.tw-aerial-hud{position:fixed;top:12px;right:12px;z-index:6615;color:#e2faff;background:#062132cc;border:1px solid #33819b;border-radius:6px;font:12px monospace;padding:7px 10px;pointer-events:none;max-width:65vw}.tw-aerial [data-mode="handdraw"]{border-color:#bf96ff;background:#39264e}.tw-aerial [data-mode="handdraw"][aria-pressed=true]{background:#624086}.tw-aerial [data-mode="free"]{border-color:#6be5b0;background:#163e34}.tw-aerial [data-mode="free"][aria-pressed=true]{background:#23664f}.tw-aerial-hud[hidden]{display:none}
  </style><div class="tw-aerial" data-aerial-theme="handdraw"><div class="tw-aerial-grid"><button data-mode="handdraw" aria-pressed="true">手繪空拍軌跡</button><button data-mode="free" aria-pressed="false">自由空拍</button></div>
  <div class="tw-aerial-grid"><label>離起點表面高度（公尺）<input data-setting="height" type="number" min="8" max="3000" value="80"></label><label>速度（公尺／秒）<input data-setting="speed" type="number" min="1" max="50" value="12"></label><label>碰撞安全距離（公尺）<input data-setting="margin" type="number" min="3" max="30" value="3"></label><label>影片品質<select data-setting="quality"><option value="auto">自動</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label></div>
  <div data-handdraw class="tw-aerial"><div class="tw-aerial-grid"><button data-action="draw">開始手繪軌跡</button><button data-action="confirmRoute">確認路徑</button></div><small>畫好並確認路徑後，以自述或範例規劃拍攝。先完成本機安全檢查，通過後才開放開拍。</small></div>
  <div data-free class="tw-aerial" hidden><button data-action="place">重新放置／拖曳無人機</button><button data-action="film">確認並開始拍攝</button><small>選擇自由空拍後，會在目前地圖中心表面上方放置可見機身。可點地圖或拖曳調整；按確認時先檢查起飛位置，安全才拍攝。W／S 前後、A／D 左右、I／K 升降、J／L 加速／減速；按住左鍵調整方向，Esc 停止。</small></div>
  <div class="tw-aerial-grid"><button data-action="pause">⏸ 暫停／繼續</button><button data-action="stop">■ 停止拍攝</button></div><p data-status role="status">本機空拍不需要 AI Key；地形或建物資料未知時不允許起飛。</p>
  <details data-help><summary>空拍機操控說明</summary><p>W／S：前後。A／D：左右平移。I／K：升高／下降。J／L：加速／減速。按住左鍵平滑調整方向；手繪拍攝時 Ctrl＋左鍵可調整觀看角度。Esc：停止拍攝，顯示影片預覽並儲存至記錄；按匯出影片才下載。</p><p>手繪：畫路徑 → 確認路徑 → 描述拍攝手法 → AI 修正規劃 → 安全預覽 → 開拍。自由：自動放置無人機 → 調整位置 → 確認並開始拍攝。兩模式都檢查機身安全體積、地形、已載入建物與連續移動路段；遇障礙阻擋移動，資料未知時懸停。縮小／隱藏持續拍攝；停止保留視窗；關閉停止並釋放資源。影片只包含地圖畫布，格式 WebM。</p><b>手繪空拍範例</b><ol><li>載入想觀察區域的地形與建物，畫出沿街觀察路徑並確認。</li><li>在拍攝手法視窗選擇範例或輸入描述，按「AI 修正規劃」。</li><li>按「AI 修正規劃」依描述與手繪軌跡取得計畫，本機隨後驗證；不可行時修改描述或重畫路徑再規劃。</li><li>閱讀改寫說明及安全預覽；通過才可按「開拍」。拍攝時路徑線隱藏。</li><li>完成或停止後預覽影片並儲存至記錄；預覽下方可再次匯出、儲存或刪除這支影片。</li></ol><b>自由空拍範例</b><ol><li>選擇「自由空拍」，機身自動放置在地圖中心上方；可拖曳或點選新位置。</li><li>按「確認並開始拍攝」。本機先檢查起飛位置，不安全或未知時不會開拍。</li><li>用 W／S、A／D、I／K 移動，J／L 加減速，左鍵調整朝向。</li><li>按 Esc 停止，預覽並保存本次實際路徑與影片。</li></ol></details>
  <div data-video hidden class="tw-aerial"><video controls playsinline></video><div class="tw-aerial-video-actions"><button data-action="export">匯出影片</button><button data-action="save">儲存至記錄</button><button data-action="deleteVideo">刪除影片</button></div><small data-video-note></small></div></div>`;
  method=create({id:'cinematic-camera-method',title:'🎬 拍攝手法說明',width:440,height:580,onHelp:()=>{method.body.querySelector('details').open=true;method.restore();},onClose:()=>{abort?.abort();if(!core.active){prepared=null;core.clearPreview();core.releaseScene?.();renderControls();}}});
  method.body.innerHTML=`<div class="tw-aerial" data-aerial-theme="handdraw"><label>拍攝手法範例<select data-method-example><option value="">選擇範例填入後，可自行修改</option>${AERIAL_METHOD_EXAMPLES.map(example=>`<option value="${escape(example.id)}">${escape(example.name)}</option>`).join('')}</select></label><label>描述你想拍的畫面<textarea data-description placeholder="沿路徑緩慢前進，先平視建築，再升高俯瞰整個區域。"></textarea></label><label>AI 修正使用的模型<select data-planning-model><option value="auto-free">自動選擇免費模型</option></select></label><small data-model-note>按 AI 修正規劃會依手繪軌跡與說明規劃，之後由本機檢查。</small><button data-action="cloudPlan" disabled>AI 修正規劃</button><p data-plan-result role="status">先在主視窗畫好並確認路徑。</p><button data-action="film" disabled>開拍</button><details><summary>規劃與安全說明</summary><p>範例只填入可編輯的描述。按 AI 修正規劃使用 OpenRouter 模型規劃高度、速度與觀看角度；未連接 AI 時保留本機規劃。之後由本機檢查地形、建物與連續路段。AI 只回傳固定結構資料，不執行程式碼，也不能更動已確認的手繪平面位置。按一次會自動完成最多 3 輪參數修正；每輪最多嘗試 6 個模型候選，備援只使用免費模型。地形或建物資料未知時，最多補齊圖資並重新檢查 2 次，不以 AI 猜測放行。進行中可再次按同一按鈕取消規劃；達上限仍不可行時，請更換模型、修改描述或縮短路徑後重新規劃。未知障礙資料不能由 AI 猜測通過。修正後需由使用者按「開拍」。</p></details></div>`;
  const hud=document.createElement('div');hud.className='tw-aerial-hud';hud.hidden=true;document.body.append(hud);

  const click=event=>{const mode=event.target.closest('[data-mode]')?.dataset.mode;if(mode){void setMode(mode).catch(failure);return;}const action=event.target.closest('[data-action]')?.dataset.action;if(action)void execute(action,{manual:true}).catch(failure);};
  const change=event=>{
    const target=event.target,setting=target.dataset.setting;
    if(setting){core.configure({[setting]:setting==='quality'?target.value:Number(target.value)});confirmedOrigin=false;invalidatePlan();}
    if(target.matches('[data-description]'))invalidatePlan();
    if(target.matches('[data-method-example]')){const example=AERIAL_METHOD_EXAMPLES.find(item=>item.id===target.value);if(example){method.body.querySelector('[data-description]').value=example.description;invalidatePlan();}}
    if(target.matches('[data-planning-model]')){abort?.abort();renderControls();}
  };
  panel.body.addEventListener('click',click);method.body.addEventListener('click',click);mini.addEventListener('click',click);panel.body.addEventListener('change',change);method.body.addEventListener('input',change);method.body.addEventListener('change',change);
  function failure(error){if(!destroyed&&error?.name!=='AbortError')status(error?.message||String(error));}
  function invalidatePlan(){abort?.abort();core.releaseScene?.();prepared=null;repairCount=0;core.clearPreview();renderControls();}
  function renderControls(){if(!method||!panel)return;method.body.querySelector('[data-action="cloudPlan"]').disabled=!drawConfirmed||starting;method.body.querySelector('[data-action="film"]').disabled=!prepared?.ok||planning||starting;panel.body.querySelector('[data-free] [data-action="film"]').disabled=starting||savingVideo||!core.snapshot().origin;updateModelNote();}
  function updateModelNote(){const selected=method.body.querySelector('[data-planning-model]').value||'auto-free',model=planningModels.get(selected),paid=selected!=='auto-free'&&model?.free!==true;method.body.querySelector('[data-action="cloudPlan"]').textContent=planning?'取消規劃':paid?'AI 修正規劃（可能付費）':'AI 修正規劃';method.body.querySelector('[data-model-note]').textContent=paid?`已選 ${model?.name||selected}：可能產生費用${model?.priceLabel?`（${model.priceLabel}）`:''}。按 AI 修正規劃會使用此模型；規劃後仍需本機幾何檢查。`:`已選${selected==='auto-free'?'自動免費':model?.name||selected}；只有按 AI 修正規劃才使用外部 AI。${modelListError?`模型清單暫時無法取得：${modelListError}。`:planningModels.size?`可選 ${planningModels.size} 個 OpenRouter 模型。`:''}`;}
  async function loadModels(){
    if(!listPlanningModels||modelLoading)return modelLoading;
    modelAbort?.abort();const controller=new AbortController();modelAbort=controller;
    modelLoading=(async()=>{try{const response=await listPlanningModels({signal:controller.signal});if(destroyed||controller.signal.aborted)return;const models=Array.isArray(response)?response:response?.models||[],select=method.body.querySelector('[data-planning-model]'),chosen=select.value;const ids=new Set(['auto-free']);planningModels.clear();modelListError='';const options=['<option value="auto-free">自動選擇免費模型</option>'];for(const model of models){if(typeof model?.id!=='string'||!model.id||ids.has(model.id))continue;ids.add(model.id);planningModels.set(model.id,model);options.push(`<option value="${escape(model.id)}">${escape(model.name||model.id)}${model.priceLabel?` · ${escape(model.priceLabel)}`:model.free===true?' · 免費':' · 可能產生費用'}</option>`);}select.innerHTML=options.join('');select.value=ids.has(chosen)?chosen:'auto-free';updateModelNote();}catch(error){if(!controller.signal.aborted&&!destroyed){modelListError=error.message;updateModelNote();}}finally{modelLoading=null;}})();return modelLoading;
  }
  function showMethod(){method.show();method.bringToFront();void loadModels();renderControls();}
  function releasePlacementDrag(){
    dragging=false;
    if(selectionInputs!==null&&selectionKind==='place')viewer.scene.screenSpaceCameraController.enableInputs=selectionInputs;
    if(selectionKind==='place')selectionInputs=null;
    if(selection&&selectionKind==='place')viewer.canvas.style.cursor='grab';
  }
  function selectionPointerUp(){if(selectionKind==='place')releasePlacementDrag();else if(drawing){drawing=false;if(points.length>=2)status('軌跡已畫好，請按確認路徑');}}
  function selectionEscape(event){if(event.key==='Escape'&&selection){event.preventDefault();cancelSelection();status('已取消地圖選取，原有軌跡及機身位置保留');}}
  function cancelSelection(){
    placementVersion++;
    selection?.destroy();selection=null;drawing=false;dragging=false;
    if(selectionCursor!==null)viewer.canvas.style.cursor=selectionCursor;
    selectionCursor=null;selectionKind=null;
    if(selectionInputs!==null)viewer.scene.screenSpaceCameraController.enableInputs=selectionInputs;
    selectionInputs=null;
    globalThis.window?.removeEventListener('blur',cancelSelection);
    globalThis.window?.removeEventListener('pointerup',selectionPointerUp);
    globalThis.window?.removeEventListener('pointercancel',cancelSelection);
    globalThis.window?.removeEventListener('keydown',selectionEscape);
  }
  function removeLine(){if(line)viewer.entities.remove(line);line=null;viewer.scene.requestRender();}
  function drawLine(){if(!line)line=viewer.entities.add({name:'手繪空拍軌跡',polyline:{positions:new Cesium.CallbackProperty(()=>points.map(point=>Cesium.Cartesian3.fromDegrees(...point)),false),width:3,material:Cesium.Color.CYAN}});viewer.scene.requestRender();}
  function append(pixel){const p=core.pick(pixel);if(!p)return;const c=Cesium.Cartographic.fromCartesian(p),coordinate=[Cesium.Math.toDegrees(c.longitude),Cesium.Math.toDegrees(c.latitude),c.height];if(points.length&&Cesium.Cartesian3.distance(p,Cesium.Cartesian3.fromDegrees(...points.at(-1)))<2)return;if(points.length>=1800){status('軌跡點過多，請分段拍攝');return;}points.push(coordinate);drawLine();}
  async function select(kind){
    await stop();await beforeStart();viewer.camera.cancelFlight();cancelSelection();core.clearPreview();prepared=null;confirmedOrigin=false;drawConfirmed=false;repairCount=0;selection=new Cesium.ScreenSpaceEventHandler(viewer.canvas);selectionKind=kind;selectionCursor=viewer.canvas.style.cursor||'';viewer.canvas.style.cursor=kind==='draw'?'crosshair':'grab';globalThis.window?.addEventListener('blur',cancelSelection);globalThis.window?.addEventListener('pointerup',selectionPointerUp);globalThis.window?.addEventListener('pointercancel',cancelSelection);globalThis.window?.addEventListener('keydown',selectionEscape);
    if(kind==='draw'){selectionInputs=viewer.scene.screenSpaceCameraController.enableInputs;viewer.scene.screenSpaceCameraController.enableInputs=false;selection.setInputAction(event=>{points=[];removeLine();drawing=true;append(event.position);},Cesium.ScreenSpaceEventType.LEFT_DOWN);selection.setInputAction(event=>{if(drawing)append(event.endPosition);},Cesium.ScreenSpaceEventType.MOUSE_MOVE);selection.setInputAction(()=>{drawing=false;if(points.length>=2)status('軌跡已畫好，請按確認路徑');},Cesium.ScreenSpaceEventType.LEFT_UP);}
    else{selection.setInputAction(event=>{if(isDronePick(event.position)){dragging=true;viewer.canvas.style.cursor='grabbing';selectionInputs=viewer.scene.screenSpaceCameraController.enableInputs;viewer.scene.screenSpaceCameraController.enableInputs=false;}},Cesium.ScreenSpaceEventType.LEFT_DOWN);selection.setInputAction(event=>{if(dragging)void placeAt(event.endPosition).catch(failure);},Cesium.ScreenSpaceEventType.MOUSE_MOVE);selection.setInputAction(releasePlacementDrag,Cesium.ScreenSpaceEventType.LEFT_UP);selection.setInputAction(event=>{if(!isDronePick(event.position))void placeAt(event.position).catch(failure);},Cesium.ScreenSpaceEventType.LEFT_CLICK);status(core.snapshot().origin?'機身已放置；可拖曳或點選位置，再按確認並開始拍攝':'目前中心無法取得地表位置，請點選有圖資的地點放置機身');}
    renderControls();
  }
  function isDronePick(pixel){const hits=viewer.scene.drillPick?.(pixel,5)||[viewer.scene.pick(pixel)];return hits.some(hit=>hit?.id===core.drone.entity||hit?.primitive?.id===core.drone.entity);}
  async function placeAt(pixel){
    const token=++placementVersion,wasDragging=dragging;
    const origin=core.drone.position,ray=viewer.camera.getPickRay(pixel);const p=wasDragging&&origin?Cesium.IntersectionTests.rayPlane(ray,Cesium.Plane.fromPointNormal(origin,Cesium.Cartesian3.normalize(origin,new Cesium.Cartesian3()))):core.pick(pixel);
    if(!p)return false;
    const c=Cesium.Cartographic.fromCartesian(p),provider=viewer.terrainProvider;
    let ground=viewer.scene.globe?.getHeight?.(c);
    if(!Number.isFinite(ground)&&provider?.availability){
      // Coalesce pointer moves: only the newest placement samples after the current request.
      if(placementSampling)await placementSampling.catch(()=>{});
      if(token!==placementVersion||destroyed)return false;
      const sampling=Cesium.sampleTerrainMostDetailed(provider,[Cesium.Cartographic.clone(c)]);
      placementSampling=sampling;
      try{ground=(await sampling)[0]?.height;}finally{if(placementSampling===sampling)placementSampling=null,lastRefresh=0;}
    }
    if(token!==placementVersion||destroyed||provider!==viewer.terrainProvider)return false;
    if(Number.isFinite(ground))c.height=Math.max(c.height,ground);
    if(!wasDragging)c.height+=core.snapshot().settings.height;
    core.place(Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,c.height),viewer.camera.heading);
    confirmedOrigin=false;renderControls();return true;
  }

  async function setMode(mode){if(!['handdraw','free'].includes(mode))throw new Error('請選擇手繪或自由空拍');await stop();cancelSelection();core.stop({clear:true});core.configure({mode});core.clearPreview();prepared=null;confirmedOrigin=false;drawConfirmed=false;repairCount=0;if(mode==='free'){await beforeStart();viewer.camera.cancelFlight();const center=new Cesium.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2);const placed=await placeAt(center);await select('place');if(placed)core.focusDrone?.({distance:40});}refresh();}
  async function planFlight(useCloud=false){
    useCloud=!!cloudPlanner;
    if(planning){abort?.abort();return;}if(!drawConfirmed||points.length<2)throw new Error('請先完成手繪並確認路徑');
    abort?.abort();const controller=new AbortController();abort=controller;planning=true;if(useCloud)repairCount++;else repairCount=0;prepared=null;removeLine();core.clearPreview();renderControls();const description=method.body.querySelector('[data-description]').value,model=method.body.querySelector('[data-planning-model]').value||'auto-free';method.body.querySelector('[data-plan-result]').textContent=useCloud?'正在自動規劃與修正格式，再由本機檢查地形與建物；可按取消規劃…':'正在以本機檢查地形、建物與連續路段…';
    try{const local=makeLocalFlightPlan(points,description,core.snapshot().settings);await core.prepareScene?.(planPath(local).points,{signal:controller.signal});const result=await prepareAerialFlight({coordinates:points.map(point=>point.slice()),description,settings:core.snapshot().settings,collision:core.collision,signal:controller.signal,model,cloudPlanner:useCloud?cloudPlanner:undefined,forceCloud:useCloud,onGeometryRetry:({path,signal})=>core.prepareScene?.(path.points,{signal}),onProgress:progress=>{if(!destroyed&&abort===controller)method.body.querySelector('[data-plan-result]').textContent=progress.message||`${progress.attempt?'AI 規劃後':'本機'}完整安全檢查：${Math.round(progress.progress*100)}%${progress.progress>=1?'；正在確認結果…':''}`;}});if(destroyed||abort!==controller||controller.signal.aborted)return;prepared=result;method.body.querySelector('[data-plan-result]').textContent=result.explanation;if(result.ok){core.setPlan(result);core.showPreview(result.path.points);}if(result.usedCloud)method.body.querySelector('[data-description]').value=result.plan.description;await onAssistant({content:result.explanation,plan:result.plan,validation:result.validation,corrections:result.corrections,type:'aerial-plan'});if(!destroyed&&abort===controller){method.restore();method.bringToFront();}status(result.ok?'安全檢查完成；檢視預覽後可按開拍':'尚未通過安全檢查，未允許拍攝');}
    finally{if(!prepared?.ok)core.releaseScene?.();if(abort===controller)planning=false;renderControls();}
  }
  async function begin(){
    if(starting||savingVideo)return;if(core.active){if(core.snapshot().paused){await core.play();recorder.resume();}return;}if(!recorder.available())throw new Error('此瀏覽器無法錄製 WebM');const state=core.snapshot();if(state.settings.mode==='handdraw'&&!prepared?.ok)throw new Error('請先確認規劃並通過安全檢查');starting=true;abort?.abort();const controller=new AbortController();abort=controller;renderControls();
    try{cancelSelection();removeLine();if(state.settings.mode==='free'){confirmedOrigin=false;await core.prepareScene?.([new Cesium.Cartesian3(...state.origin)],{signal:controller.signal});controller.signal.throwIfAborted();await core.confirmOrigin({signal:controller.signal});confirmedOrigin=true;}recordContext={id:crypto.randomUUID(),kind:state.settings.mode==='free'?'aerial-free':'aerial-handdraw',dateTime:new Date().toISOString(),description:method.body.querySelector('[data-description]').value,flightPlan:prepared?.plan??null,collisionCorrections:prepared?.corrections??[],collisionValidation:prepared?.validation?{status:prepared.validation.status,samples:prepared.validation.checkedSamples,terrain:prepared.validation.checkedTerrain,buildings:prepared.validation.checked3D,limitations:prepared.validation.limitations}:null,exported:false};try{controller.signal.throwIfAborted();await core.play();await recorder.start(state.settings.quality);}catch(error){recordContext.cancelled=true;core.stop();await recorder.stop();throw error;}}
    finally{starting=false;refresh();}
  }
  async function persistVideo(video){if(!onRecord)throw new Error('記錄儲存服務尚未連接，請匯出影片保存');const result=await onRecord(video);video.recorded=true;const id=typeof result==='number'?result:result?.recordId??result?.id;if(id!==undefined)video.recordId=id;return result;}
  async function saveRecording(result){
    if(recordContext?.cancelled)return;if(!result.video.size){status('錄影沒有產生畫面');return;}savingVideo=true;renderControls();
    try{const state=core.snapshot({includeTrail:true}),stamp=new Date().toISOString().replace(/[:.]/g,'-'),filename=`空拍_${stamp}.webm`,coordinates=state.trail.map(point=>point.slice(0,3));let distance=0;for(let i=1;i<coordinates.length;i++)distance+=Cesium.Cartesian3.distance(Cesium.Cartesian3.fromDegrees(...coordinates[i-1]),Cesium.Cartesian3.fromDegrees(...coordinates[i]));
      lastVideo={id:recordContext?.id||crypto.randomUUID(),kind:recordContext?.kind||'aerial-free',filename,video:result.video,exported:false,metadata:{...recordContext,shootDuration:result.duration,distance,maxHeight:coordinates.length?Math.max(...coordinates.map(point=>point[2])):null,origin:coordinates[0]||null,quality:result.quality,width:result.width,height:result.height,videoFilename:filename},geojson:{type:'FeatureCollection',features:coordinates.length>1?[{type:'Feature',properties:{name:'實際空拍路徑',times:state.trail.map(point=>point[3])},geometry:{type:'LineString',coordinates}}]:[]}};
      if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(result.video);panel.body.querySelector('video').src=videoUrl;panel.body.querySelector('[data-video]').hidden=false;
      if(onRecord){await persistVideo(lastVideo);panel.body.querySelector('[data-video-note]').textContent='影片、實際路徑與拍攝資料已儲存至記錄。請按匯出影片下載。';status('拍攝完成，已儲存至記錄，可預覽或手動匯出');}else{panel.body.querySelector('[data-video-note]').textContent='記錄服務尚未連接，影片可在此預覽並手動匯出。';status('拍攝完成；請預覽並手動匯出');}
    }catch(error){panel.body.querySelector('[data-video-note]').textContent=`本次保存未全部完成：${error.message}。可再次匯出或儲存。`;throw error;}
    finally{savingVideo=false;renderControls();}
  }
  function clearVideoPreview(){if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=null;panel.body.querySelector('video').removeAttribute('src');panel.body.querySelector('video').load();panel.body.querySelector('[data-video]').hidden=true;panel.body.querySelector('[data-video-note]').textContent='';lastVideo=null;}
  async function deleteVideo(){if(!lastVideo)throw new Error('尚無拍攝影片');if(savingVideo)throw new Error('正在保存本次影片，請稍候');const target=lastVideo;if(target.recorded){if(!onDeleteRecord)throw new Error('影片記錄刪除服務尚未連接');await onDeleteRecord({mediaId:target.id,recordId:target.recordId});}if(lastVideo===target)clearVideoPreview();status('已刪除本次影片與記錄中的影片附件');}
  async function stop(){cancelSelection();abort?.abort();core.stop();try{await recorder.stop();}catch(error){failure(error);}refresh();}
  async function closeWork(){await stop();core.stop({clear:true});removeLine();points=[];prepared=null;confirmedOrigin=false;drawConfirmed=false;method.hide();clearVideoPreview();hud.hidden=true;}
  function refresh(){if(!panel)return;const time=performance.now();if(core.snapshot().running&&time-lastRefresh<180)return;lastRefresh=time;const state=core.snapshot(),free=state.settings.mode==='free';panel.body.querySelector('.tw-aerial').dataset.aerialTheme=state.settings.mode;mini.dataset.aerialTheme=state.settings.mode;for(const container of [panel.body,mini])for(const button of container.querySelectorAll('[data-action="pause"]')){button.disabled=!state.running&&!state.paused;button.setAttribute('aria-pressed',String(!!state.paused));}panel.body.querySelector('[data-free]').hidden=!free;panel.body.querySelector('[data-handdraw]').hidden=free;for(const button of panel.body.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===state.settings.mode));mini.querySelector('[data-mini-mode]').textContent=`${free?'自由空拍':'手繪軌跡'}${state.running?' ● REC':state.paused?' 暫停':''}`;hud.hidden=!state.running;hud.textContent=`拍攝中 · 按 Esc 離開空拍模式${state.warning?' · '+state.warning:''}`;panel.setSummary(state.running?'拍攝中':state.paused?'暫停':'');renderControls();}
  async function execute(command,args={}){
    if(destroyed)throw new Error('電影空拍已關閉');switch(command){
      case 'show':panel.show();panel.bringToFront();break;case 'hide':panel.hide();break;
      case 'help':panel.restore();panel.bringToFront();{const help=panel.body.querySelector('[data-help]');help.open=true;help.scrollIntoView({block:'nearest'});}break;
      case 'mode':await setMode(args.mode);break;case 'draw':case 'drawFreehand':await setMode('handdraw');await select('draw');break;
      case 'confirmRoute':if(points.length<2)throw new Error('請先在地圖畫至少兩個不同位置');cancelSelection();drawConfirmed=true;showMethod();status('已確認軌跡，請選擇範例或描述拍攝手法');break;
      case 'method':showMethod();break;
      case 'plan':case 'cloudPlan':if(args.description){method.body.querySelector('[data-description]').value=args.description;invalidatePlan();}await planFlight(command==='cloudPlan');break;
      case 'preview':if(!prepared?.ok)throw new Error('安全檢查尚未完成');core.showPreview(prepared.path.points);break;
      case 'place':await setMode('free');break;case 'confirmOrigin':cancelSelection();await core.confirmOrigin();confirmedOrigin=true;break;
      case 'film':if(!args.manual&&!args.confirmed){panel.show();return {ok:true,needsConfirmation:true,message:'請在控制視窗按確認並開始拍攝，或檢視手繪安全預覽後按開拍'};}await begin();break;
      case 'play':case 'playFreehand':panel.show();return {ok:true,needsConfirmation:true,message:'請在控制視窗確認位置／預覽後開始拍攝'};
      case 'pause':if(core.snapshot().paused){await core.play();recorder.resume();}else{core.pause();recorder.pause();}break;
      case 'stop':await stop();break;
      case 'height':if(core.active&&core.snapshot().settings.mode==='free')return core.requestHeight(args);core.configure({height:args.value??core.snapshot().settings.height+(args.delta??20)});confirmedOrigin=false;invalidatePlan();break;
      case 'speed':core.configure({speed:args.value??core.snapshot().settings.speed*(args.factor??.7)});invalidatePlan();break;
      case 'export':if(!lastVideo)throw new Error('尚無拍攝影片');recorder.download(lastVideo.video,lastVideo.filename);lastVideo.exported=true;lastVideo.metadata.exported=true;if(onRecord)await persistVideo(lastVideo);break;
      case 'save':if(!lastVideo)throw new Error('尚無拍攝影片');await persistVideo(lastVideo);status('已儲存空拍影片與實際路徑至記錄');break;
      case 'deleteVideo':await deleteVideo();break;
      default:throw new Error('電影空拍目前支援手繪軌跡與自由空拍；請開啟控制視窗選擇');
    }return {ok:true,command};
  }
  refresh();
  return {show(){panel.show();panel.bringToFront();refresh();},hide:()=>panel.hide(),stop,execute,core,panel,method,async destroy(){if(destroyed)return;await closeWork();destroyed=true;modelAbort?.abort();core.destroy();await recorder.destroy();panel.body.removeEventListener('click',click);method.body.removeEventListener('click',click);mini.removeEventListener('click',click);panel.body.removeEventListener('change',change);method.body.removeEventListener('input',change);method.body.removeEventListener('change',change);hud.remove();panel.destroy();method.destroy();}};
}
