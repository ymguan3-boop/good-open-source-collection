import {transitResultTables} from './transitResultTables.js';
import {transitMessageIntent,rateLimitText} from './transitAssistant.js';
import {analyzeSelectedLayers,visibleAnalysisLayers} from './selectedLayerAnalysis.js';
import {analyzeRecords,textChunks} from './recordAnalysis.js';
import {createJourneyCard} from './journeyCard.js';
import {createTransitPanel} from './transitPanel.js';
import {SEAT_NAMES} from './farePreference.js';
import {createJourneyDisplay} from './journeyDisplay.js';
import './transit.css';
import {requestAiAerialPlan} from './aerialAiPlanner.js';
import {createVoiceSubtitles} from './voiceSubtitles.js';
import {cctvResultMessage,cctvContext,cctvFrameHtml} from './cctvChatResult.js';
import {createFloatingPanelManager} from './floatingPanelManager.js';
import {createCinematicCameraPanel} from './cinematicCameraPanel.js';
import './floatingPanels.css';
import {loadOsmLabels} from './osmLabels.js';
import {createCameraPath} from './cameraPath.js';
import { resolvePlace } from './places.js';
import { createChatArchive } from './chatArchive.js';
import { loadResponseStyle,saveResponseStyle } from './responseSettings.js';
import { createLabelAnnotations } from './labelAnnotations.js';
import { LABEL_FONTS,applyAnnotationLabel,normalizeLabelStyle } from './labelStyles.js';
import { configureBuildingDisplay,prepareBuildingSurface,setBuildingWhiteMode,buildingWhiteMode } from './buildingDisplay.js';
import * as Cesium from 'cesium';
import { setScopeMaskEnabled } from '../scopeMask.js';
import { importFile, addGeoJSON, updateLayerStyle } from './dataImport.js';
import { listLayers, getLayer, removeLayer, setLayerVisible, registerLayer, moveLayer } from './layerRegistry.js';
import { runBuffer, summarize, isBufferLayer, removeDuplicateBuffers } from './analysis.js';
import { exportProject, importProject, saveProject } from './projectManager.js';
import { suggestTopics, planAnalysis } from './ai.js';
import { PROFILES } from './resourceGovernor.js';
import { checkCctvFreshness, checkOsmFreshness } from './liveDataHealth.js';
import {loadVoiceSettings,saveVoiceSettings,normalizeVoiceSettings} from './voiceSettings.js';
import { createGeminiLiveController } from './geminiLive.js';
import { createFlightObservation } from './flightObservation.js';
import { createLayerVoiceActions } from './layerVoiceActions.js';
import { BUILTIN_LAYER_CATALOG, OFFICIAL_TAIWAN_VECTOR_REFERENCES, loadBuiltinLayer, loadScopedBuiltinLayer, loadAllBuiltinLayers, currentBuiltinStatus, assertBuiltinLoadExtent } from './builtinLayers.js';
import { createNavigationController } from './navigation.js';
import { VEHICLE_COLORS } from './navigationDisplay.js';
import { integrateProviderSettings } from './providerSettings.js';
import { browserAi, streamBrowserChat } from './browserAi.js';
import { db } from './db.js';
import { renderChatMarkdown } from './chatFormat.js';
import { createCctvWall } from './cctvWall.js';
import { drawingInputs,attachDrawingInput,confirmDrawingInputs,invalidateDrawing,analyzeDrawingInputs } from './drawingInputs.js';
import { createDrawingController } from './drawing.js';
import { importDtmCsv, loadBundledDtm, loadNlscBuildings, loadNationalReferenceMap } from './officialTerrain.js';
import { describeLayer, buildSpatialContext } from './spatialContext.js';
import { ensureCounties,dataScope,setDataScope,scopeLabel,scopeBounds,scopeGeometry,countyNames,filterToCounty } from './dataScope.js';
import { loadWorldTerrain,loadTomtomFlow } from './serviceLayers.js';
import { loadTaiwanRelief } from './taiwanRelief.js';
import { liveDescription } from './liveDescription.js';
import { readRuntimeConfig } from './runtimeConfig.js';
import { VOICE_ROLES } from './voiceProfiles.js';
import { createApplicationRestart,requiresApplicationRestart } from './applicationRestart.js';
import { createDefaultMapSources } from '../maps/defaultSources.js';

const TAIWAN_COUNTIES = [
  ['臺北市',25.0375,121.5637],['新北市',25.012,121.465],['桃園市',24.9937,121.301],
  ['臺中市',24.163,120.647],['臺南市',22.9997,120.227],['高雄市',22.6273,120.3014],
  ['基隆市',25.1283,121.7419],['新竹市',24.8066,120.9686],['嘉義市',23.4801,120.4491],
  ['宜蘭縣',24.757,121.753],['新竹縣',24.839,121.013],['苗栗縣',24.56,120.821],
  ['彰化縣',24.074,120.54],['南投縣',23.915,120.684],['雲林縣',23.709,120.431],
  ['嘉義縣',23.459,120.294],['屏東縣',22.668,120.486],['臺東縣',22.756,121.145],
  ['花蓮縣',23.991,121.611],['澎湖縣',23.568,119.566],['金門縣',24.436,118.319],
  ['連江縣',26.16,119.95],
];

export function mountShell({ viewer, governor, styleManager, dataManager, mapStackController, stopLegacyWork=async()=>{} }) {
  const root = document.createElement('div');
  root.id = 'tw-shell';
  root.innerHTML = `
    <header class="tw-topbar">
      <div class="tw-brand tw-brand-banner" aria-label="上帝之眼・魔改台灣版，魔改人官sir"><img class="tw-brand-title-img" src="/branding/title-art-user-v4.png" alt="上帝之眼・魔改台灣版，魔改人官sir"></div>
      <div class="tw-quick-menu">
        <button class="tw-quick-trigger" data-act="quick-toggle" aria-label="展開快捷功能" aria-expanded="false" title="展開快捷功能">${quickGearIcon()}</button>
        <div class="tw-quick-palette" id="tw-quick-palette" hidden aria-label="快捷功能">
          <div class="tw-quick-head"><img src="/branding/quick-menu-logo-user.png" alt="上帝之眼台灣版"><button type="button" data-act="quick-toggle" aria-label="收合快捷功能" title="收合快捷功能">${quickGearIcon()}</button></div>
          <div class="tw-quick-grid">
          <button data-act="global" title="全球視角 G"><img src="/branding/ui-icons/global.png" alt=""><span>全球</span></button>
          <button data-act="taiwan" title="台灣視角 T"><img src="/branding/ui-icons/taiwan.png" alt=""><span>台灣</span></button>
          <button data-act="save" title="儲存目前狀態"><img src="/branding/ui-icons/results.png" alt=""><span>儲存</span></button>
          <button data-act="settings" title="設定"><img src="/branding/ui-icons/legacy.png" alt=""><span>設定</span></button>
          <button data-act="shortcuts" title="查看快捷鍵"><img src="/branding/ui-icons/shortcut-v5.png" alt=""><span>快捷鍵</span></button>
          </div>
        </div>
      </div>
    </header>
    <button class="tw-toolbar-toggle" data-sprite="toggle" data-act="toolbar-toggle" aria-expanded="true" title="隱藏工具列"><span>工具列</span></button>
    <nav class="tw-nav" aria-label="主功能">
      <img class="tw-nav-art" src="/branding/sidebar-user.png" alt="">
      ${nav('project','project','專案')}
      ${nav('layers','layers','圖資')}
      ${nav('analysis','analysis','分析')}
      ${nav('ai-status','ai','AI')}
      <span class="tw-ai-unread-badge" data-chat-unread hidden></span>
      ${nav('notes','notes','標註')}
      ${nav('results','results','記錄')}
      <span class="tw-spacer"></span>
      ${nav('legacy','legacy','原版UI')}
    </nav>
    <aside class="tw-drawer" hidden>
      <div class="tw-drawer-head"><h2></h2><button data-act="close-drawer">×</button></div>
      <div class="tw-drawer-body"></div>
    </aside>
    <div class="tw-loading" role="status" aria-live="polite" hidden><span class="tw-loading-spinner" aria-hidden="true"></span><span data-loading-message>圖資載入中…</span></div>
    <section class="tw-resources" data-act="resources" title="系統資源與效能控管">
      <div><span>RAM</span><b data-r="ram">--</b></div>
      <div><span>Swap</span><b data-r="swap">--</b></div>
      <div><span>GPU</span><b data-r="gpu">--</b></div>
      <div><span>VRAM</span><b data-r="vram">--</b></div>
      <i data-r="pressure"></i>
    </section>
    <section class="tw-model-bar" aria-label="目前使用的 AI 模型">
      <label for="tw-active-model">目前模型</label>
      <select id="tw-active-model" aria-label="切換 AI 對話模型"><option value="">載入模型中…</option></select>
      <button data-act="model-refresh" title="重新取得最新免費模型清單" aria-label="更新最新免費模型">↻</button>
      <button data-act="chat-toggle" class="tw-chat-open" title="開啟或關閉 AI 對話" aria-expanded="false">對話 <span data-chat-unread hidden></span></button>
    </section>
    <aside class="tw-chat-panel" hidden aria-label="AI 空間助理對話">
      <div class="tw-chat-panel-head"><b>AI 空間助理</b><button data-act="chat-save" title="儲存目前對話為 Markdown">儲存對話</button><button data-act="chat-clear" title="清除當前所有對話內容">清除</button><button data-act="chat-style" title="自訂 AI 對話風格">風格</button><button data-act="chat-size" aria-label="切換大型對話窗">↗</button><button data-act="chat-toggle" aria-label="關閉對話">×</button></div>
      <section class="tw-chat-style" hidden><label>自訂 AI 對話風格<textarea id="tw-response-style" maxlength="2000" rows="3" placeholder="例如：用繁體中文，先講結論，再列三點具體建議。"></textarea></label><div class="tw-actions"><button data-act="chat-style-save">儲存風格</button><button data-act="chat-style-reset">重訂風格</button></div><small>保存於瀏覽器及本機使用者設定；重啟後沿用此風格，資料正確性規則仍適用。</small></section><div class="tw-chat-thread" id="tw-chat-thread" role="log" aria-live="polite"></div>
      <div class="tw-chat-compose"><textarea id="tw-chat-input" rows="2" maxlength="4000" placeholder="輸入訊息，Enter 傳送" aria-label="輸入 AI 對話訊息"></textarea>
        <div class="tw-chat-controls"><button data-act="chat-send" type="button">傳送</button></div>
      </div><button class="tw-chat-resize" aria-label="拖曳調整對話視窗大小" title="拖曳調整大小">◢</button><div id="tw-chat-status" class="tw-note" role="status">選擇模型後即可對話。拖曳左下角可調整視窗大小。</div>
    </aside>
    <div class="tw-voice-panel" aria-label="語音、定位與視覺預設">
      <img src="/branding/voice-control-panel-transparent-v4.png" alt="科技風語音、位置定位與視覺預設操作盤">
      <button class="tw-voice-location" data-act="taiwan-location" title="位置定位" aria-label="位置定位"></button>
      <button class="tw-voice-presets" data-act="taiwan-presets" title="視覺預設" aria-label="視覺預設"></button>
      <button class="tw-voice-mic" data-act="gemini-live-toggle" title="啟動 Gemini Live 語音助理" aria-label="啟動 Gemini Live 語音助理" aria-pressed="false"></button>
    </div>
    <section class="tw-navigation-card" hidden aria-label="行車路線摘要"><p data-route-summary></p><p data-route-motion role="status"></p><div class="tw-actions"><button data-act="route-show">整條路線</button><button data-act="nav-preview">行進示意</button><button data-act="nav-drive">行車視角沿路線</button><button data-act="nav-stop">停止</button><button data-act="route-clear">關閉路線</button></div></section>
    <button class="tw-return-ui" data-act="legacy" title="返回台灣版介面">返回台灣版 UI</button>
    <input type="file" id="tw-file-input" hidden accept=".geojson,.json,.zip,.kml,.kmz,.czml" />
    <input type="file" id="tw-dtm-input" hidden accept=".csv,text/csv" />
    <input type="file" id="tw-project-input" hidden accept=".json,application/json" />`;
  document.body.appendChild(root);

  const drawer = root.querySelector('.tw-drawer');
  const body = root.querySelector('.tw-drawer-body');
  const floatingPanels=createFloatingPanelManager({host:root});
  const drawerWindow=floatingPanels.enhanceExisting(drawer,{id:'toolbar-options',handle:drawer.querySelector('.tw-drawer-head'),closeButton:drawer.querySelector('[data-act="close-drawer"]')});
  const originalChatPanel=root.querySelector('.tw-chat-panel');
  const assistantWindow=floatingPanels.create({id:'ai-assistant',title:'AI 空間助理',width:570,height:570,onClose:()=>{chatController?.abort();}});
  const chatPanel=assistantWindow.element;chatPanel.classList.add('tw-chat-panel','tw-chat-managed');
  originalChatPanel.querySelector('.tw-chat-panel-head b').remove();
  for(const button of originalChatPanel.querySelectorAll('[data-act="chat-size"],[data-act="chat-toggle"],.tw-chat-resize'))button.remove();
  assistantWindow.body.append(...originalChatPanel.childNodes);originalChatPanel.remove();assistantWindow.body.insertAdjacentHTML('beforeend','<details><summary>操作方式與提問範例</summary><ul><li>輸入訊息後按 Enter 傳送；Shift＋Enter 換行。</li><li>可詢問目前專案、可見圖資、量測結果及交通旅程。</li><li>例如：分析目前圖層、採用建議 1、依最新資訊重新規劃。</li><li>儲存對話可匯出記錄；清除重設對話；風格設定保存於本機。</li><li>規劃期間會回報階段進度；班次及票價依可驗證的資料顯示。</li></ul></details>');
  chatPanel.querySelector('#tw-chat-status').textContent='可拖曳標題列、縮小／展開；右下角調整大小，? 查看功能及說明。';
  let cctvPreview=null;
  const providerSettings = integrateProviderSettings({manager:floatingPanels,onRestartRequired:names=>requiresApplicationRestart(names)?applicationRestart.request('map-key-change'):Promise.resolve()});
  let batchProgress = '';
  let activeProject = null;
  let expandedDrawingId = null;
  const collapsedGroups = new Set();
  try {for(const key of JSON.parse(localStorage.getItem('gev.tw.collapsedGroups') || '[]'))collapsedGroups.add(key);}catch{}
  let inputCandidates = new Map();
  let chatGeneration = 0;
  let responseStyle='',styleRevision=0;
  const responseStyleReady=loadResponseStyle().then(value=>{if(!styleRevision){responseStyle=value;chatPanel.querySelector('#tw-response-style').value=value;}}).catch(error=>console.warn('風格讀取失敗',error.name));
  const disposeBuildingDisplay=configureBuildingDisplay(viewer,mapStackController,{governor});
  let routeInputs={origin:'',destination:'',waypoints:[],travelMode:'car'};
  const routeCandidates=new Map();
  let drawingFrame={strokeEnabled:true,stroke:'#ffca55',strokeWidth:3};
  try {drawingFrame={...drawingFrame,...JSON.parse(localStorage.getItem('gev.tw.drawingFrame') || '{}')};}catch{}
  let focusLayer = null;
  let analysisSession=null,analysisSequence=0;
  const analysisSessions=new Map();
  let analysisTarget = null;
  let batchRunning = false;
  let singleLoadingId = null;
  const layerErrors = new Map();
  let nlscServices = [];
  let selectedNlscUrl = '';
  let nlscNotice = '尚未查詢官方服務清單。';
  let nationwideBuildingsEnabled = false;
  let buildingLoadPending = false;
  let automaticBuildingLoad = null;
  let lastBuildingAttemptUrl = '';
  const removeBuildingMoveListener = viewer.camera.moveEnd.addEventListener(() => {
    if (nationwideBuildingsEnabled) void loadBuildingForView().catch(error => { nlscNotice = `3D 建物載入失敗：${error.message}`; });
  });
  let activeLoad = null;
  let workEpoch = 0;
  let aiPending = false;
  let chatBusy = false;
  let chatController = null;
  let aiStreaming = false;
  let drawingColors = {};
  try { drawingColors = JSON.parse(localStorage.getItem('gev.tw.drawingColors') || '{}'); } catch {}
  let chatUnread = 0;
  const chatMessages = [];
  let chatContextStartIndex = 0;
  let lastGeminiStatus = '尚未啟動';
  const title = root.querySelector('.tw-drawer h2');
  const cctvWall=createCctvWall({viewer,root,manager:floatingPanels,governor,beforeSelect:async()=>{cinematic.stop();drawing.cancel();labels.cancel();cameraPath.cancel();await flightObservation.stop();navigation.stopNavigation();},onAnalyze:analyzeCctvFrame,onResult:displayCctvResult,onError:displayCctvError,onChange:(message,state)=>{const status=body.querySelector('#tw-cctv-selection-status');if(status)status.textContent=message;const confirm=body.querySelector('[data-act="cctv-wall-confirm"]');if(confirm)confirm.disabled=!state.count;}});
  const drawing = createDrawingController(viewer, result => {
    lastDrawingResult = result;
    if(result.layerId)expandedDrawingId=result.layerId;
    if(Number.isFinite(result.radiusMeters)){const radius=body.querySelector('#tw-circle-radius');if(radius)radius.value=result.radiusMeters.toFixed(1);}
    if (!drawer.hidden && title.textContent === '標註與量測') renderDrawingResult(result);
  });
  const cameraPath=createCameraPath({viewer,onStatus:message=>{lastDrawingResult={mode:'camera',status:message};const status=root.querySelector('#tw-camera-path-status');if(status)status.textContent=message;toast(message);}});
  const labels=createLabelAnnotations({viewer,onResult:result=>{lastDrawingResult=result;if(!drawer.hidden && title.textContent==='標註與量測')renderDrawingResult(result);}});
  const resizeMapAfterDrawer = () => requestAnimationFrame(() => {
    viewer.resize();
    viewer.scene.requestRender();
  });
  const open = (name, html) => { if(name!=='分析')cctvWall.hideMarkers();const newWindow=drawer.hidden || title.textContent!==name;title.textContent = name; body.innerHTML = html; if(newWindow)drawerWindow.restore();else drawerWindow.show();drawer.classList.toggle('tw-drawer-compact', name === '快捷鍵'); root.classList.toggle('tw-cctv-open', name === '台灣國道 CCTV'); resizeMapAfterDrawer(); };
  const close = () => { cctvWall.hideMarkers();const stream = body.querySelector('#tw-cctv-live-image'); if (stream) stream.removeAttribute('src'); drawer.hidden = true; root.classList.remove('tw-cctv-open'); resizeMapAfterDrawer(); };
  let toastTimer=null;
  const toast = (msg) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    clearTimeout(toastTimer);t.classList.add('visible');
    toastTimer=setTimeout(() => t.classList.remove('visible'), 5000);
  };
  function showLoading(message, controller) {
    if(typeof message!=='string' || !controller?.signal)throw new Error('載入提示參數不正確');
    activeLoad?.abort();
    activeLoad = controller;
    const indicator = root.querySelector('.tw-loading');
    indicator.querySelector('[data-loading-message]').textContent = message;
    indicator.hidden = false;
  }
  function hideLoading(controller) {
    if (activeLoad !== controller) return;
    activeLoad = null;
    root.querySelector('.tw-loading').hidden = true;
  }
  function setQuickMenuOpen(open) {
    root.querySelector('#tw-quick-palette').hidden = !open;
    const trigger = root.querySelector('.tw-quick-trigger');
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? '收合快捷功能' : '展開快捷功能');
    trigger.title = open ? '收合快捷功能' : '展開快捷功能';
  }
  const chatArchive=createChatArchive({root,open,download,manager:floatingPanels,onAnalyze:records=>runIntegratedAnalysis({type:'records',records}),onStatus:message=>{toast(message);chatStatus(message);}});

  async function stopAllWork({keepVoice=false}={}) {
    if(!keepVoice)voiceControlEpoch++;
    await flightObservation.stop();
    cctvWall.stop();
    const wasRunning = !!activeLoad || batchRunning || !!geminiLive.active || !!navigation.active || aiPending;
    workEpoch++;
    chatController?.abort();
    drawing.cancel();labels.cancel();cameraPath.cancel();cinematic.stop();journey.stop();journeyCard?.hide();transit.cancel?.();
    activeLoad?.abort();
    automaticBuildingLoad?.abort();
    viewer.camera.cancelFlight();
    await Promise.allSettled([keepVoice ? Promise.resolve() : geminiLive.stop(), navigation.stopNavigation(),stopLegacyWork()]);
    batchProgress = wasRunning ? '已停止目前可中止的工作' : '目前沒有執行中的工作';
    const status = body.querySelector('#tw-layer-load-status');
    if (status) status.textContent = batchProgress;
    toast(batchProgress);
  }

  let resetting=false;
  let mapKeySignature=null;
  const startupEpoch=workEpoch,startupBasemapId=mapStackController?.getActiveId();void syncMapKeys().then(async()=>{if(workEpoch!==startupEpoch||mapStackController?.getActiveId()!==startupBasemapId)return;const state=await mapStackController?.setStack('photoreal');if(state?.activeId!=='photoreal')throw new Error(state?.lastError || 'Google 擬真 3D 初始底圖無法載入，請檢查金鑰');const host=mapStackController.getImageryHostTileset();if(host)host.show=true;viewer.scene.globe.show=false;viewer.scene.requestRender();}).catch(error=>toast(error.message));
  async function syncMapKeys(){
    if(!mapStackController?.updateSources)return;
    const runtime=await readRuntimeConfig();
    const signature=JSON.stringify([runtime.cesiumIonToken||'',runtime.googleMapsApiKey||'']);
    if(signature===mapKeySignature)return;
    await mapStackController.updateSources(createDefaultMapSources({googleTileset:mapStackController.getImageryHostTileset(),cesiumToken:runtime.cesiumIonToken,googleApiKey:runtime.googleMapsApiKey}));
    mapKeySignature=signature;
  }
  const onKeysChanged=event=>{if(requiresApplicationRestart(event.detail?.names || []))return;void (async()=>{
    await syncMapKeys();
    if(!drawer.hidden && title.textContent==='圖資')renderLayers();
    const names=event.detail?.names || [];
    if(!names.length || names.some(name=>['gemini','GEMINI_API_KEY'].includes(name)))await applyVoiceSettings();
  })().catch(error=>toast(`設定已保存，套用失敗：${error.message}`));};
  window.addEventListener('gev-tw:keys-changed',onKeysChanged);
  const applicationRestart=createApplicationRestart({
    onStatus:toast,
    checkpoint:async()=>{
      const layers=listLayers();
      if(layers.length){
        const snapshot=await exportProject({name:activeProject?.name || '重新啟動前工作區',viewer,layers,metadata:activeProject?.metadata || {}});
        const manifest=JSON.parse(await snapshot.text());
        await db.settings.put({key:'restartProjectSnapshot',value:manifest,updatedAt:new Date().toISOString()});
        await chatArchive.save([{role:'system',content:'地圖服務金鑰已變更，已自動保存重新啟動前的工作區。原圖資來源與相機保留於附加 JSON；於記錄匯出後可用專案開啟。'}],{title:'重新啟動前工作區',attachments:[{filename:'restart-project.json',content:manifest}]});
      }
      if(chatMessages.length)await chatArchive.save(chatMessages);
    },
    stop:()=>stopAllWork()
  });
  const onCaptureUi=event=>document.body.classList.toggle('gev-tw-aerial-capture',event.detail?.active===true);
  window.addEventListener('gev-tw:aerial-capture-ui',onCaptureUi);

  async function resetAllFunctions(){
    if(resetting)return;resetting=true;
    try{
      await stopAllWork();navigation.clearRoute();await stopProjectFeeds('user');
      for(const layer of listLayers())setLayerVisible(layer.id,false);
      viewer.trackedEntity=undefined;
      await stopLegacyWork({reset:true});
      viewer.terrainProvider=new Cesium.EllipsoidTerrainProvider();
      close();if(!chatPanel.hidden)toggleChat();setQuickMenuOpen(false);syncVoiceState();setLegacyMode(false);setScopeMaskEnabled(false);
      viewer.scene.globe.show=false;
      await syncMapKeys();
      if(!await hasApiKey('GOOGLE_MAPS_API_KEY') && !await hasApiKey('CESIUM_ION_TOKEN'))throw new Error('未輸入金鑰；其他功能已關閉，Google 擬真 3D 尚無法開啟');
      await mapStackController.setStack('photoreal');
      if(mapStackController.getActiveId()!=='photoreal')throw new Error('其他功能已關閉；Google 擬真 3D 載入失敗，請檢查服務金鑰');
      const host=mapStackController.getImageryHostTileset();if(host)host.show=true;
      viewer.scene.globe.show=false;viewer.scene.requestRender();toast('所有功能已關閉；僅保留 Google 擬真 3D 底圖');
    }finally{resetting=false;}
  }
  const navigation = createNavigationController({
    viewer,
    beforeCamera:()=>{cinematic.stop();journey.stop();},
    onPick:info=>{if(info||routeInfoType==='driving')showRouteInfo(info);},
    onRoute:summary=>{const card=root.querySelector('.tw-navigation-card');card.hidden=!summary;if(summary)card.querySelector('[data-route-summary]').textContent=`起點：${summary.origin} → 終點：${summary.destination}｜${(summary.lengthMeters/1000).toFixed(1)} 公里｜預估 ${Math.max(1,Math.ceil(summary.travelTimeSeconds/60))} 分鐘${summary.trafficDelaySeconds ? `（交通延誤約 ${Math.ceil(summary.trafficDelaySeconds/60)} 分鐘）` : ''}`;},
    onStatus:(message) => {
      const el = root.querySelector('#tw-navigation-status');
      if (el) el.textContent = message;
      root.querySelector('[data-route-motion]').textContent=message;
    },
  });

  let journeyInfo=null,journeyCard=null,routeInfoType=null;
  function showRouteInfo(info){
    if(!info){journeyInfo?.hide();return;}
    routeInfoType=info.type;
    journeyInfo??=floatingPanels.create({id:'transit-segment-info',title:'路線與旅程資訊',width:430,height:430});
    journeyInfo.body.innerHTML=info.html;journeyInfo.restore();
  }
  const journey=createJourneyDisplay({viewer,governor,beforeCamera:()=>{cinematic.stop();cameraPath.stop();navigation.stopNavigation();viewer.trackedEntity=undefined;},onStatus:status=>{transit.updateJourney(status);journeyCard?.update(status);},onPick:info=>{
    if(!info&&routeInfoType!=='transit')return;
    showRouteInfo(info);
  }});
  journeyCard=createJourneyCard({manager:floatingPanels,controller:journey,onError:error=>toast(error.message)});
  let transitProgressMessage=null;
  function transitProgress({busy,message}){
    if(busy)analysisSession=null;
    if(busy){if(!transitProgressMessage){transitProgressMessage={role:'assistant',content:message,stages:[]};chatMessages.push(transitProgressMessage);}const stages=transitProgressMessage.stages||(transitProgressMessage.stages=[]);if(stages.at(-1)!==message)stages.push(message);transitProgressMessage.content=stages.slice(-12).join('\n\n');showAssistant();}
    else {if(transitProgressMessage){transitProgressMessage.content=[...(transitProgressMessage.stages||[]),message].join('\n\n');transitProgressMessage=null;}renderChatMessages();}
    chatStatus(message);
  }
  async function runTransitInteraction(action,content){
    if(chatBusy||transit.busy){chatStatus('目前運輸查詢仍在執行，完成或失敗會自動回報。');return;}
    chatBusy=true;chatMessages.push({role:'user',content});renderChatMessages();
    try{const result=await action();if(result?.needsConfirmation)chatStatus('請點選下方建議，或回覆「按你建議執行／採用建議1、2、3」。');}
    catch(error){chatMessages.push({role:'system',content:'旅程執行未完成：'+error.message});chatStatus(error.message);}
    finally{if(transitProgressMessage){transitProgressMessage.content=transit.recovery?'查核已完成，請確認下方修正建議。':'本次查詢已結束，結果已自動回報。';transitProgressMessage=null;}chatBusy=false;renderChatMessages();}
  }
  const transit=createTransitPanel({manager:floatingPanels,viewer,getDrivingColor:()=>navigation.routeStyle.color,onPlan:async(plan,options)=>{await journey.load(plan,options);journey.setView('overview');if(options.execute){journeyCard.show(plan);try{journey.play();return {animationStarted:true};}catch(error){toast(error.message);return {animationStarted:false,animationNotice:error.message};}}},onProgress:transitProgress,onExplain:async (result,{signal}={})=>{
    const message={role:'assistant',content:transitSummary(result),tripResult:result,serviceLimits:result.serviceStatus?.limits|| (result.serviceError?.rateLimit?[result.serviceError.rateLimit]:[])};const prior=result.conclusion&&result.offerId?chatMessages.findLast(m=>m.tripResult?.conclusion&&m.tripResult.offerId===result.offerId):null;if(prior)Object.assign(prior,message);else chatMessages.push(message);showAssistant();chatStatus(result.needsClarification?'請先確認車種或旅程條件，再繼續規劃。':result.plans?.length?'已取得公共運輸規劃，可繼續修改旅程或儲存對話。':'目前沒有符合條件的可靠方案，請調整需求後重查。');
    // The verified plan is usable immediately; optional model commentary does
    // not hold the main planning button. Editing/closing aborts this signal.
    if(result.question&&!result.conclusion)void explainTransit(result,{signal}).catch(()=>{});
  },onRecovery:proposal=>{if(transitProgressMessage){transitProgressMessage.content=[...(transitProgressMessage.stages||[]),'本階段查核已結束，請確認下方修正建議。'].join('\n\n');transitProgressMessage=null;}chatMessages.push({role:'assistant',content:proposal.content,transitRecovery:proposal});showAssistant();renderChatMessages();chatStatus('請確認三點修正建議之一，確認前不會重新規劃。');},onError:error=>{toast(error.message||String(error));}});
  transit.setJourneyController(journey);
  function transitSummary(result){
    const fareInfo=s=>{
      const fare=s.fare,lookup=s.fareLookup;
      if(!fare||!Number.isFinite(fare.amount))return '目前無法取得可靠的最新票價資料。'+(lookup?.sourceUrl?`；[${lookup.source}](${lookup.sourceUrl})（未納入總票價）`:'');
      const quotes=fare.quotes?.length?fare.quotes:[fare];
      const details=quotes.map(q=>`${q.ticketType||fare.ticketType||''}${q.quantity?` × ${q.quantity}`:''}：${Number.isFinite(q.amount)?`NT$${q.amount}`:'無可靠資料'}${q.sourceUrl?`；[${q.source||'官方票價'}](${q.sourceUrl})`:''}；資料更新 ${q.sourceUpdatedAt||q.sourceTime||'官方未提供'}；最後驗證 ${q.fetchedAt||'未提供'}${q.effectiveFrom?`；票價生效 ${q.effectiveFrom}`:''}${q.estimated?'；【估算】'+(q.estimateBasis||'依據未提供'):''}${q.notice?`；${q.notice}`:''}`).join('；');
      const alternatives=fare.alternatives?.length>1?'；車廂比較：'+fare.alternatives.map(c=>`${SEAT_NAMES[c.seatClass]||c.seatClass} ${c.complete?`NT$${c.amount}`:'未取得可靠票價'}`).join('、'):'';
      return `${fare.estimated?'估算小計':'小計'} NT$${fare.amount}；${details}${alternatives}${fare.notice?`；${fare.notice}`:''}`;
    };
    return transitResultTables(result,fareInfo);
  }

  async function explainTransit(result,{signal}={}){
    if(!result.plans?.length || chatBusy || signal?.aborted || !(await hasApiKey('openrouter')))return;
    signal?.throwIfAborted();const generation=chatGeneration;chatBusy=true;chatController=new AbortController();const comparisonSignal=signal?AbortSignal.any([signal,chatController.signal]):chatController.signal;let draft=null;
    try{const answer=await streamBrowserChat({model:selectedModel()||'openrouter/free',messages:[{role:'user',content:'請只比較目前已取得的公共運輸方案，說明推薦、最快及最便宜（票價完整才可比較），描述轉乘風險與缺漏。不得補造班次、票價、路徑或即時位置；不要聲稱已執行地圖操作。'}],context:{tripRequest:result.request,plans:result.plans},responseStyle},{signal:comparisonSignal,onDelta:text=>{if(generation!==chatGeneration)return;if(!draft){draft={role:'assistant',content:''};chatMessages.push(draft);}draft.content=text;renderChatMessages();}});if(generation===chatGeneration && draft)draft.content=answer.content;}
    catch(error){if(generation===chatGeneration&&draft)chatMessages.splice(chatMessages.indexOf(draft),1);if(generation===chatGeneration&&error.name!=='AbortError')chatMessages.push({role:'system',content:`方案資料已取得；AI比較暫時不可用：${error.message}`});}
    finally{if(generation===chatGeneration){chatBusy=false;chatController=null;renderChatMessages();}}
  }
  navigation.attachCard(root.querySelector('.tw-navigation-card'));
  const flightObservation = createFlightObservation({root,viewer,dataManager,styleManager,beforeCamera:()=>{cinematic.stop();journey.stop();},onStatus:toast});
  const cinematic=createCinematicCameraPanel({viewer,manager:floatingPanels,governor,freehand:cameraPath,beforeStart:async()=>{drawing.cancel();labels.cancel();cctvWall.hideMarkers();cameraPath.stop();journey.stop();await flightObservation.stop();navigation.stopNavigation();await stopLegacyWork();viewer.trackedEntity=undefined;},getLines:()=>{
    const lines=[];
    if(navigation.currentRoute)lines.push({id:'current-route',name:'目前 TomTom 行車路線',coordinates:navigation.currentRoute.coordinates});
    lineCatalog: for(const layer of listLayers()){if(layer.visible===false)continue;for(const [index,feature] of (layer.geojson?.features||[]).entries()){if(lines.length>500)break lineCatalog;const g=feature.geometry;if(g?.type==='LineString')lines.push({id:`${layer.id}:${index}`,name:`${layer.name}｜${feature.properties?.name||index+1}`,coordinates:g.coordinates});if(g?.type==='MultiLineString')for(const [part,coords] of g.coordinates.entries())lines.push({id:`${layer.id}:${index}:${part}`,name:`${layer.name}｜${feature.properties?.name||index+1} (${part+1})`,coordinates:coords});}}
    return lines;
  },listPlanningModels:({signal}={})=>browserAi('/planning-models',{signal}),onDeleteRecord:({mediaId})=>chatArchive.removeVideo(mediaId),cloudPlanner:planAerialWithAi,onAssistant:message=>{chatMessages.push({role:"assistant",content:message.content});showAssistant();},onRecord:saveAerialRecord,onStatus:toast});
  const aircraftCard=root.querySelector('.tw-aircraft-card');
  if(aircraftCard)floatingPanels.enhanceExisting(aircraftCard,{id:'aircraft-observation',handle:aircraftCard.querySelector('[data-aircraft-label]'),onClose:()=>flightObservation.stop()});
  const routeCard=root.querySelector('.tw-navigation-card');
  if(routeCard)floatingPanels.enhanceExisting(routeCard,{id:'navigation-summary',handle:routeCard.querySelector('[data-navigation-drag-handle]'),onClose:()=>navigation.clearRoute()});
  // Explicit host methods are shared by voice commands and the toolbar loaders.
  const layerActions = createLayerVoiceActions({builtinCatalog:BUILTIN_LAYER_CATALOG,dataManager,mapStackController,viewer,adapters:{
    getScope:dataScope,
    onActionStart:({message})=>geminiLive.announce(message),
    focusScope:async(scope,{signal})=>{await ensureCounties();signal?.throwIfAborted();const b=scope.mode==='county'?scopeBounds(scope.county):{west:117.8,south:21.6,east:122.3,north:26.5};await new Promise(resolve=>viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(b.west,b.south,b.east,b.north),duration:.8,complete:resolve,cancel:resolve}));signal?.throwIfAborted();},
    setScope:async(scope,{signal})=>{signal?.throwIfAborted();await setDataScope(scope.mode,scope.county || dataScope().county);signal?.throwIfAborted();await focusScope();},
    supportsBuildingCounty:async(county,{signal})=>{if(!nlscServices.length)await discoverNlsc({signal});signal?.throwIfAborted();const text=county.replace(/臺/g,'台');return nlscServices.some(item=>item.name.replace(/臺/g,'台').startsWith(text));},
    loadBuiltin:(id,options)=>doLoadBuiltin(id,{...options,strict:true}),
    loadService:loadVoiceService,
    connectCustom:async(layer,{signal})=>{signal?.throwIfAborted();await connectPendingLayer(layer,{signal});signal?.throwIfAborted();},
    setBasemap:setVoiceBasemap,
    setLive:async(id,visible,{signal,refresh})=>{
      signal?.throwIfAborted();
      if(visible && id==='ais-live-vessels' && !await hasApiKey('AISSTREAM_API_KEY'))throw new Error('未輸入金鑰');
      if(visible && id==='local-firms' && !await hasApiKey('FIRMS_MAP_KEY'))throw new Error('未輸入金鑰');
      if(visible)await ensureCounties();
      signal?.throwIfAborted();
      if(id==='flights' && (!visible || refresh))await flightObservation.stop();
      if(refresh && dataManager.isEnabled(id))await dataManager.setEnabled(id,false,{origin:'voice',signal});
      await dataManager.setEnabled(id,visible,{origin:'voice',signal});
      if(signal?.aborted){if(visible)await dataManager.setEnabled(id,false,{origin:'voice'});signal.throwIfAborted();}
    },
    hideAll:()=>hideAllLayers({keepVoice:true}),
    refresh:()=>{viewer.scene.requestRender();if(!drawer.hidden && title.textContent==='圖資')renderLayers();},
  }});

  function linkedLoad(message,signal){
    signal?.throwIfAborted();const controller=new AbortController();
    const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
    showLoading(message,controller);
    return {controller,finish:()=>{signal?.removeEventListener('abort',abort);hideLoading(controller);}};
  }
  async function loadVoiceService(id,{signal}={}){
    if(id==='osm-labels')return loadOsmLabels(viewer,{signal,onStatus:toast});
    if(id==='official-dtm-2025')return loadLocalDtm({signal});
    if(id==='nlsc-buildings')return loadNlscScope({signal});
    if(id==='tomtom-flow-image')return loadTrafficForScope({signal});
    const job=linkedLoad('正在載入指定圖資…',signal);
    try{
      await ensureCounties();job.controller.signal.throwIfAborted();
      let layer;
      if(id==='world-terrain'){
        for(const relief of listLayers().filter(item=>item.kind==='taiwan-relief' && item.visible))setLayerVisible(relief.id,false);
        layer=await loadWorldTerrain(viewer,{signal:job.controller.signal});
      }else if(id==='taiwan-relief')layer=await loadTaiwanRelief(viewer,{signal:job.controller.signal,mapStackController});
      else if(id==='national-reference')layer=loadNationalReferenceMap(viewer,{bbox:scopeBounds()});
      else throw new Error('不支援的圖資來源');
      if(job.controller.signal.aborted){if(layer)removeLayer(layer.id);job.controller.signal.throwIfAborted();}
      return layer;
    }finally{job.finish();}
  }
  async function setVoiceBasemap(id,visible,{signal}={}){
    signal?.throwIfAborted();await syncMapKeys();signal?.throwIfAborted();
    const map=mapStackController.getStacks().find(item=>item.id===id);
    if(!map)throw new Error('找不到指定底圖');
    if(visible && map.requiresIon && !await hasApiKey('CESIUM_ION_TOKEN'))throw new Error('未輸入金鑰');
    if(visible && id==='photoreal' && !await hasApiKey('GOOGLE_MAPS_API_KEY') && !await hasApiKey('CESIUM_ION_TOKEN'))throw new Error('未輸入金鑰');
    signal?.throwIfAborted();
    const previousId=mapStackController.getActiveId(),host=mapStackController.getImageryHostTileset();
    const previousGlobe=viewer.scene.globe.show,previousHost=host?.show;
    if(!visible){if(previousId===id){if(host)host.show=false;viewer.scene.globe.show=false;}return;}
    const result=await mapStackController.setStack(id);
    if(signal?.aborted){
      if(mapStackController.getActiveId()===id && previousId){
        await mapStackController.setStack(previousId);
        if(mapStackController.getActiveId()===previousId){viewer.scene.globe.show=previousGlobe;const restored=mapStackController.getImageryHostTileset();if(restored)restored.show=previousHost;}
      }
      signal.throwIfAborted();
    }
    if(result?.activeId!==id)throw new Error(result?.lastError || '指定底圖載入失敗，請檢查金鑰與網路');
    if(id==='photoreal'){const current=mapStackController.getImageryHostTileset();if(current)current.show=true;}
    const terrain=listLayers().find(layer=>layer.kind==='world-terrain' && layer.visible);if(terrain)terrain.setVisibility(true);
  }
  async function hideAllLayers({keepVoice=false}={}){
    const keepGoogle=mapStackController?.getActiveId()==='photoreal';
    await stopAllWork({keepVoice});await stopProjectFeeds(keepVoice ? 'voice' : 'user');
    nationwideBuildingsEnabled=false;for(const layer of listLayers())setLayerVisible(layer.id,false);
    if(keepGoogle){await syncMapKeys();const state=await mapStackController.setStack('photoreal');if(state?.activeId!=='photoreal')throw new Error('其他圖資已隱藏，但 Google 擬真 3D 無法恢復');const host=mapStackController.getImageryHostTileset();if(host)host.show=true;viewer.scene.globe.show=false;}
    else{viewer.scene.globe.show=false;const host=mapStackController?.getImageryHostTileset();if(host)host.show=false;}
    viewer.scene.requestRender();batchProgress='已隱藏所有圖資；Google 擬真 3D 底圖保持原狀';renderLayers();
  }

  let voiceSettings=normalizeVoiceSettings();const voiceSettingsReady=loadVoiceSettings().then(value=>{voiceSettings=value;}).catch(error=>{toast(`語音風格讀取失敗：${error.message}`);});
  const voiceSubtitles=createVoiceSubtitles(root);
  const geminiLive = createGeminiLiveController({
    getSettings:()=>voiceSettings,
    onSources:metadata=>{const target=root.querySelector('#tw-voice-sources');if(!target)return;target.replaceChildren();for(const item of metadata.groundingChunks || []){const web=item.web;if(!web?.uri || !/^https?:\/\//i.test(web.uri))continue;const a=document.createElement('a');a.href=web.uri;a.textContent=web.title || '新聞來源';a.target='_blank';a.rel='noopener noreferrer';target.append(a);}if(metadata.searchEntryPoint?.renderedContent){const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');frame.title='Google Search 建議';frame.srcdoc=metadata.searchEntryPoint.renderedContent;target.append(frame);}},
    viewer,
    navigation,
    layerActions,
    cameraCommands:cinematic,
    onStatus: (message) => {
      lastGeminiStatus = message;
      const el = root.querySelector('#tw-gemini-status');
      if (el) el.textContent = message;
      const banner = root.querySelector('#tw-live-status-banner');
      if (banner) banner.textContent = message;
      syncVoiceState();
    },
    onDiagnostic:()=>{if(body.querySelector('#tw-gemini-quota'))void refreshGeminiQuota();},
    onTranscript: (message) => {
      voiceSubtitles.update(message);
      const {role,text}=message;
      const el = root.querySelector('#tw-gemini-transcript');
      if (!el) return;
      const row = document.createElement('div');
      row.className = 'tw-card';
      row.innerHTML = `<small>${role === 'user' ? '你' : 'Gemini'}</small><p>${esc(text)}</p>`;
      el.appendChild(row);
      el.scrollTop = el.scrollHeight;
    },
  });
  let settingsApplyQueue=Promise.resolve(),voiceControlEpoch=0;
  function applyVoiceSettings(){
    const reconnect=geminiLive.active || geminiLive.connecting,epoch=voiceControlEpoch;
    const task=settingsApplyQueue.then(async()=>{
      if(!reconnect || epoch!==voiceControlEpoch || (!geminiLive.active && !geminiLive.connecting))return;
      await geminiLive.stop();
      if(epoch!==voiceControlEpoch)return;
      await geminiLive.start();
    });
    settingsApplyQueue=task.catch(()=>{});return task;
  }
  syncVoiceState();

  function syncVoiceState() {
    const mic = root.querySelector('.tw-voice-mic');
    if (!mic) return;
    mic.classList.toggle('on', geminiLive.active);
    mic.setAttribute('aria-pressed', String(geminiLive.active));
    mic.setAttribute('aria-label', geminiLive.active ? '停止 Gemini Live 語音助理' : '啟動 Gemini Live 語音助理');
    mic.title = geminiLive.active ? '語音聆聽中，點擊關閉' : '語音已關閉，點擊啟動';
  }

  let freeModels = [{ id:'openrouter/free', name:'自動選擇免費模型' }];
  try { freeModels = JSON.parse(localStorage.getItem('gev.tw.freeModels') || '[]'); } catch {}
  freeModels=freeModels.filter(m=>!/safety|guard|moderation|embedding|lyria/i.test(`${m.id} ${m.name}`));
  if (!freeModels.some(item => item.id === 'openrouter/free')) freeModels.unshift({ id:'openrouter/free', name:'自動選擇免費模型' });
  syncModelUi();
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const a = btn.dataset.act;
    try {
      if(['project','layers','analysis','ai-status','notes','results','shortcuts','resources'].includes(a))drawerWindow.restore();
      if (a === 'group-collapse') {
        const key=btn.dataset.group,section=btn.closest('[data-layer-group]'),content=section?.querySelector(':scope > .tw-group-content');
        if(!content)return;
        content.hidden=!content.hidden;btn.setAttribute('aria-expanded',String(!content.hidden));
        btn.querySelector('.tw-group-arrow').textContent=content.hidden?'▸':'▾';
        if(content.hidden)collapsedGroups.add(key);else collapsedGroups.delete(key);
        localStorage.setItem('gev.tw.collapsedGroups',JSON.stringify([...collapsedGroups]));return;
      }
      if (a === 'close-drawer') return close();
      if (a === 'quick-toggle') {
        setQuickMenuOpen(root.querySelector('#tw-quick-palette').hidden);
        return;
      }
      if (btn.closest('.tw-quick-palette')) {
        setQuickMenuOpen(false);
      }
      if (a === 'shortcuts') return renderShortcuts();
      if (a === 'model-refresh') return await refreshFreeModels();
      if (a === 'chat-toggle') return toggleChat();
      if(a==='transit-recovery'){const id=btn.dataset.recoveryId,index=Number(btn.dataset.recoveryIndex),label=btn.textContent.trim();await runTransitInteraction(()=>transit.confirmRecovery(id,index),`採用建議${index+1}：${label}`);return;}
      if (a === 'chat-send') return await sendChat();
      if (a === 'chat-clear') {chatGeneration++;chatController?.abort();chatController=null;chatBusy=false;aiPending=false;aiStreaming=false;chatMessages.length=0;analysisSession=null;chatContextStartIndex=0;chatUnread=0;root.querySelector('#tw-chat-input').value='';syncChatUnread();renderChatMessages();return chatStatus('已清除當前所有對話內容');}
      if (a === 'chat-style') {await responseStyleReady;const panel=chatPanel.querySelector('.tw-chat-style');panel.hidden=!panel.hidden;if(!panel.hidden)panel.querySelector('textarea').value=responseStyle;return;}
      if (a === 'chat-style-reset') {const field=chatPanel.querySelector('#tw-response-style');field.value='';field.focus();return;}
      if(a==='cctv-image'){
        const result=chatMessages.find(message=>message.cctvResult?.requestId===btn.dataset.request)?.cctvResult;
        if(!result)return;cctvPreview??=floatingPanels.create({id:'cctv-screenshot',title:'CCTV 固定辨識截圖',width:650,height:510});
        cctvPreview.body.innerHTML=cctvFrameHtml(result,{preview:true});cctvPreview.restore();return;
      }
      if(a==='cctv-boxes'){btn.closest('[data-cctv-frame]')?.classList.toggle('tw-cctv-boxes-visible');return;}
      if(a==='chat-save'){if(chatBusy)throw new Error('請等待回覆完成後再儲存對話');return await chatArchive.save(chatMessages);}
      if (a === 'chat-style-save') {styleRevision++;responseStyle=await saveResponseStyle(chatPanel.querySelector('#tw-response-style').value);chatPanel.querySelector('.tw-chat-style').hidden=true;return chatStatus(responseStyle ? '已儲存自訂對話風格，從下一次回覆套用' : '已恢復預設對話風格');}
      if (a === 'toolbar-toggle') return toggleToolbar();
      if (a === 'taiwan-location') return renderLocation();
      if (a === 'taiwan-presets') return renderVisualPresets();
      if (a === 'locate-me') return locateMe();
      if (a === 'fly-coordinates') return flyCoordinates();
      if (a === 'fly-county') return flyCounty(btn.dataset.county);
      if (a === 'visual-style') { styleManager?.setStyle?.(btn.dataset.style); return toast(`已切換${btn.textContent.trim()}`); }
      if (a === 'taiwan') return flyTaiwan(viewer);
      if (a === 'global') return flyGlobal(viewer);
      if (a === 'layers') return renderLayers();
      if (a === 'analysis') return renderAnalysis();
      if(a==='driving-panel')return drivingPanel?drivingPanel.restore():renderDriving();
      if(a==='transit-panel')return transit.show();
      if (a === 'project') return renderProject();
      if (a === 'settings') return renderSettings();
      if (a === 'resources') return renderResources();
      if (a === 'ai-status'){await voiceSettingsReady;return renderAI('home');}
      if(a==='ai-help-home')return renderAI('home');
      if(a==='ai-help-voice')return renderAI('voice');
      if(a==='ai-help-space')return renderAI('space');
      if(a==='ai-help-chat'){showAssistant();return;}
      if(a==='ai-help-style'){await responseStyleReady;showAssistant();const stylePanel=chatPanel.querySelector('.tw-chat-style');stylePanel.hidden=false;stylePanel.querySelector('textarea').value=responseStyle;return;}
      if (a === 'ai-status-refresh') return await Promise.all([refreshAiStatus(),refreshGeminiQuota()]);
      if (a === 'notes') return renderDrawing();
      if(a==='label-options'){open('地圖文字標籤',`${labelControls({color:drawingColor('label')})}<div class="tw-actions"><button data-act="label-start">在地圖放置標籤</button><button class="tw-ai-back" data-act="label-back">返回</button></div><details><summary>操作方式</summary><ul><li>輸入文字與樣式後按放置，再點地圖。</li><li>字體需電腦已安裝；各標籤可在圖層項下修改或刪除。</li></ul></details>`);return;}
      if(a==='label-back')return renderDrawing();
      if(a==='label-start'){drawing.cancel();cctvWall.hideMarkers();return labels.start(readLabelOptions());}
      if (a === 'drawing-start'){labels.cancel();return drawing.start(btn.dataset.mode, drawingStyle(btn.dataset.mode));}
      if (a === 'drawing-finish') return await drawing.finish();
      if(a==='camera-path-start'){cinematic.show();return;}
      if(a==='cctv-panel'){cctvWall.openPanel();return;}
      if(a==='camera-path-play')return cameraPath.play({duration:body.querySelector('#tw-camera-path-duration').value,eyeHeight:body.querySelector('#tw-camera-path-height').value});
      if(a==='camera-path-stop'){cameraPath.stop();return toast('已停止運鏡');}
      if (a === 'drawing-cancel') { cameraPath.cancel(); labels.cancel();drawing.cancel(); return renderDrawingResult({ status:'已取消繪製' }); }
      if (a === 'drawing-ai') return await explainDrawing();
      if (a === 'dtm-import') { root.querySelector('#tw-dtm-input').click(); return; }
      if (a === 'dtm-bundled') return await loadLocalDtm();
      if (a === 'national-reference') { await ensureCounties();loadNationalReferenceMap(viewer,{bbox:scopeBounds()}); return renderLayers(); }
      if (a === 'nlsc-load') return body.querySelector('#tw-nlsc-url')?.value.trim() ? await loadNlscFromPanel() : await loadNlscScope();
      if (a === 'nlsc-discover') return await discoverNlsc();
      if (a === 'results') return await renderResults();
      if (a === 'clear-project') { await clearCurrentProject(); return renderProject(); }
      if (a === 'project-delete') {const members=projectMemberLayers().map(l=>l.id);await stopAllWork();await stopProjectFeeds();for(const id of members)removeLayer(id);activeProject=null;lastDrawingResult=null;focusLayer=null;analysisTarget=null;chatContextStartIndex=chatMessages.length;renderProject();return toast('已刪除匯入專案及其圖層；原始 JSON 與原始匯出檔保留');}
      if (a === 'chat-image') {const url=new URL(btn.dataset.imageUrl,location.origin);if(url.protocol!=='https:' && url.origin!==location.origin)throw new Error('不支援的圖片來源');const img=document.createElement('img');img.alt=btn.dataset.imageAlt || 'AI 圖片';img.referrerPolicy='no-referrer';img.loading='lazy';img.src=url.href;img.onerror=()=>{img.replaceWith(document.createTextNode('圖片來源無法載入'));};btn.replaceWith(img);return;}
      if(a==='cctv-wall-all')return await cctvWall.showAll();
      if (a === 'cctv-wall-load') {drawing.cancel();labels.cancel();cameraPath.cancel();await dataManager?.setEnabled('cctv',false,{origin:'taiwan-user'});return await cctvWall.load();}
      if (a === 'cctv-wall-select') {drawing.cancel();labels.cancel();cameraPath.cancel();return cctvWall.begin();}
      if (a === 'cctv-wall-confirm') return cctvWall.show();
      if (a === 'cctv-wall-stop') return cctvWall.stop();
      if (a === 'continue-project') return renderProject();
      if (a === 'legacy') { setLegacyMode(!document.body.classList.contains('gev-tw-legacy-open')); return; }
      if (a === 'save') return await doExport();
      if (a === 'import-data') { root.querySelector('#tw-file-input').click(); return; }
      if (a === 'export-project') return doExport();
      if (a === 'import-project') { root.querySelector('#tw-project-input').click(); return; }
      if (a === 'selected-layers-ai') return await runIntegratedAnalysis({type:'layers',layers:visibleAnalysisLayers(listLayers())});
      if (a === 'hide-transit-route' || a === 'hide-driving-route') {
        const result=a==='hide-transit-route'?journey.hideRoute(btn.dataset.routeId):navigation.hideRoute(btn.dataset.routeId);
        if(result?.stale)throw Error('這張資訊卡屬於舊路線，請點選目前路線。');
        journeyInfo?.hide();if(a==='hide-transit-route')journeyCard?.hide();
        toast('已關閉這條導航路線的顯示；規劃結果仍保留。');return;
      }
      if (a === 'analysis-followup') {
        const session=analysisSessions.get(btn.dataset.analysisId);
        if(!session)throw Error('此分析已失效，請重新勾選後分析。');
        const suggestion=session.suggestions[Number(btn.dataset.analysisIndex)];
        return await runIntegratedAnalysis({...session,prompt:suggestion.prompt,corridorMeters:suggestion.corridorMeters||session.corridorMeters},suggestion.label);
      }
      if (a === 'apply-profile') { governor.apply(btn.dataset.profile); renderSettings(); return; }
      if (a === 'apply-custom') return applyCustom();
      if (a === 'buffer') return doBuffer(btn.dataset.layer);
      if (a === 'suggest-ai') return await doSuggestAI();
      if (a === 'refresh-free-models') return await refreshFreeModels();
      if (a === 'layer-ai' || a === 'project-ai') return await explainLayers(btn.dataset.layer);
      if (a === 'open-original-keys') return await openOriginalKeys();
      if (a === 'reload') return location.reload();
      if(a==='voice-model-save'){voiceSettings=await saveVoiceSettings({...voiceSettings,model:body.querySelector('#tw-voice-model').value});toast('已儲存語音模型，立即套用');await applyVoiceSettings();return renderAI();}
      if(a==='voice-style-save' || a==='voice-style-reset'){const settings=a==='voice-style-reset'?normalizeVoiceSettings():normalizeVoiceSettings({...voiceSettings,style:body.querySelector('#tw-voice-style').value,role:body.querySelector('#tw-voice-role').value,clearPlaceOnNext:body.querySelector('#tw-voice-clear-place').checked,shareMap:body.querySelector('#tw-voice-share-map').checked});voiceSettings=await saveVoiceSettings(settings);const opened=[...body.querySelectorAll('.tw-voice-help details')].map(el=>el.open);const scroll=body.scrollTop;toast('已儲存語音風格與設定，立即套用；重開程式會沿用');renderAI();body.querySelector('.tw-voice-help').open=true;[...body.querySelectorAll('.tw-voice-help details')].forEach((el,index)=>el.open=opened[index]);body.scrollTop=scroll;try{await applyVoiceSettings();}catch(error){toast(`風格已儲存，語音重新連線失敗：${error.message}`);}return;}
      if (a === 'gemini-live-toggle') return await toggleGeminiLive();
      if (a === 'cctv-check') return await doCctvCheck();
      if (a === 'osm-check') return await doOsmCheck();
      if (a === 'open-cctv') return openLegacyCctv();
      if (a === 'taiwan-cctv') return await renderTaiwanCctv();
      if (a === 'taiwan-cctv-play') return playTaiwanCctv();
      if (a === 'builtin-load') return await doLoadBuiltin(btn.dataset.builtin,{fresh:btn.dataset.fresh==='true'});
      if (a === 'builtin-load-all') return await doLoadAllBuiltins();
      if (a === 'layer-toggle') {
        const layer = getLayer(btn.dataset.layer);
        if(layer?.kind==='3d-tiles' && !layer.visible)await ensureBuildingSurface();
        if(layer?.kind==='world-terrain')for(const relief of listLayers().filter(item=>item.kind==='taiwan-relief' && item.visible))setLayerVisible(relief.id,false);
        if (layer?.pendingService) { await connectPendingLayer(layer); return renderCurrentDrawer(); }
        if (btn.dataset.layer === 'nlsc-all') {
          const buildings = listLayers().filter(item=>item.kind === '3d-tiles'); const show = !buildings.some(item=>item.visible);
          if(show && buildings.length)await ensureBuildingSurface();
          for (const item of buildings) { if (show && item.pendingService) await connectPendingLayer(item); else setLayerVisible(item.id,show); }
        } else if (layer) setLayerVisible(layer.id,!layer.visible);
        if(layer?.kind === 'drawing-input')invalidateDrawing(layer.bufferSourceId);
        return renderCurrentDrawer();
      }
      if (a === 'layer-remove') { const removed=getLayer(btn.dataset.layer);if(removed?.kind === 'drawing-input')invalidateDrawing(removed.bufferSourceId);removeLayer(btn.dataset.layer); if(lastDrawingResult?.layerId === btn.dataset.layer)lastDrawingResult=null; return renderCurrentDrawer(); }
      if (a === 'layer-move') { moveLayer(btn.dataset.layer,btn.dataset.direction); return renderCurrentDrawer(); }
      if (a === 'project-toggle') { const target=projectMemberLayers();const show=!target.some(layer=>layer.visible);if(show && target.some(layer=>layer.kind==='3d-tiles'))await ensureBuildingSurface();for(const layer of target)setLayerVisible(layer.id,show);return renderProject(); }
      if (a === 'scope-apply') return await applyScope();
      if (a === 'scope-off') {await stopAllWork();await stopProjectFeeds();nationwideBuildingsEnabled=false;for(const layer of listLayers())if(layer.builtinId || layer.scopeManaged || ['3d-tiles','dtm','national-wms','world-terrain','taiwan-relief'].includes(layer.kind))setLayerVisible(layer.id,false);batchProgress='圖資已關閉；範圍設定保留';return renderLayers();}
      if (a === 'taiwan-relief') {const controller=new AbortController();showLoading('正在載入台灣 3D 地形地貌…',controller);try{await loadTaiwanRelief(viewer,{signal:controller.signal,mapStackController});return renderLayers();}finally{hideLoading(controller);}}
      if (a === 'relief-focus') return getLayer(btn.dataset.layer)?.focusTaiwan?.();
      if(a==='osm-labels'){const controller=new AbortController();showLoading('正在載入 OSM 地名標籤…',controller);try{await loadOsmLabels(viewer,{signal:controller.signal,onStatus:toast});return renderLayers();}finally{hideLoading(controller);}}
      if (a === 'world-terrain') {for(const relief of listLayers().filter(item=>item.kind==='taiwan-relief' && item.visible))setLayerVisible(relief.id,false);const controller=new AbortController();showLoading('正在載入全球地形…',controller);try{await loadWorldTerrain(viewer,{signal:controller.signal});return renderLayers();}finally{hideLoading(controller);}}
      if (a === 'tomtom-flow') {layerErrors.delete('traffic-key');await loadTrafficForScope();return renderLayers();}
      if (a === 'live-layer') {const epoch=workEpoch;const id=btn.dataset.live;layerErrors.delete(`live:${id}`);const key={'ais-live-vessels':'AISSTREAM_API_KEY','local-firms':'FIRMS_MAP_KEY'}[id];if(key && !dataManager.isEnabled(id) && !await hasApiKey(key))throw new Error('未輸入金鑰');if(epoch!==workEpoch)return;await ensureCounties();if(epoch!==workEpoch)return;await focusScope();if(epoch!==workEpoch)return;await dataManager.setEnabled(id,!dataManager.isEnabled(id),{origin:'user'});return renderLayers();}
      if (a === 'map-stack') {const epoch=workEpoch;await syncMapKeys();if(epoch!==workEpoch)return;const id=btn.dataset.map;layerErrors.delete(`map:${id}`);const map=mapStackController.getStacks().find(item=>item.id===id);if(map?.requiresIon && !await hasApiKey('CESIUM_ION_TOKEN'))throw new Error('未輸入金鑰');if(id==='photoreal' && !await hasApiKey('GOOGLE_MAPS_API_KEY') && !await hasApiKey('CESIUM_ION_TOKEN'))throw new Error('未輸入金鑰');if(epoch!==workEpoch)return;const host=mapStackController.getImageryHostTileset();if(mapStackController.getActiveId() === id && (host?.show || viewer.scene.globe.show)){if(host)host.show=false;viewer.scene.globe.show=false;}else{const state=await mapStackController.setStack(id);if(epoch!==workEpoch)return;if(state?.activeId!==id)throw new Error(state?.lastError || '圖資無法載入，請檢查服務金鑰與網路');if(host && id === 'photoreal')host.show=true;const terrain=listLayers().find(layer=>layer.kind === 'world-terrain' && layer.visible);if(terrain)terrain.setVisibility(true);}viewer.scene.requestRender();return renderLayers();}
      if (a === 'drawing-inputs') return renderDrawingInputs(btn.dataset.layer);
      if (a === 'drawing-input-load') return await loadDrawingInputs(btn.dataset.layer);
      if (a === 'drawing-confirm') {confirmDrawingInputs(btn.dataset.layer);expandedDrawingId=btn.dataset.layer;renderDrawing();return toast('已確認分析圖資');}
      if (a === 'drawing-ai-layer') return await calculateDrawing(btn.dataset.layer);
      if (a === 'hide-all-layers') return await hideAllLayers();
      if (a === 'search-place') {const result=await geminiLive.flyToPlace(body.querySelector('#tw-place-search').value);toast(`已到達 ${result.place}`);return;}
      if (a === 'chat-size') {chatPanel.style.width='';chatPanel.style.height='';chatPanel.classList.toggle('tw-chat-large');return;}

      if (a === 'validate-cesium') return await validateProvider('cesium');
      if (a === 'validate-tomtom') return await validateProvider('tomtom');
      if(a==='route-stop-add'){captureRouteInputs();routeInputs.waypoints.push('');return renderDriving();}
      if(a==='route-stop-remove'){captureRouteInputs();routeInputs.waypoints.splice(Number(btn.dataset.index),1);return renderDriving();}
      if(a==='route-stop-move'){captureRouteInputs();const index=Number(btn.dataset.index),next=index+(btn.dataset.direction==='up'?-1:1);if(next>=0 && next<routeInputs.waypoints.length)[routeInputs.waypoints[index],routeInputs.waypoints[next]]=[routeInputs.waypoints[next],routeInputs.waypoints[index]];return renderDriving();}
      if(a==='route-ai-analyze')return await analyzeCurrentRoute();
      if (a === 'route-plan') return await doRoutePlan();
      if (a === 'route-view') return await navigation.navigationView();
      if (a === 'route-show') return await navigation.showRoute();
      if (a === 'nav-stop') return await navigation.stopNavigation();
      if (a === 'nav-preview') return navigation.startPreview();
      if(a==='nav-drive')return await navigation.driveRoute();
      if (a === 'route-clear') return navigation.clearRoute();
    } catch (err) {
      if (err?.name === 'AbortError') { toast('已停止目前工作'); return; }
      console.error(err);
      toast(err?.message || String(err));
      if(err?.message==='未輸入金鑰'){
        const id=btn.dataset.live ? `live:${btn.dataset.live}` : btn.dataset.map ? `map:${btn.dataset.map}` : a==='tomtom-flow' ? 'traffic-key' : null;
        if(id){layerErrors.set(id,'未輸入金鑰');renderLayers();}
      }
      const status = root.querySelector('#tw-live-health');
      if (status) status.innerHTML = `<div class="tw-card"><b>檢查失敗</b><p>${esc(err?.message || String(err))}</p></div>`;
    }
  });

  root.querySelector('#tw-file-input').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    const controller = new AbortController();
    showLoading(`正在匯入 ${files.length} 個圖資檔案… 按 Ctrl+S 可停止後續匯入`, controller);
    try {
      for (const f of files) {
        controller.signal.throwIfAborted();
        await importFile(f, viewer, { signal:controller.signal });
      }
    } catch (error) {
      toast(error?.name === 'AbortError' ? '已停止匯入' : `匯入失敗：${error?.message || String(error)}`);
    } finally {
      hideLoading(controller);
      e.target.value = '';
      renderLayers();
    }
  });
  root.querySelector('#tw-dtm-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const crs = body.querySelector('#tw-dtm-crs')?.value || 'EPSG:3826';
      const result = await importDtmCsv(file, viewer, crs);
      toast(`已載入 ${result.layer.geojson.features.length} 個 DTM 高程點${result.truncated ? '；僅取前 10,000 筆' : ''}`);
      renderLayers();
    } catch (error) { toast(`DTM 載入失敗：${error.message}`); }
    finally { e.target.value = ''; }
  });
  root.querySelector('#tw-project-input').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { await loadProjectFile(f); } catch (error) { toast(`專案載入失敗：${error.message}`); }
    finally { e.target.value = ''; }
  });

  async function stopProjectFeeds(origin='taiwan-project-idle') {
    nationwideBuildingsEnabled = false;
    viewer.camera.cancelFlight();
    // Importing a saved camera position is not consent to load live layers.
    if (dataManager?.layers) await Promise.allSettled([...dataManager.layers.keys()].map(id => dataManager.setEnabled(id,false,{origin})));
    body.querySelector('#tw-cctv-live-image')?.removeAttribute('src');
  }
  async function clearCurrentProject() {
    await stopAllWork(); await stopProjectFeeds();
    for (const layer of listLayers()) removeLayer(layer.id);
    activeProject = null; lastDrawingResult = null; focusLayer = null;
    chatContextStartIndex = chatMessages.length;
    batchProgress = ''; layerErrors.clear();
    toast('已清除目前專案；原始 JSON 檔仍可重新匯入');
  }
  async function loadProjectFile(file) {
    const p = await importProject(file); // Validate before replacing current data.
    await stopAllWork(); await stopProjectFeeds();
    const previous = listLayers().map(layer => layer.id);
    const loadedIds = [];
    const originalIds = new Map();
    const staged = [];
    let committed = false;
    const controller = new AbortController();
    showLoading('正在載入專案圖資… 按 Ctrl+S 可停止',controller);
    try {
      for (const layer of p.layers) {
        controller.signal.throwIfAborted();
        const loaded = await addGeoJSON(layer.geojson,layer.path,viewer,{...layer.style,kind:layer.kind,flyTo:false,stageOnly:true,metadata:{
          source:layer.source,style:layer.style,dataMetadata:layer.metadata,description:layer.description,sourceProject:layer.sourceProject,
          sourceProjectKey:p.fingerprint,builtinId:layer.builtinId,sourceLayerId:layer.sourceLayerId,sourceKey:layer.sourceKey,parentSourceKey:layer.parentSourceKey,aiReports:layer.metadata?.aiReports || [] }});
        loaded.visible = layer.visible; loaded.dataSource.show = layer.visible; staged.push(loaded);
      }
      for (const item of staged) { controller.signal.throwIfAborted(); await viewer.dataSources.add(item.dataSource); }
      controller.signal.throwIfAborted();
      for (const id of previous) removeLayer(id);
      for (const [index,item] of staged.entries()) {
        const loaded = registerLayer(item); loadedIds.push(loaded.id); originalIds.set(p.layers[index].sourceLayerId,loaded.id);
      }
      committed = true;
      for (const [index,layer] of p.layers.entries()) {
        const parentId = originalIds.get(layer.bufferSourceId);
        if (parentId && parentId !== loadedIds[index]) Object.assign(getLayer(loadedIds[index]),{bufferSourceId:parentId,bufferDistanceMeters:layer.bufferDistanceMeters});
      }
      activeProject = {name:p.manifest.name || file.name,sourceFile:file.name,metadata:p.manifest.metadata || {},fingerprint:p.fingerprint,layerIds:loadedIds};
      chatContextStartIndex = chatMessages.length;
      chatMessages.push({role:'system',content:`已切換至「${activeProject.name}」，後續分析採用此專案的資料摘要。`});
      renderChatMessages();
      const camera = p.manifest.camera;
      if (camera?.position?.length === 3 && camera.position.every(Number.isFinite)) viewer.camera.setView({destination:new Cesium.Cartesian3(...camera.position),orientation:{heading:camera.heading,pitch:camera.pitch,roll:camera.roll}});
      else if (p.geolibre) {
        const bbox = p.manifest.mapView?.bbox;
        if (Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)) viewer.camera.setView({destination:Cesium.Rectangle.fromDegrees(...bbox)});
        else { const center = p.manifest.mapView?.center; if (center?.length === 2 && center.every(Number.isFinite)) viewer.camera.setView({destination:Cesium.Cartesian3.fromDegrees(center[0],center[1],90000)}); }
      }
      for (const service of p.services) {
        controller.signal.throwIfAborted();
        let loaded;
        if (service.kind === 'national-wms') loaded = loadNationalReferenceMap(viewer);
        else if (service.visible !== false) {
          try { loaded = await loadNlscBuildings(service.url,viewer,{name:service.name || 'NLSC 3D 建物',flyTo:false,signal:controller.signal}); }
          catch (error) { if (controller.signal.aborted) throw error; loaded = registerLayer({name:service.name || 'NLSC 3D 建物',kind:'3d-tiles',serviceUrl:service.url,visible:false,pendingService:true,source:`NLSC 服務尚未連線：${error.message}`}); }
        } else loaded = registerLayer({name:service.name || 'NLSC 3D 建物',kind:'3d-tiles',serviceUrl:service.url,visible:false,pendingService:true,source:'NLSC 公開 3D Tiles；待手動顯示時連線'});
        if (!loaded.pendingService && service.visible === false) setLayerVisible(loaded.id,false);
        Object.assign(loaded,{sourceProject:file.name,sourceProjectKey:p.fingerprint,dataMetadata:{...loaded.dataMetadata,...service.metadata},aiReports:service.metadata?.aiReports || []});
        if(loaded.setHeightOffset && Number.isFinite(service.metadata?.displayHeightOffset))loaded.setHeightOffset(service.metadata.displayHeightOffset);
        activeProject.layerIds.push(loaded.id);
      }
      await stopProjectFeeds();
      toast(`已載入 ${p.layers.length} 個專案圖層；即時功能保持停止`);
      renderProject();
    } catch (error) {
      if (!committed) for (const item of staged) viewer.dataSources.remove(item.dataSource,true);
      if (error.name !== 'AbortError') throw error;
      toast('已停止載入專案');
    } finally { hideLoading(controller); }
  }

  window.addEventListener('gev-tw:vector-view-status',event=>{for(const node of body.querySelectorAll('[data-vector-status]'))if(node.dataset.vectorStatus===event.detail.id)node.textContent=vectorStatus(event.detail);});
  window.addEventListener('gev-tw:traffic-status',()=>{if(!drawer.hidden && title.textContent==='圖資')renderLayers();});
  window.addEventListener('gev-tw:layers-changed', () => {
    if (!drawer.hidden) renderCurrentDrawer();
  });
  function buildingStatus(layer){const stats=layer?.getLoadingStats?.();if(!stats)return '等待圖磚載入';return `本次唯一載入 ${stats.loaded} 個圖磚（駐留 ${stats.resident??stats.loaded}）；下載中 ${stats.pending}、處理中 ${stats.processing}${stats.failed?`；${stats.failed} 個圖磚讀取失敗，請更新重試`:stats.settled?'；目前視野載入完成':'；依視野持續載入'}。圖磚數不等於建物棟數；詳細度 SSE ${stats.effectiveSse??stats.requestedSse}${stats.memoryLimited?"（記憶體限制正在降低細節）":""}。請放大到街區查看，官方服務未涵蓋之處不能補造建物。${layer.dataMetadata?.buildingAlignment?.status==='aligned'?` 地形高程展示對齊 ${layer.dataMetadata.buildingAlignment.offsetMeters.toFixed(2)} 公尺（${layer.dataMetadata.buildingAlignment.samples} 個底面取樣）。`:layer.dataMetadata?.buildingAlignment?.note||''}`;}
  const updateBuildingStatus=()=>{for(const element of root.querySelectorAll('[data-building-status]'))element.textContent=buildingStatus(getLayer(element.dataset.buildingStatus));};
  window.addEventListener('gev-tw:building-status',updateBuildingStatus);
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopImmediatePropagation();
      resetAllFunctions().catch(error => toast(error?.message || String(error)));
      return;
    }
    if (e.key === 'Escape') setQuickMenuOpen(false);
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if ((e.key||'').toLowerCase() === 't') flyTaiwan(viewer);
    if ((e.key||'').toLowerCase() === 'g') flyGlobal(viewer);
  },true);
  root.addEventListener('change', event => {
    const target=event.target;
    if(target.matches('[data-route-style]')){navigation.setRouteStyle({[target.dataset.routeStyle]:target.value});transit.synchronizeColor();return;}
    if(target.matches('[data-vehicle-color]')){navigation.setVehicleColor(target.dataset.vehicleColor,target.value);toast('車身顏色已儲存，下次開啟沿用');return;}
    if(target.matches('[data-label-style]')){const layer=getLayer(target.dataset.layer);if(layer){layer.dataMetadata.annotationLabel=normalizeLabelStyle({...layer.dataMetadata.annotationLabel,[target.dataset.labelStyle]:target.value});layer.name=`標籤：${layer.dataMetadata.annotationLabel.text.slice(0,40)}`;layer.geojson.features[0].properties.name=layer.dataMetadata.annotationLabel.text;applyAnnotationLabel(layer);}return;}
    if(target.matches('[data-building-white]')){setBuildingWhiteMode(viewer,target.checked);return;}
    if(target.matches('[data-building-align]')){getLayer(target.dataset.layer)?.alignment?.setEnabled(target.checked);return;}
    if(target.matches('[data-building-offset]')){try{getLayer(target.dataset.layer)?.setHeightOffset?.(target.value);}catch(error){toast(error.message);}return;}
    if(target.matches('[data-relief-scale]')) {getLayer(target.dataset.layer)?.setScale(target.value);return;}
    if(target.matches('[data-layer-style]')) {const patch={[target.dataset.layerStyle]:target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value};try{const layer=getLayer(target.dataset.layer);updateLayerStyle(layer,patch);for(const row of root.querySelectorAll('[data-style-layer]'))if(row.dataset.styleLayer===layer.id)row.querySelector('.tw-layer-swatch')?.style.setProperty('--tw-layer-color',layer.style.stroke);}catch(e){toast(e.message);}return;}
    if(target.matches('[data-drawing-frame]')) {drawingFrame[target.dataset.drawingFrame]=target.type === 'checkbox' ? target.checked : target.type === 'number' ? Math.max(1,Math.min(8,Number(target.value)||3)) : target.value;localStorage.setItem('gev.tw.drawingFrame',JSON.stringify(drawingFrame));drawing.setStyle(drawingFrame);return;}
    if(target.id === 'tw-circle-radius'){try{drawing.setRadius(target.value);}catch(e){toast(e.message);}return;}
    if (event.target.matches('[data-drawing-color]')) {
      const mode = event.target.dataset.drawingColor; drawingColors[mode] = event.target.value;
      localStorage.setItem('gev.tw.drawingColors',JSON.stringify(drawingColors));
      drawing.setColor(mode,event.target.value); return;
    }
    if (event.target.id !== 'tw-active-model') return;
    localStorage.setItem('gev.tw.aiModel', event.target.value);
    syncModelUi();
  });
  window.addEventListener('gev-tw:model-changed', () => {
    try { freeModels = JSON.parse(localStorage.getItem('gev.tw.freeModels') || '[]'); } catch { freeModels = []; }
    syncModelUi();
  });
  root.addEventListener('keydown', event => {
    if (event.target.id === 'tw-chat-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void sendChat();
    }
  });

  governor.subscribe(updateResources);
  governor.start();
  document.body.classList.add('gev-tw-minimal');
  setScopeMaskEnabled(false);
  const refreshGlobeViewport = () => { viewer.resize(); viewer.scene.requestRender(); };
  window.addEventListener('resize', refreshGlobeViewport);
  refreshGlobeViewport();
  root.classList.toggle('tw-toolbar-collapsed', localStorage.getItem('gev.tw.toolbarCollapsed') === '1');
  syncToolbarToggle();

  function syncToolbarToggle() {
    const toggle = root.querySelector('.tw-toolbar-toggle');
    const collapsed = root.classList.contains('tw-toolbar-collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '展開工具列' : '收合工具列');
    toggle.title = collapsed ? '展開工具列' : '隱藏工具列';
    toggle.innerHTML = '<span>工具列</span>';
  }

  function toggleToolbar() {
    root.classList.toggle('tw-toolbar-collapsed');
    if (root.classList.contains('tw-toolbar-collapsed')) close();
    localStorage.setItem('gev.tw.toolbarCollapsed', root.classList.contains('tw-toolbar-collapsed') ? '1' : '0');
    syncToolbarToggle();
  }

  function setLegacyMode(enabled) {
    document.body.classList.toggle('gev-tw-legacy-open', enabled);
    document.body.classList.toggle('gev-tw-minimal', !enabled);
    if (enabled) close();
    else document.body.classList.remove('gev-tw-dock-open');
    styleManager?.setHudVisible?.(enabled ? 'on' : 'off');
    if(enabled) {const panel=document.getElementById('data-panel');if(panel){panel.hidden=false;panel.classList.remove('collapsed','layout-auto-collapsed');panel.removeAttribute('aria-hidden');}document.getElementById('left-panel-stack')?.removeAttribute('hidden');}
    setScopeMaskEnabled(enabled);
  }

  function renderLocation() {
    open('位置定位', `<label>搜尋台灣地標<input id="tw-place-search" placeholder="例如 宜蘭縣政府"></label><button data-act="search-place">搜尋並前往</button><p class="tw-note">使用已保存的 TomTom；未設定時使用 Photon／OpenStreetMap 手動搜尋，公共來源可能受限。</p><p class="tw-note">使用裝置定位或輸入經緯度。定位僅在你按下按鈕後請求授權。</p>
      <div class="tw-actions"><button data-act="locate-me">定位到我目前位置</button><button data-act="taiwan">台灣全景</button><button data-act="global">全球</button></div>
      <p class="tw-note">座標使用 WGS84 十進位經緯度（EPSG:4326）：緯度在前、經度在後。可貼上 Google 地圖顯示的經緯度；地圖影像使用 Web Mercator，不影響此處座標格式。</p>
      <label>緯度（北緯 °）<input id="tw-latitude" type="number" min="-90" max="90" step="any" placeholder="例如 24.757"></label>
      <label>經度（東經 °）<input id="tw-longitude" type="number" min="-180" max="180" step="any" placeholder="例如 121.753"></label>
      <button class="tw-primary" data-act="fly-coordinates">前往座標</button>
      <h3>台灣縣市快捷定位</h3><p class="tw-note">飛往各縣市行政中心附近的參考點，非行政界線。</p>
      <div class="tw-county-grid">${TAIWAN_COUNTIES.map(([name]) => `<button data-act="fly-county" data-county="${name}">${name}</button>`).join('')}</div>`);
  }

  function flyCounty(name) {
    const county = TAIWAN_COUNTIES.find(item => item[0] === name);
    if (!county) throw new Error('找不到縣市座標');
    viewer.camera.flyTo({ destination:Cesium.Cartesian3.fromDegrees(county[2], county[1], 42000), duration:1.4 });
    close();
    toast(`已前往${name}行政中心附近`);
  }

  function flyCoordinates() {
    const latText = body.querySelector('#tw-latitude')?.value.trim();
    const lonText = body.querySelector('#tw-longitude')?.value.trim();
    if (!latText || !lonText) throw new Error('請輸入緯度與經度');
    const lat = Number(latText);
    const lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('請輸入有效的緯度與經度');
    viewer.camera.flyTo({ destination:Cesium.Cartesian3.fromDegrees(lon,lat,12000), duration:1.4 });
    close();
  }

  function locateMe() {
    if (!navigator.geolocation) throw new Error('此瀏覽器不支援位置定位');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      viewer.camera.flyTo({ destination:Cesium.Cartesian3.fromDegrees(coords.longitude,coords.latitude,12000), duration:1.4 });
      close();
    }, error => toast(`定位失敗：${error.message}`), { enableHighAccuracy:true, timeout:12000 });
  }

  function renderVisualPresets() {
    open('視覺預設', `<p class="tw-note">選擇原版地圖的視覺處理方式，保持台灣版操作面板。</p>
      <div class="tw-profile-grid">${[['normal','標準'],['surveillance','夜視'],['thermal','熱顯像'],['noir','黑白'],['anime','動漫'],['snow','雪景'],['retro','復古']].map(([value,label]) => `<button data-act="visual-style" data-style="${value}">${label}</button>`).join('')}</div>`);
  }

  function renderShortcuts() {
    open('快捷鍵', `<div class="tw-shortcut-list">
      <div><span class="tw-shortcut-keys"><kbd>Ctrl</kbd> + <kbd>S</kbd></span><span>關閉所有功能與圖資（含原版 UI），僅保留 Google 擬真 3D 底圖</span></div>
      <div><span class="tw-shortcut-keys"><kbd>G</kbd></span><span>切換全球視角</span></div>
      <div><span class="tw-shortcut-keys"><kbd>T</kbd></span><span>切換台灣視角</span></div>
      <div><span class="tw-shortcut-keys"><kbd>Esc</kbd></span><span>收合快捷功能選單</span></div>
    </div><p class="tw-note">儲存目前狀態請使用顏料盤中的「儲存」或「專案」功能。</p>`);
  }

  async function openOriginalKeys() {
    close();
    if (!await providerSettings.open()) toast('服務與 API 設定尚未就緒，請稍後再試');
  }

  async function loadTrafficForScope({signal}={}){
    signal?.throwIfAborted();
    const epoch=workEpoch;
    if(!await hasApiKey('TOMTOM_API_KEY'))throw new Error('未輸入金鑰');
    if(epoch!==workEpoch)throw new DOMException('已停止載入','AbortError');
    const job=linkedLoad('正在取得 TomTom 即時路況…',signal),controller=job.controller;
    try{const layer=await loadTomtomFlow(viewer,{signal:controller.signal});if(epoch!==workEpoch){removeLayer(layer.id);throw new DOMException('已停止載入','AbortError');}return layer;}finally{job.finish();}
  }
  async function hasApiKey(name) {
    try {const presence=await browserAi('/keys');return Boolean(presence[name] ?? presence.env?.[name]);} catch { throw new Error('無法讀取金鑰設定，請確認本機資料服務已啟動後再試'); }
  }

  async function toggleGeminiLive() {
    voiceControlEpoch++;
    if (!geminiLive.active && !await hasApiKey('gemini')) {
      lastGeminiStatus = '尚未設定 Gemini Live API Key；請先開啟「服務與 API 金鑰設定」。';
      toast('請先設定 Gemini Live API Key');
      return;
    }
    await voiceSettingsReady;await geminiLive.toggle();
    syncVoiceState();
  }

  function renderResources() {
    const r = governor.lastSnapshot || {};
    open('系統資源', `<div class="tw-resource-grid">
      ${metric('系統 RAM',bytes(r.systemMemoryUsed),bytes(r.systemMemoryTotal))}
      ${metric('虛擬記憶體 / Swap',bytes(r.swapUsed),bytes(r.swapTotal))}
      ${metric(r.processLabel || '本程式 RAM',bytes(r.processMemory),'RSS')}
      ${r.processVirtualMemory ? metric('本程式虛擬記憶體',bytes(r.processVirtualMemory),'Virtual') : ''}
      ${metric('GPU',esc(r.gpuName||'未偵測'),'')}
      ${metric(r.gpuMemoryKind === 'shared' ? 'GPU 共享記憶體' : 'VRAM',bytes(r.gpuUsed),r.gpuTotal ? bytes(r.gpuTotal) : '總量未提供')}
      ${metric('本程式 GPU',bytes(r.processGpuUsed),r.gpuProcessIsExact?'Per-process':'估算/Device-wide')}
      </div>
      <h3>快速配置</h3>
      <div class="tw-profile-grid">${Object.entries(PROFILES).map(([k,v]) => `<button data-act="apply-profile" data-profile="${k}"><b>${v.label}</b><small>${v.fps} FPS</small></button>`).join('')}</div>
      <p class="tw-note">資源保護：${r.pressured?'目前正在降載':'正常'}。設定頁可調自訂 FPS、解析度與 3D Tiles 快取。</p>`);
  }

  function applyCustom() {
    const custom = {
      fps:num('#tw-c-fps',40),
      scale:num('#tw-c-scale',0.9),
      cacheMB:num('#tw-c-cache',384),
      sse:num('#tw-c-sse',20),
      overflowMB:128,
    };
    governor.apply('custom', custom);
    renderSettings();
  }

  function renderLayers() {
    removeDuplicateBuffers();
    const layers = listLayers();
    const selectedScope=dataScope();
    const builtins = currentBuiltinStatus().map(item=>{
      const assigned=item.layer?.dataMetadata?.scope;
      const matches=!assigned || (assigned.mode===selectedScope.mode && (assigned.mode==='taiwan' || assigned.county===selectedScope.county));
      return matches ? item : {...item,loaded:false,layer:null};
    });
    const childrenOf = layer => layers.filter(child => child.bufferSourceId === layer.id || (child.parentSourceKey && child.parentSourceKey === layer.sourceKey));
    const childTree = (layer,depth=0) => depth > 4 ? '' : `<div class="tw-layer-tree">${childrenOf(layer).filter(child=>child.id !== layer.id).map(child => layerRow(child,depth+1)).join('')}${reportRows(layer.aiReports)}</div>`;
    const layerRow = (layer,depth=0) => catalogRow({name:layer.name,color:layer.style?.stroke || '#38bdf8',description:layer.description || layer.kind,source:layer.source || layer.sourceProject || '使用者匯入',layer,
      countText:layer.pendingService ? '待連線' : undefined,details:layer.geojson || layer.kind==='3d-tiles' ? layerTools(layer,layers) : `<p class="tw-note">圖磚供顯示；沒有可直接統計的向量。</p><button data-act="layer-ai" data-layer="${layer.id}">AI 解讀來源與限制</button><button data-act="layer-remove" data-layer="${layer.id}">移除</button>`,children:childTree(layer,depth)});
    const groups = [...new Set(BUILTIN_LAYER_CATALOG.map(item=>item.group))];
    const dtm = layers.find(layer=>layer.sourceKey === 'official-dtm-2025');
    const dtmChildren = layers.filter(layer=>layer.kind === 'dtm' && layer !== dtm && !layer.sourceProject);
    const terrainChildren = layers.filter(layer=>layer.parentSourceKey === 'official-dtm-2025');
    const buildings = layers.filter(layer=>layer.kind === '3d-tiles');
    const reference = layers.find(layer=>layer.kind === 'national-wms');
    const projectLayers = layers.filter(layer=>layer.sourceProject && !layer.bufferSourceId && !layer.parentSourceKey);
    const files = [...new Set(projectLayers.map(layer=>layer.sourceProject))];
    const custom = layers.filter(layer=>!['world-terrain','taiwan-relief','tomtom-flow-image','osm-labels'].includes(layer.kind) && !layer.builtinId && layer !== dtm && !dtmChildren.includes(layer) && !layer.sourceProject && !['3d-tiles','national-wms'].includes(layer.kind) && !layer.parentSourceKey && !layer.bufferSourceId);
    open('圖資',`${scopeControls()}<div class="tw-actions"><button data-act="hide-all-layers">一鍵隱藏所有圖資</button><button data-act="import-data">＋ 新增自己的圖資</button><button data-act="import-project">開啟 JSON 專案</button><button data-act="builtin-load-all" ${batchRunning ? 'disabled' : ''}>載入內建全部圖資</button></div>
      <div id="tw-layer-load-status" class="tw-note" role="status">${esc(batchProgress).replace(/\n/g,'<br>')}</div>
      <p class="tw-note">各來源只建立一個圖層；更新取代同來源資料。展開各項可查看說明、匯入圖層及分析成果。</p>
      ${serviceCatalogRows(layers)}
      ${groups.map(group=>`<div class="tw-catalog-group"><b class="tw-group-label">${esc(group)}</b>${builtins.filter(item=>item.group === group).map(item=>catalogRow({name:item.name,color:BUILTIN_LAYER_CATALOG.find(entry=>entry.id === item.id)?.style.stroke || '#fff',description:item.description,source:[item.source,item.officialAlternative].filter(Boolean).join(' · '),layer:item.layer,
        load:`data-act="builtin-load" data-builtin="${item.id}"`,update:item.id==='osm-rail'?`data-act="builtin-load" data-builtin="${item.id}"`:`data-act="builtin-load" data-builtin="${item.id}" data-fresh="true" title="向 Overpass 重新查詢所選範圍；公開來源失效時可能只有部分資料"`,busy:singleLoadingId === item.id,error:layerErrors.get(item.id),details:item.layer ? layerTools(item.layer,layers) : '',children:item.layer ? childTree(item.layer) : ''})).join('')}</div>`).join('')}
      <div class="tw-catalog-group"><b class="tw-group-label">地形與 3D 建物</b>
        ${catalogRow({name:'全臺 20 公尺 DTM',color:'#edd27b',description:'2025 官方原始格網已下載至本機；畫面按視野取樣，量測直接讀取原始格網分析。',source:'內政部 · EPSG:3826 · 固定版本，非即時資料',layer:dtm?.visible ? dtm : null,load:'data-act="dtm-bundled"',update:'data-act="dtm-bundled"',
          details:`<p class="tw-note">畫面最多 8,500 個樣點，最多繪製 600 點；不是完整 Cesium 地形表面。</p><label>匯入 CSV 座標系統<select id="tw-dtm-crs"><option value="EPSG:3826">TWD97 / TM2 121（EPSG:3826）</option><option value="EPSG:3825">TWD97 / TM2 119（EPSG:3825）</option><option value="EPSG:4326">經緯度（EPSG:4326）</option></select></label><button data-act="dtm-import">匯入 DTM CSV</button>${dtm ? layerTools(dtm,layers) : ''}`,
          children:`<div class="tw-layer-tree">${[...dtmChildren,...terrainChildren].map(layer=>layerRow(layer)).join('')}${reportRows(dtm?.aiReports)}</div>`})}
        ${catalogRow({name:'NLSC 3D 建物',color:'#a78bfa',description:'國土測繪中心免登入 3D Tiles；選擇涵蓋縣市後，按需載入可見圖磚。',source:'國土測繪中心多維度平台 · 量測統計另讀官方分棟編號與中心座標',layer:buildings.length ? {id:'nlsc-all',visible:buildings.some(layer=>layer.visible)} : null,countText:`${buildings.length} 項`,load:'data-act="nlsc-load"',update:'data-act="nlsc-load"',
          details:`<label class="tw-inline-option"><input type="checkbox" data-building-white ${buildingWhiteMode(viewer)?'checked':''}>白模模式</label><button data-act="nlsc-discover">更新官方服務清單</button>${nlscServices.length ? `<label>建物服務<select id="tw-nlsc-service">${nlscServices.map(item=>`<option value="${esc(item.url)}" ${item.url === selectedNlscUrl ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>` : ''}<label>手動 3D Tiles 網址<input id="tw-nlsc-url" type="url" placeholder="https://…nlsc.gov.tw/…/tileset.json"></label><p id="tw-nlsc-status" class="tw-note">${esc(nlscNotice)}</p>`,children:`<div class="tw-layer-tree">${buildings.map(layer=>layerRow(layer)).join('')}</div>`})}
      </div>
      <div class="tw-catalog-group"><b class="tw-group-label">全臺參考圖</b>${catalogRow({name:'NLSC 道路、水系與鐵路參考圖',color:'#87caca',description:'全臺線上地圖圖磚，向量分析請使用上方獨立圖層。',source:'NLSC EMAP2 WMS · 非分析向量',layer:reference,load:'data-act="national-reference"',details:`<p class="tw-note">參考圖僅供判讀；下列按鈕會載入獨立向量圖層，沿用上方所選縣市／全台灣範圍，可用於相交、長度及影響範圍分析。</p><div class="tw-actions">${[['osm-roads','道路中心線'],['osm-waterways','河川／水系中心線'],['osm-water','水域面'],['osm-rail','鐵路']].map(([id,label])=>`<button data-act="builtin-load" data-builtin="${id}">載入${label}</button>`).join('')}</div><p class="tw-note">道路與水文使用內建 OSM 固定版；鐵路使用官方開放資料。圖磚不提供分析向量。</p>`})}</div>
      ${files.map(file=>`<div class="tw-catalog-group" data-layer-group>${groupHeading(`json:${file}`,`JSON 專案：${file}`)}<div class="tw-group-content" ${collapsedGroups.has(`json:${file}`)?'hidden':''}><div class="tw-layer-tree">${projectLayers.filter(layer=>layer.sourceProject === file).map(layer=>layerRow(layer)).join('')}${activeProject?.sourceFile === file ? reportRows(activeProject.metadata?.aiReports) : ''}</div></div></div>`).join('')}
      ${custom.length ? `<div class="tw-catalog-group"><b class="tw-group-label">匯入與繪製圖資</b>${custom.map(layer=>layerRow(layer)).join('')}</div>` : ''}
      <details class="tw-details"><summary>官方 NLSC 向量代碼與資料狀態</summary><p class="tw-note">WFS 向量服務需申請；內建鐵路為另外公布的官方開放資料固定版本。</p>${OFFICIAL_TAIWAN_VECTOR_REFERENCES.map(([name,code])=>`<div class="tw-official-row"><span>${esc(name)}</span><code>${esc(code)}</code></div>`).join('')}<div class="tw-actions"><button data-act="osm-check">查看 OSM 資料時間</button></div><div id="tw-live-health"></div></details>`);
  }
  function scopeControls() {
    const selection=dataScope();
    return `<div class="tw-scope-controls"><label>圖資載入範圍（縣市／全台灣）<select id="tw-data-scope"><option value="taiwan" ${selection.mode === 'taiwan' ? 'selected' : ''}>全台灣</option>${TAIWAN_COUNTIES.map(([name])=>`<option value="${name}" ${selection.mode === 'county' && name === selection.county ? 'selected' : ''}>${name}</option>`).join('')}</select></label><div class="tw-actions"><button data-act="scope-apply">套用／切換範圍</button><button data-act="scope-off">關閉範圍圖資</button></div><p class="tw-note">目前：${scopeLabel()}。行政界保留外島；全球影像／地形依視野串流。OSM 向量受公開服務與容量限制，缺漏會註記。</p></div>`;
  }
  function serviceCatalogRows(layers) {
    const labels={'photoreal':'Google 擬真 3D','bing-aerial':'Bing 影像','bing-labels':'Bing 影像與標籤','esri-imagery':'Esri 衛星影像','osm':'OpenStreetMap 底圖'};
    const maps=mapStackController?.getStacks() || [];
    const live=[['ais-live-vessels','船舶 AIS 動態','#38bdf8','AISStream；依所選縣市外框（含附近海域）篩選，資料涵蓋由來源決定'],['local-firms','NASA FIRMS 熱點','#fb7185','NASA FIRMS 衛星偵測；不是已確認的火災範圍'],['earthquakes','USGS 地震事件','#f97316','USGS 近 24 小時 M2.5+ 事件；非台灣地震的完整清冊'],['flights','飛機即時動態','#fbbf24','OpenSky / ADS-B；只顯示來源當下回傳的範圍內航機']];
    const terrain=layers.find(layer=>layer.kind === 'world-terrain'),relief=layers.find(layer=>layer.kind === 'taiwan-relief'),traffic=layers.find(layer=>layer.kind === 'tomtom-flow-image');
    return `<div class="tw-catalog-group"><b class="tw-group-label">影像與擬真底圖</b>${maps.map(map=>catalogRow({name:labels[map.id] || map.label,color:'#38bdf8',description:map.kind==='nlsc' ? '國土測繪中心全臺線上圖磚，包含來源提供的外島；依視野載入，底圖一次使用一種。影像不能直接作為分析向量。' : '全球串流底圖，縣市模式定位到所選範圍；底圖一次使用一種。',source:map.kind==='nlsc' ? `國土測繪中心 WMTS · ${map.nlscLayer} · 免輸入金鑰` : map.requiresIon ? 'Bing / Cesium ion；需 Cesium Token' : map.label,layer:mapStackController.getActiveId() === map.id ? {id:`map:${map.id}`,visible:viewer.scene.globe.show || mapStackController.getImageryHostTileset()?.show,action:`data-act="map-stack" data-map="${map.id}"`} : null,load:`data-act="map-stack" data-map="${map.id}"`,error:layerErrors.get(`map:${map.id}`) || (!map.available ? '此來源尚未就緒；請檢查金鑰設定後重新開啟。' : null)})).join('')}</div>
      <div class="tw-catalog-group"><b class="tw-group-label">全球地形與地名</b>${catalogRow({name:'OSM 道路、建物與景點標籤',color:'#91bafa',description:'OSM 道路、建物與景點名稱；置頂顯示，不被其他 3D 建物遮住，依目前視野查詢。',source:'OpenStreetMap / Overpass；不需 API Key',layer:layers.find(layer=>layer.kind==='osm-labels'),load:'data-act="osm-labels"',details:`<p class="tw-note">${esc(layers.find(layer=>layer.kind==='osm-labels')?.status || '尚未載入')}。名稱依 OSM 涵蓋範圍，不是每棟建物都有名稱。請放大到城市或街道；單次查詢限畫面中心附近約 12 公里，最多 800 筆並避開文字重疊。</p>`})}${catalogRow({name:'全球地形',color:'#91b773',description:'3D 地表高程；有 Cesium Token 使用 World Terrain，無 Token 使用 Re:Earth。加入量測子圖資並確認後可取樣高程；與官方20m DTM分開標示。',source:terrain?.source || 'Cesium / Re:Earth',layer:terrain,load:'data-act="world-terrain"'})}${catalogRow({name:'台灣 3D 地形地貌',color:'#85ddd1',description:'真實地形搭配 NLSC 正射影像、山坡光影與青色縣市界；預設高程視覺放大 3 倍，方便辨認山脈、河谷及平原。',source:relief?.source || 'Cesium / Re:Earth 地形 + NLSC PHOTO2 + 官方縣市界',layer:relief,load:'data-act="taiwan-relief"',details:`<p class="tw-note">開啟時暫時切換地形展示，隱藏或移除後恢復先前底圖。高程放大只影響顯示，不更動量測高程；不是官方 20 公尺 DTM 模型。同時顯示 NLSC 建物時改採真實高度 1 倍，避免地形遮住建物；隱藏建物後恢復設定倍率。</p>${relief ? `<label>高程視覺放大倍率<input type="number" data-relief-scale data-layer="${relief.id}" value="${relief.getScale()}" title="目前實際倍率 ${relief.getEffectiveScale?.()??relief.getScale()}" min="1" max="6" step="0.5"></label><div class="tw-actions"><button data-act="relief-focus" data-layer="${relief.id}">查看台灣地形</button><button data-act="layer-remove" data-layer="${relief.id}">移除</button></div>` : ''}`})}</div>
      <div class="tw-catalog-group"><b class="tw-group-label">即時資料</b>${catalogRow({name:'TomTom 即時交通',color:'#fb923c',description:'細線與移動點位呈現車流；綠色順暢、黃色變慢、紅色壅塞、紫色封路。點位為速度示意，非個別車輛位置；路況每兩分鐘更新。',source:'TomTom Traffic Flow · 需 API Key',layer:traffic,error:layerErrors.get('traffic-key'),load:'data-act="tomtom-flow"',update:'data-act="tomtom-flow"',details:liveDescription('traffic',traffic?.getStats?.(),traffic?.visible).map(text=>`<p class="tw-note">${esc(text)}</p>`).join('')})}${live.filter(([id])=>dataManager?.layers.has(id)).map(([id,name,color,source])=>catalogRow({name,color,description:`${scopeLabel()}；按載入才啟動，隱藏即停止資料更新。`,source,error:layerErrors.get(`live:${id}`),layer:dataManager.isEnabled(id) ? {id:`live:${id}`,visible:true,action:`data-act="live-layer" data-live="${id}"`} : null,load:`data-act="live-layer" data-live="${id}"`,details:id === 'cctv' ? '<button data-act="open-cctv">開啟原版 CCTV 面板</button>' : liveDescription(id,{...dataManager.layers.get(id).module.getStats?.(),...(layerErrors.has(`live:${id}`) ? {error:layerErrors.get(`live:${id}`)} : {})},dataManager.isEnabled(id)).map(text=>`<p class="tw-note">${esc(text)}</p>`).join('')})).join('')}</div>`;
  }
  function catalogRow({name,color,description,source,layer,load,update,busy,error,countText,details='',children=''}) {
    return `<div class="tw-layer-row" ${layer?.id ? `data-style-layer="${esc(layer.id)}"` : ''}><div class="tw-layer-main"><b class="tw-layer-name"><span class="tw-layer-swatch" style="--tw-layer-color:${esc(color)}" aria-hidden="true"></span>${esc(name)}</b><small>${esc(description)}</small><span class="tw-source-line">${esc(source)}</span></div><div class="tw-row-actions">${busy ? `<span class="tw-badge">${layer?.geojson?.features.length || 0} 筆 · 載入中…</span>` : layer ? `<span class="tw-badge ok">${countText || (layer.geojson ? `${layer.geojson.features.length} 筆${layer.dataMetadata?.partial ? "（部分資料）" : ""}` : '已載入')}</span><button ${layer.action || `data-act="layer-toggle" data-layer="${layer.id}"`}>${layer.visible ? '隱藏' : '顯示'}</button>${update ? `<button ${update}>更新</button>` : ''}` : load ? `<button ${load}>載入</button>` : ''}</div>${error ? `<p class="tw-layer-error" role="alert">${esc(error)}</p>` : ''}${details ? `<details class="tw-layer-more"><summary>說明與分析</summary>${details}</details>` : ''}${children}</div>`;
  }
  function reportRows(reports=[]) {
    return reports.map(report=>`<details class="tw-ai-report"><summary>AI 解讀 · ${esc(new Date(report.createdAt).toLocaleString('zh-TW'))}</summary><small>${esc(report.model)} · 模型解讀，非新增的空間計算</small><div class="tw-chat-content">${renderChatMarkdown(report.content)}</div></details>`).join('');
  }

  async function connectPendingLayer(layer,{signal}={}) {
    signal?.throwIfAborted();
    const loaded = await loadNlscBuildings(layer.serviceUrl,viewer,{name:layer.name,flyTo:false,signal});
    if(signal?.aborted){removeLayer(loaded.id);signal.throwIfAborted();}
    Object.assign(loaded,{sourceProject:layer.sourceProject,sourceProjectKey:layer.sourceProjectKey,dataMetadata:{...loaded.dataMetadata,...layer.dataMetadata},aiReports:layer.aiReports});
    if(loaded.setHeightOffset && Number.isFinite(layer.dataMetadata?.displayHeightOffset))loaded.setHeightOffset(layer.dataMetadata.displayHeightOffset);
    if (activeProject?.layerIds?.includes(layer.id)) activeProject.layerIds = activeProject.layerIds.map(id=>id === layer.id ? loaded.id : id);
    return loaded;
  }
  async function loadNlscFromPanel() {
    let url = body.querySelector('#tw-nlsc-url')?.value.trim() || body.querySelector('#tw-nlsc-service')?.value;
    if (!url) { await discoverNlsc(); url = selectedNlscUrl || matchingBuildingService(viewer,nlscServices)?.url; }
    if (!url) throw new Error('官方清單目前沒有可用建物服務；可稍後重試或貼上已取得的 NLSC 3D Tiles 網址');
    selectedNlscUrl = url;
    const selected = nlscServices.find(item => item.url === url);
    const status = body.querySelector('#tw-nlsc-status');
    if (status) status.textContent = '正在載入 NLSC 3D 建物…';
    try { await loadNlscBuildings(url, viewer, { name:selected?.name || 'NLSC 3D 建物' }); nlscNotice = `已載入 ${selected?.name || 'NLSC 3D 建物'}`; renderLayers(); toast(nlscNotice); }
    catch (error) { if (status) status.textContent = `載入失敗：${error.message}`; throw error; }
  }

  async function loadLocalDtm({signal}={}) {
    const job=linkedLoad("正在載入官方 DTM… 按 Ctrl+S 可停止",signal),controller=job.controller;
    try{await ensureCounties();controller.signal.throwIfAborted();const result = await loadBundledDtm(viewer,{bbox:scopeBounds(),signal:controller.signal});
    if(controller.signal.aborted){removeLayer(result.layer.id);controller.signal.throwIfAborted();}
    renderLayers();
    toast(`已載入 ${result.layer.geojson.features.length} 個官方 DTM 樣點，取樣間距約 ${result.sampledSpacingMeters} 公尺`);return result.layer;
    }finally{job.finish();}
  }

  async function discoverNlsc({signal}={}) {
    nlscNotice = '正在查詢 NLSC 官方服務清單…';
    const status = body.querySelector('#tw-nlsc-status');
    if (status) status.textContent = nlscNotice;
    const response = await fetch('/api/taiwan/nlsc-buildings', { cache:'no-store',signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '官方服務清單讀取失敗');
    nlscServices = result.services || [];
    if (!nlscServices.some(item => item.url === selectedNlscUrl)) selectedNlscUrl = matchingBuildingService(viewer,nlscServices)?.url || nlscServices[0]?.url || '';
    nlscNotice = nlscServices.length ? `${result.stale ? `使用 ${result.snapshotCapturedAt} 官方備援清單；` : ''}查得 ${nlscServices.length} 個建物服務。${result.warning || ''}` : '官方清單目前未列出可解析的建物 tileset 網址，可使用手動網址。';
    renderLayers();
  }

  async function doLoadBuiltin(id,{fromBatch=false,fresh=false,strict=false,signal}={}) {
    signal?.throwIfAborted();
    if (singleLoadingId || (batchRunning && !fromBatch)){if(strict)throw new Error('另有圖資正在載入，請稍後再試');return;}
    const epoch=workEpoch;
    const item = BUILTIN_LAYER_CATALOG.find(x => x.id === id);
    if (!item) throw new Error('找不到內建圖層');
    const controller = new AbortController();
    const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
    layerErrors.delete(id);
    singleLoadingId = id;
    batchProgress = `正在載入「${item.name}」…`;
    renderLayers();
    showLoading(`正在載入「${item.name}」… 按 Ctrl+S 可停止`, controller);
    try {
      const layer = await loadScopedBuiltinLayer(id, viewer, { fresh,signal:controller.signal,onProgress:message=>{batchProgress=message;const status=body.querySelector('#tw-layer-load-status');if(status)status.textContent=message;} });
      if(controller.signal.aborted){removeLayer(layer.id);controller.signal.throwIfAborted();}
      const metadata=layer.dataMetadata;
      if(metadata?.partial)layerErrors.set(id,`部分圖資：${metadata.completedPartitions}/${metadata.totalPartitions} 個分區完成；未完成分區請稍後按更新。`);
      else if(metadata?.stalePartitions)layerErrors.set(id,`${metadata.stalePartitions}個分區使用來源失效前的快取資料；實際來源時間請查看說明。`);
      batchProgress = `已載入「${item.name}」：${layer.geojson?.features?.length ?? 0} 筆${metadata?.partial ? '（部分圖資，請查看分區說明）' : ''}`;
      toast(`已載入 ${layer.name}：${layer.geojson?.features?.length ?? 0} 筆`);
      return layer;
    } catch (error) {
      const message = error?.name === 'AbortError' ? '已停止載入' : error?.message || String(error);
      layerErrors.set(id, message);
      batchProgress = `「${item.name}」載入失敗：${message}`;
      toast(batchProgress);if(strict)throw error;
    } finally {
      signal?.removeEventListener('abort',abort);
      singleLoadingId = null;
      hideLoading(controller);
      if(epoch===workEpoch)renderLayers();
    }
  }

  async function focusScope() {
    await ensureCounties();const bbox=scopeBounds();
    const selection=dataScope();
    // Offshore parts remain in the data mask; camera uses the largest land part.
    let view=selection.mode === 'taiwan' ? {west:117.8,south:21.6,east:122.3,north:26.5} : bbox;
    if(selection.mode === 'county') {const feature=scopeGeometry();if(feature.geometry.type === 'MultiPolygon'){const parts=feature.geometry.coordinates.map(coordinates=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates}})).sort((a,b)=>Cesium.Rectangle.computeWidth(Cesium.Rectangle.fromDegrees(...bboxArray(a)))*Cesium.Rectangle.computeHeight(Cesium.Rectangle.fromDegrees(...bboxArray(a)))-Cesium.Rectangle.computeWidth(Cesium.Rectangle.fromDegrees(...bboxArray(b)))*Cesium.Rectangle.computeHeight(Cesium.Rectangle.fromDegrees(...bboxArray(b))));const biggest=parts.at(-1);const box=bboxArray(biggest);view={west:box[0],south:box[1],east:box[2],north:box[3]};}}
    await new Promise(resolve=>viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(view.west,view.south,view.east,view.north),duration:0.8,complete:resolve,cancel:resolve}));
  }
  function bboxArray(feature) {const box=[Infinity,Infinity,-Infinity,-Infinity];function walk(value){if(typeof value[0] === 'number'){box[0]=Math.min(box[0],value[0]);box[1]=Math.min(box[1],value[1]);box[2]=Math.max(box[2],value[0]);box[3]=Math.max(box[3],value[1]);}else for(const child of value)walk(child);}walk(feature.geometry.coordinates);return box;}

  async function applyScope() {
    const choice=body.querySelector('#tw-data-scope').value,mode=choice==='taiwan' ? 'taiwan' : 'county',county=choice==='taiwan' ? dataScope().county : choice;
    const ids=listLayers().filter(layer=>layer.visible && layer.builtinId).map(layer=>layer.builtinId);
    const dtmOn=listLayers().some(layer=>layer.sourceKey === 'official-dtm-2025' && layer.visible);
    const buildingOn=listLayers().some(layer=>layer.kind === '3d-tiles' && layer.visible);
    const referenceOn=listLayers().some(layer=>layer.kind === 'national-wms' && layer.visible);
    const trafficOn=listLayers().some(layer=>layer.kind === 'tomtom-flow-image' && layer.visible);
    const liveIds=['cctv','flights','ais-live-vessels','local-firms','earthquakes'].filter(id=>dataManager?.isEnabled(id));
    await stopAllWork();await stopProjectFeeds();nationwideBuildingsEnabled=false;const epoch=workEpoch;await setDataScope(mode,county);
    for(const layer of listLayers())if(layer.builtinId || layer.scopeManaged || ['3d-tiles','national-wms','dtm'].includes(layer.kind))setLayerVisible(layer.id,false);
    await focusScope();renderLayers();
    for(const id of ids){if(epoch !== workEpoch)return;await doLoadBuiltin(id);}
    if(epoch !== workEpoch)return;if(dtmOn)await loadLocalDtm();if(epoch !== workEpoch)return;if(buildingOn)await loadNlscScope();if(epoch !== workEpoch)return;if(referenceOn)loadNationalReferenceMap(viewer,{bbox:scopeBounds()});if(trafficOn)await loadTrafficForScope();
    for(const id of liveIds){if(epoch !== workEpoch)return;await dataManager.setEnabled(id,true,{origin:'user'});}
    batchProgress=`已切換至${scopeLabel()}；已開啟圖資依新範圍更新。`;renderLayers();
  }
  async function loadNlscScope({signal}={}) {
    const job=linkedLoad("正在載入 NLSC 3D 建物… 按 Ctrl+S 可停止",signal),controller=job.controller;
    try{await ensureCounties();if(!nlscServices.length)await discoverNlsc({signal:controller.signal});controller.signal.throwIfAborted();
    const selection=dataScope();nationwideBuildingsEnabled=selection.mode === 'taiwan';
    const normalize=value=>value.replace(/臺/g,'台');
    const service=selection.mode === 'county' ? nlscServices.find(item=>normalize(item.name).startsWith(normalize(selection.county)) && !/分棟|Individual/.test(item.name)) || nlscServices.find(item=>normalize(item.name).startsWith(normalize(selection.county))) : matchingBuildingService(viewer,nlscServices);
    if(!service)throw new Error(`${scopeLabel()}沒有可用建物服務`);
    await prepareBuildingSurface(viewer,{signal:controller.signal});controller.signal.throwIfAborted();
    selectedNlscUrl=service.url;
    for(const layer of listLayers().filter(layer=>layer.kind === '3d-tiles'))setLayerVisible(layer.id,false);
    const existing=listLayers().find(layer=>layer.serviceUrl === service.url);
    if(existing?.pendingService)await connectPendingLayer(existing,{signal:controller.signal});else if(existing)setLayerVisible(existing.id,true);else await loadNlscBuildings(service.url,viewer,{name:service.name,flyTo:false,signal:controller.signal});
    const visibleBuilding=listLayers().find(layer=>layer.serviceUrl===service.url);
     if(selection.mode==='county' && visibleBuilding?.tileset)await viewer.zoomTo(visibleBuilding.tileset,new Cesium.HeadingPitchRange(0,Cesium.Math.toRadians(-45),0));
     if(controller.signal.aborted){const loaded=listLayers().find(layer=>layer.serviceUrl===service.url);if(loaded)setLayerVisible(loaded.id,false);nationwideBuildingsEnabled=false;controller.signal.throwIfAborted();}
    nlscNotice=`已連接 ${service.name}${nationwideBuildingsEnabled ? '；全台灣按視野分縣載入' : ''}`;renderLayers();
    }finally{job.finish();}
  }
  async function doLoadAllBuiltins() {
    if(batchRunning || singleLoadingId)return;
    batchRunning=true;const epoch=workEpoch;
    try{
      await ensureCounties();await focusScope();if(epoch !== workEpoch)return;
      await loadLocalDtm();if(epoch !== workEpoch)return;loadNationalReferenceMap(viewer,{bbox:scopeBounds()});
      try{await loadNlscScope();}catch(error){if(error.name === 'AbortError')return;nlscNotice=error.message;}
      for(const item of BUILTIN_LAYER_CATALOG){if(epoch !== workEpoch)return;await doLoadBuiltin(item.id,{fromBatch:true});}
    }finally{batchRunning=false;if(epoch===workEpoch)renderLayers();}
  }

  function matchingBuildingService(viewer, services) {
    const canvas = viewer.scene.canvas;
    const ground = viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
      viewer.scene.globe.ellipsoid,
    );
    const center = ground ? Cesium.Cartographic.fromCartesian(ground) : viewer.camera.positionCartographic;
    const lon = Cesium.Math.toDegrees(center.longitude);
    const lat = Cesium.Math.toDegrees(center.latitude);
    if (lon < 119 || lon > 123 || lat < 21 || lat > 27) return null;
    const nearest = TAIWAN_COUNTIES.reduce((best, county) => {
      const score = (county[1] - lat) ** 2 + ((county[2] - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
      return !best || score < best.score ? { name:county[0], score } : best;
    }, null);
    return services.find(item => item.name.includes(nearest.name) || item.name.includes(nearest.name.replace('臺','台')));
  }

  function manageableVectorBbox(viewer) {
    const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rect) throw new Error('無法判斷目前視窗範圍');
    const view = {
      west:Cesium.Math.toDegrees(rect.west), south:Cesium.Math.toDegrees(rect.south),
      east:Cesium.Math.toDegrees(rect.east), north:Cesium.Math.toDegrees(rect.north),
    };
    const canvas = viewer.scene.canvas;
    const ground = viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
      viewer.scene.globe.ellipsoid,
    );
    if (!ground) return view;
    const center = Cesium.Cartographic.fromCartesian(ground);
    const lon = Cesium.Math.toDegrees(center.longitude);
    const lat = Cesium.Math.toDegrees(center.latitude);
    const bbox = {
      west:Math.max(view.west,lon-0.25), south:Math.max(view.south,lat-0.25),
      east:Math.min(view.east,lon+0.25), north:Math.min(view.north,lat+0.25),
    };
    return bbox.east > bbox.west && bbox.north > bbox.south ? bbox : view;
  }

  async function loadBuildingForView() {
    const selected = matchingBuildingService(viewer,nlscServices);
    if (!selected || buildingLoadPending || selected.url === lastBuildingAttemptUrl) return;
    if (listLayers().some(layer => layer.nationwideAuto && layer.serviceUrl === selected.url)) return;
    buildingLoadPending = true;const epoch=workEpoch;automaticBuildingLoad=new AbortController();
    lastBuildingAttemptUrl = selected.url;
    try {
      const layer = await loadNlscBuildings(selected.url,viewer,{ name:selected.name, flyTo:false, nationwideAuto:true,signal:automaticBuildingLoad.signal });
      if(epoch !== workEpoch || !nationwideBuildingsEnabled){removeLayer(layer.id);return;}
      for (const old of listLayers().filter(item => item.nationwideAuto && item.id !== layer.id)) removeLayer(old.id);
      nlscNotice = `已載入 ${selected.name}，移至其他縣市時會按需切換。`;
      return layer;
    } finally { buildingLoadPending = false;automaticBuildingLoad=null; }
  }

  function captureRouteInputs(){
    const field=key=>drivingPanel?.body.querySelector(`#tw-route-${key}`);
    if(field('origin'))routeInputs={...routeInputs,origin:field('origin').value,destination:field('destination').value,travelMode:field('mode').value,waypoints:[...(drivingPanel?.body.querySelectorAll('[data-route-waypoint]')||[])].map(input=>input.value)};
    return routeInputs;
  }
  let drivingPanel=null;
  function renderAnalysis(){
    open('分析',`<article class="tw-card"><h3>交通與影像分析</h3><div class="tw-actions tw-analysis-entries"><button data-act="transit-panel">AI智慧大眾運輸</button><button data-act="driving-panel">行車路線與導航</button><button data-act="cctv-panel">CCTV監看與AI辨識</button></div><p class="tw-note">三個功能可同時開啟；再次點選會叫回原視窗。GIS 圖層分析仍可於圖資與標註使用。</p></article>`);
  }
  function renderDriving(){
    if(!drivingPanel)drivingPanel=floatingPanels.create({id:'driving-controls',title:'行車路線與導航',width:440,height:650,onClose:()=>{captureRouteInputs();navigation.stopNavigation();}});
    drivingPanel.body.classList.add('tw-driving');
    drivingPanel.body.innerHTML=`<article class="tw-card"><h3>行車路線與導航</h3><label>起點<input id="tw-route-origin" value="${esc(routeInputs.origin)}" placeholder="例如 宜蘭縣審計室（留空使用地圖中心）"></label><label>交通方式<select id="tw-route-mode"><option value="car" ${routeInputs.travelMode==='car'?'selected':''}>汽車</option><option value="motorcycle" ${routeInputs.travelMode==='motorcycle'?'selected':''}>機車（避開高速公路）</option></select></label>
      <div class="tw-route-stops">${routeInputs.waypoints.map((value,index)=>`<label>中途點 ${index+1}<div class="tw-actions"><input data-route-waypoint value="${esc(value)}" placeholder="學校、地址或地標"><button data-act="route-stop-remove" data-index="${index}" aria-label="刪除中途點 ${index+1}">×</button><button data-act="route-stop-move" data-index="${index}" data-direction="up" aria-label="上移中途點">↑</button><button data-act="route-stop-move" data-index="${index}" data-direction="down" aria-label="下移中途點">↓</button></div></label>`).join('')}</div><button data-act="route-stop-add">新增中途點</button><label>終點<input id="tw-route-destination" value="${esc(routeInputs.destination)}" placeholder="例如 宜蘭縣政府"></label>
      <div class="tw-actions"><button data-act="route-plan">規劃行車路線</button><button data-act="route-show">查看路線</button><button data-act="nav-drive">沿路線行車視角</button><button data-act="nav-stop">停止</button><button data-act="route-ai-analyze">AI 分析目前路線</button></div><p class="tw-note" id="tw-navigation-status">TomTom 依序計算每段行車距離與即時路況時間；機車模式仍需依現場標誌確認。行進示意不是 GPS 實際位置。</p>
      <div class="tw-label-controls"><label>路線顏色<input type="color" data-route-style="color" value="${navigation.routeStyle.color}"></label><label>虛線粗細（像素）<input type="number" data-route-style="width" min="0.5" max="16" step="0.5" value="${navigation.routeStyle.width}"></label></div>
      <div class="tw-label-controls">${['car','motorcycle'].map(mode=>`<label>${mode==='car'?'汽車':'機車'}車身顏色<select data-vehicle-color="${mode}">${VEHICLE_COLORS.map(color=>`<option value="${color.id}" ${navigation.vehicleColors[mode]===color.id?'selected':''}>${color.name}</option>`).join('')}</select></label>`).join('')}</div><small>顏色保存在本機；只更換車身烤漆，保留輪胎、玻璃及燈具。</small></article>`;
    drivingPanel.restore();
  }
  async function analyzeCurrentRoute(){
    const route=navigation.currentRoute;if(!route)throw new Error('請先規劃行車路線');
    await sendAnalysisPrompt(`請分析目前行車路線與停靠安排，說明各段距離、時間、交通方式、順序及可以改善的安排。不可聲稱路線是最佳解。已由 TomTom 計算的資料：${JSON.stringify({start:route.start,end:route.end,stops:route.stops,travelMode:route.travelMode,summary:route.summary,legs:route.raw.legs.map(leg=>({summary:leg.summary}))})}`);
  }
  async function sendAnalysisPrompt(text){if(chatBusy)throw new Error('AI 空間助理正在回覆，請稍後再試');chatPanel.querySelector('#tw-chat-input').value=text;if(chatPanel.hidden)toggleChat();return sendChat();}
  async function analyzeCctvFrame(data,{signal}={}){
    const result=await browserAi('/cctv-analyze',{method:'POST',data,signal});signal?.throwIfAborted();return result;
  }
  function displayCctvResult(result){
    if(chatMessages.some(message=>message.cctvResult?.requestId===result.requestId))return;
    chatMessages.push(cctvResultMessage(result));showAssistant();chatStatus('CCTV 辨識完成，可繼續提問或儲存對話。');
  }
  function displayCctvError({cameraName,error}){
    chatMessages.push({role:'system',content:`${cameraName||'CCTV'}：目前免費辨識服務暫時不可用，請稍後再試。${error?.message||''}`});showAssistant();
  }
  async function planAerialWithAi(request){return requestAiAerialPlan(request,{hasApiKey,streamChat:streamBrowserChat});}
  async function saveAerialRecord(record){
    const metadata=record.metadata||{};
    return await chatArchive.save([{role:'assistant',content:`電影空拍錄影\n${JSON.stringify(metadata,null,2)}\n影片：${record.filename}\n飛行軌跡及影片可由「記錄 → 匯出」下載。`}],{title:'電影空拍錄影',media:{id:record.id,video:record.video,geojson:record.geojson,filename:record.filename,metadata,exported:record.exported}});
  }

  let lastDrawingResult = null;
  function drawingColor(mode) { return /^#[0-9a-f]{6}$/i.test(drawingColors[mode] || '') ? drawingColors[mode] : '#ffca55'; }
  function drawingStyle(mode) {return {fill:drawingColor(mode),...drawingFrame,radiusMeters:Number(body.querySelector('#tw-circle-radius')?.value)||100};}
  function readLabelOptions(){return Object.fromEntries([...body.querySelectorAll('[data-new-label]')].map(input=>[input.dataset.newLabel,input.value]));}
  function labelControls(style={},layerId=null){
    const value=normalizeLabelStyle(style),attr=key=>layerId?`data-label-style="${key}" data-layer="${layerId}"`:`data-new-label="${key}"`;
    return `<div class="tw-label-controls"><label>標籤文字<input ${attr('text')} maxlength="500" value="${esc(value.text)}" placeholder="輸入註記文字"></label><label>字體<select ${attr('font')}>${LABEL_FONTS.map(font=>`<option ${font===value.font?'selected':''}>${font}</option>`).join('')}</select></label><label>顏色<input type="color" ${attr('color')} value="${value.color}"></label><label>粗細<select ${attr('weight')}><option value="normal" ${value.weight==='normal'?'selected':''}>一般</option><option value="bold" ${value.weight==='bold'?'selected':''}>粗體</option></select></label><label>字級<input type="number" ${attr('size')} value="${value.size}" min="10" max="64"></label></div>`;
  }
  function renderDrawing() {
    open('標註與量測', `<details><summary>操作方式</summary><p class="tw-note">1 選擇工具與樣式 → 2 完成繪製 → 3 加入已載入圖資 → 4 確認後計算與 AI 分析。多邊形可點回起點閉合；圓形點中心後輸入半徑再按完成。</p></details>
      <div class="tw-drawing-tools"><div class="tw-drawing-tool"><button data-act="label-options">地圖文字標籤</button><input type="color" data-drawing-color="label" value="${drawingColor('label')}" aria-label="地圖文字標籤顏色"></div>${[['path','路徑'],['polygon','多邊形'],['circle','圓形'],['distance','量測距離'],['area','量測面積'],['camera','電影空拍']].map(([mode,label])=>`<div class="tw-drawing-tool"><button data-act="${mode==='camera'?'camera-path-start':'drawing-start'}" data-mode="${mode}">${label}</button><input type="color" data-drawing-color="${mode}" value="${drawingColor(mode)}" aria-label="${label}顏色"></div>`).join('')}</div>
      <div class="tw-style-controls"><label><input type="checkbox" data-drawing-frame="strokeEnabled" ${drawingFrame.strokeEnabled ? 'checked' : ''}>框線</label><label>框線顏色<input type="color" data-drawing-frame="stroke" value="${esc(drawingFrame.stroke)}" aria-label="繪製框線顏色"></label><label>粗細<input type="number" data-drawing-frame="strokeWidth" value="${drawingFrame.strokeWidth}" min="1" max="8" aria-label="繪製框線粗細"></label><label>圓形半徑（公尺）<input id="tw-circle-radius" type="number" value="${lastDrawingResult?.mode === 'circle' ? Number(Number(lastDrawingResult.radiusMeters).toFixed(1))||100 : 100}" min="1" max="100000" step="any"></label></div>
      <div class="tw-actions"><button data-act="drawing-finish">完成繪製</button><button data-act="drawing-cancel">取消</button></div><div id="tw-drawing-result" role="status"></div><div id="tw-drawing-layers" class="tw-project-tree"></div>
      <p class="tw-note">各繪製圖層只分析手動確認的子圖資。影像作為參照，不能直接計數；高程使用手動確認的全球地形、官方20m DTM或匯入樣點，結果會註明來源。NLSC 以分棟中心落在範圍內計數，單次範圍上限 2 平方公里；缺少資料代表未知。</p>`);
    renderDrawingResult(lastDrawingResult || {status:'選擇工具開始繪製。'});
  }
  function renderDrawingInputs(id) {
    if(!getLayer(id))return;
    inputCandidates=new Map(listLayers().filter(l=>l.visible!==false && !['annotation','drawing-input','building-analysis'].includes(l.kind)).map(l=>[l.id,l]));
    const mapId=mapStackController?.getActiveId();
    if(mapId && (viewer.scene.globe.show || mapStackController.getImageryHostTileset()?.show))inputCandidates.set('basemap:'+mapId,{id:'basemap:'+mapId,name:mapStackController.getStacks().find(m=>m.id===mapId)?.label || mapId,kind:'basemap',source:'目前已載入底圖；僅作參照'});
    for(const [key,l] of dataManager?.layers || [])if(dataManager.isEnabled(key))inputCandidates.set('live:'+key,{id:'live:'+key,name:l.label || key,kind:'live-reference',source:'目前啟動的即時服務；僅作參照'});
    const attached=drawingInputs(id);
    open('加入分析圖資',`<p>繪製範圍：${esc(getLayer(id).name)}</p><p class="tw-note">勾選需要的資料，按加入後回到該圖層確認。向量保留相交圖徵；服務保留來源參照，未加入的圖資不參與分析。</p>${[...inputCandidates.values()].map(l=>`<label class="tw-input-choice"><input type="checkbox" data-drawing-input value="${l.id}" ${attached.some(c=>c.dataMetadata.input.sourceId===l.id) ? 'disabled' : ''}><span>${esc(l.name)}<small>${esc(l.source || l.kind)}${l.geojson ? '' : ' · 服務參照'}</small></span></label>`).join('') || '<p>目前沒有已開啟的圖資。請先到圖資面板載入需要的資料。</p>'}<div class="tw-actions"><button data-act="drawing-input-load" data-layer="${id}">加入勾選圖資</button><button data-act="notes">返回標註</button></div>`);
  }
  async function loadDrawingInputs(id) {
    const selected=[...body.querySelectorAll('[data-drawing-input]:checked')].map(e=>inputCandidates.get(e.value)).filter(Boolean);
    if(!selected.length)throw new Error('請先勾選要加入的圖資');
    const controller=new AbortController(),epoch=workEpoch;showLoading('正在加入選取圖資…',controller);
    try{for(const source of selected){controller.signal.throwIfAborted();await attachDrawingInput(id,source,viewer,{signal:controller.signal});}if(epoch===workEpoch){expandedDrawingId=id;renderDrawing();toast('圖資已加入，請逐項確認後按「確認圖資」');}}finally{hideLoading(controller);}
  }
  async function calculateDrawing(id) {
    const controller=new AbortController(),epoch=workEpoch;showLoading('正在計算已確認的圖資…',controller);
    try{const result=await analyzeDrawingInputs(id,viewer,{signal:controller.signal,onProgress:message=>{root.querySelector('[data-loading-message]').textContent=message;}});if(epoch!==workEpoch)return;lastDrawingResult=result;expandedDrawingId=id;renderDrawing();}finally{hideLoading(controller);}
    if(epoch===workEpoch)await explainDrawing();
  }
  function measurementDetails(result) {
    return `<p>${esc(result.analysisStatus || result.status || '')}</p>
      ${Number.isFinite(result.radiusMeters) ? `<p>半徑：${result.radiusMeters.toFixed(1)} 公尺</p>` : ''}
      ${Number.isFinite(result.lengthMeters) ? `<p>長度／周長：${(result.lengthMeters/1000).toFixed(3)} 公里</p>` : ''}
      ${Number.isFinite(result.areaM2) ? `<p>面積：${(result.areaM2/1e6).toFixed(4)} 平方公里</p>` : ''}
      ${Number.isFinite(result.buildingCount) ? `<p>範圍內建物：${result.buildingCount} 棟${result.buildingCountComplete === false ? '（目前讀得的部分結果）' : ''}</p>` : result.calculatedAt ? '<p>建物數：尚無法確認，未視為 0 棟。</p>' : ''}
      ${result.buildingSource ? `<p class="tw-note">來源：${esc(result.buildingSource)}<br>${esc(result.buildingCountRule || '')}<br>${esc(result.buildingCoverage || '')}</p>` : ''}
      ${result.buildingWarning ? `<p class="tw-layer-error">${esc(result.buildingWarning)}</p>` : ''}
      ${(result.dtmSamples || result.terrainSamples) ? `<p>${result.dtmSamples ? '官方 DTM' : '全球地形'}：${result.dtmSamples || result.terrainSamples} 個樣點，高程 ${result.minHeightMeters.toFixed(1)}–${result.maxHeightMeters.toFixed(1)} 公尺，平均 ${result.meanHeightMeters.toFixed(1)} 公尺</p><p class="tw-note">${esc(result.heightSource)}；取樣間距約 ${Number(result.sampledSpacingMeters || 0).toFixed(1)} 公尺</p>` : result.calculatedAt ? '<p>尚未取得此範圍的高程樣點；請加入並確認地形圖資。</p>' : ''}
      ${Number.isFinite(result.terrainLengthMeters) ? `<p>地形路徑：約 ${(result.terrainLengthMeters/1000).toFixed(3)} 公里；上升／下降：${result.ascentMeters.toFixed(1)}／${result.descentMeters.toFixed(1)} 公尺</p>` : ''}
      ${result.dtmWarning ? `<p class="tw-layer-error">${esc(result.dtmWarning)}</p>` : ''}`;
  }
  function renderDrawingResult(result) {
    lastDrawingResult=result;
    const box=body.querySelector('#tw-drawing-result');if(!box)return;
    box.innerHTML=result.layerId ? '' : `${measurementDetails(result)}`;
    const list=body.querySelector('#tw-drawing-layers');
    if(list)list.innerHTML=listLayers().filter(layer=>['annotation','annotation-label'].includes(layer.kind)).map(layer=>layerTreeRow(layer)).join('');
  }
  async function explainDrawing() {
    if (!lastDrawingResult?.name) return;
    const input = chatPanel.querySelector('#tw-chat-input');
    focusLayer = lastDrawingResult.layerId || null; analysisTarget = focusLayer;
    input.value = `請解讀「${lastDrawingResult.name}」的範圍計算與已手動確認的子圖資，說明建物數、高程與資料限制。請使用程式提供的計算結果，保留官方來源原名，勿虛構未加入的資料或將模型棟數稱為現況清冊。`;
    if (chatPanel.hidden) toggleChat();
    try { await sendChat(); } finally { focusLayer = null; analysisTarget = null; }
  }

  function renderCurrentDrawer() {
    if(drawer.hidden)return;
    if(title.textContent === '圖資')renderLayers();
    else if(title.textContent === '專案')renderProject();
    else if(title.textContent === '標註與量測')renderDrawing();
  }
  function groupHeading(key,label) {
    const expanded=!collapsedGroups.has(key);
    return `<button class="tw-group-heading" data-act="group-collapse" data-group="${esc(key)}" aria-expanded="${expanded}" title="展開／收合項下圖層"><span class="tw-group-arrow" aria-hidden="true">${expanded?'▾':'▸'}</span><span>${esc(label)}</span></button>`;
  }
  function styleControls(layer) {
    if(layer.dataMetadata?.annotationLabel)return labelControls(layer.dataMetadata.annotationLabel,layer.id);
    if(!layer.dataSource || !layer.geojson?.features.length)return '';
    const style=layer.style||{},hex=v=>/^#[0-9a-f]{6}$/i.test(v||'') ? v : '#38bdf8';
    return `<div class="tw-style-controls ${['admin-counties','admin-towns'].includes(layer.builtinId)?'tw-outline-controls':''}"><label class="tw-fill-control">填色<input type="color" data-layer-style="fill" data-layer="${layer.id}" value="${hex(style.fill)}" aria-label="${esc(layer.name)}填色"></label><label>框線顏色<input type="color" data-layer-style="stroke" data-layer="${layer.id}" value="${hex(style.stroke)}" aria-label="${esc(layer.name)}框線顏色"></label><label>框線粗細（像素）<input step="0.5" aria-label="${esc(layer.name)}框線粗細" type="number" data-layer-style="strokeWidth" data-layer="${layer.id}" min="1" max="8" value="${Number(style.strokeWidth)||3}"></label><label><input type="checkbox" data-layer-style="strokeEnabled" data-layer="${layer.id}" ${style.strokeEnabled!==false ? 'checked' : ''}>顯示框線</label></div>`;
  }
  function layerTreeRow(layer,layers=listLayers(),depth=0) {
    if(depth>5)return '';
    const children=layers.filter(child=>child.bufferSourceId === layer.id && child.id !== layer.id),annotation=layer.kind==='annotation';
    const workflow=annotation ? `<div class="tw-actions compact"><button data-act="drawing-inputs" data-layer="${layer.id}">加入已載入圖資</button><button data-act="drawing-confirm" data-layer="${layer.id}">確認圖資</button><button data-act="drawing-ai-layer" data-layer="${layer.id}" ${!layer.dataMetadata?.analysisInputsConfirmed ? 'disabled' : ''}>計算並 AI 解析</button></div><p class="tw-note">${layer.dataMetadata?.analysisInputsConfirmed ? '✓ 已確認分析圖資；修改或刪除子圖資後需重新確認' : '尚未確認分析圖資'}</p>` : `<button data-act="layer-ai" data-layer="${layer.id}">AI 解析</button>`;
    return `<div class="tw-tree-node"><div class="tw-tree-label"><button class="tw-eye" data-act="layer-toggle" data-layer="${layer.id}" aria-label="${layer.visible ? '隱藏' : '顯示'} ${esc(layer.name)}" aria-pressed="${layer.visible !== false}">${layer.visible ? '◉' : '⊘'}</button><span class="tw-tree-title">${esc(layer.name)}</span><button data-act="layer-move" data-layer="${layer.id}" data-direction="up" aria-label="上移 ${esc(layer.name)}">↑</button><button data-act="layer-move" data-layer="${layer.id}" data-direction="down" aria-label="下移 ${esc(layer.name)}">↓</button><button data-act="layer-remove" data-layer="${layer.id}" aria-label="刪除 ${esc(layer.name)}">×</button></div><details class="tw-tree-details" ${annotation && expandedDrawingId===layer.id ? 'open' : ''}><summary>說明與 AI 分析</summary>${styleControls(layer)}${annotation ? measurementDetails({...layer.dataMetadata?.measurement,name:layer.name}) + `<details><summary>資料屬性</summary>${layerDetails(layer)}</details>` : layerDetails(layer)}${workflow}${reportRows(layer.aiReports)}</details>${children.length ? `<div class="tw-layer-tree">${children.map(child=>layerTreeRow(child,layers,depth+1)).join('')}</div>` : ''}</div>`;
  }
  function projectMemberLayers() {
    const layers=listLayers();if(!activeProject)return layers;
    const ids=new Set(layers.filter(layer=>activeProject.layerIds?.includes(layer.id) || layer.sourceProjectKey === activeProject.fingerprint).map(layer=>layer.id));
    let changed=true;while(changed){changed=false;for(const layer of layers)if(layer.bufferSourceId && ids.has(layer.bufferSourceId) && !ids.has(layer.id)){ids.add(layer.id);changed=true;}}
    return layers.filter(layer=>ids.has(layer.id));
  }
  function renderProject() {
    const layers=listLayers();const projectLayers=projectMemberLayers();
    const groupKey=`project:${activeProject?.fingerprint || 'workspace'}`;
    const others=layers.filter(layer=>!projectLayers.includes(layer));
    open('專案',`<div class="tw-actions"><button data-act="export-project">匯出 JSON</button><button data-act="import-project">開啟 JSON</button><button class="tw-analysis-primary" data-act="selected-layers-ai">依勾選圖資進行AI分析</button></div>
      <div class="tw-project-tree" data-layer-group><div class="tw-tree-label">${groupHeading(groupKey,activeProject?.name || '目前工作區')}<button class="tw-eye" data-act="project-toggle" aria-label="切換整個專案顯示">${projectLayers.some(layer=>layer.visible) ? '◉' : '⊘'}</button>${activeProject ? '<button data-act="project-delete" aria-label="刪除匯入專案" title="刪除匯入專案與其圖層，保留原始 JSON 與匯出檔">×</button>' : ''}</div>
      <div class="tw-group-content" ${collapsedGroups.has(groupKey)?'hidden':''}><div class="tw-layer-tree">${projectLayers.filter(layer=>!layer.bufferSourceId || !projectLayers.some(parent=>parent.id === layer.bufferSourceId)).map(layer=>layerTreeRow(layer,projectLayers)).join('') || '<p class="tw-note">尚未載入圖層。</p>'}</div>
      <details class="tw-tree-details"><summary>專案資料與 AI 分析</summary><p class="tw-note">來源：${esc(activeProject?.sourceFile || '目前工作區')}。JSON 保存圖層、樣式與分析關係；服務還原仍需連線。</p>${activeProject ? `<pre>${esc(JSON.stringify({...activeProject.metadata,aiReports:undefined},null,2))}</pre>` : ''}<button data-act="project-ai">AI 分析此專案</button>${reportRows(activeProject?.metadata?.aiReports)}</details></div></div>
      ${others.length ? `<details><summary>其他工作區圖資（${others.length} 層）</summary>${others.filter(layer=>!layer.bufferSourceId || !others.some(parent=>parent.id === layer.bufferSourceId)).map(layer=>layerTreeRow(layer,others)).join('')}</details>` : ''}`);
  }

  function vectorStatus(stats){return `${stats.mode}；目前視野 ${stats.inViewFeatures} 筆，已繪出 ${stats.visibleFeatures} 筆${stats.loading?'（線段建置中，保留前次畫面）':''}。`;}
  function layerDetails(layer) {
    if(layer.dataMetadata?.loading)return `<p class="tw-note">已取得 ${layer.geojson?.features?.length || 0} 筆，已繪出 ${layer.renderedFeatureCount || 0} 筆。分區載入仍在進行；完成後顯示屬性統計。<br>來源：${esc(layer.source || 'OpenStreetMap / Overpass')}<br>來源資料時間：${esc(layer.dataMetadata.sourceTimestamp || '查詢中')}</p>`;
    const summary = describeLayer(layer);
    return `<p>${esc(summary.description)}</p>${layer.dataMetadata?.snapshot ? `<p class="tw-note">內建固定版資料時間：${esc(new Date(layer.dataMetadata.sourceTimestamp).toLocaleString('zh-TW'))}。<br>完整分析資料 ${summary.featureCount} 筆；${layer.getRenderStats ? '<span data-vector-status="'+esc(layer.id)+'">'+esc(vectorStatus(layer.getRenderStats()))+'</span>' : '畫面繪出 '+(layer.renderedFeatureCount ?? summary.featureCount)+' 筆。'}線上更新失敗時，可按「載入內建固定版」還原。</p>` : ''}<p class="tw-note">${summary.featureCount} 筆；${layer.visible ? '顯示中' : '已隱藏'}<br>來源：${esc(summary.source)}${summary.sourceFile ? `<br>來源檔：${esc(summary.sourceFile)}` : ''}<br>欄位：${esc(summary.fields.join('、') || '無向量欄位')}</p>
      <details><summary>屬性統計與資料說明</summary><pre>${esc(JSON.stringify({numeric:summary.numeric,metadata:summary.metadata,limitations:summary.limitations},null,2))}</pre></details>`;
  }

  function layerTools(layer,layers) {
    return `${layer.kind==='3d-tiles' && layer.tileset ? `<p class="tw-note">官方座標保留；配合正射影像。建物底面與全球地形可能有高程差，斜視時會看似偏移；街區載入後以真實底面取樣對齊展示高程，可關閉恢復原始。影像屋頂傾斜及年份差異不做水平平移。</p><p class="tw-note" data-building-status="${layer.id}" role="status">${esc(buildingStatus(layer))}</p><label class="tw-inline-option"><input type="checkbox" data-building-align data-layer="${layer.id}" ${layer.dataMetadata?.buildingAlignment?.enabled!==false?'checked':''}>依模型底面自動對齊地形高程（展示）</label><label>高程微調（公尺）<input type="number" data-building-offset data-layer="${layer.id}" min="-200" max="200" step="1" value="${Number(layer.dataMetadata?.displayHeightOffset)||0}"></label>` : ''}${styleControls(layer)}${layer.geojson ? layerDetails(layer) : ''}<div class="tw-actions compact">${['osm-roads','osm-waterways','osm-water','osm-coastline'].includes(layer.builtinId) ? `<button data-act="builtin-load" data-builtin="${layer.builtinId}">載入內建固定版</button>` : ''}<button data-act="layer-ai" data-layer="${layer.id}">AI 分析</button>
      ${layer.geojson && !isBufferLayer(layer) && layer.kind !== 'dtm' ? `<label class="tw-buffer-entry">外延公尺<input type="number" data-buffer-distance="${layer.id}" min="0.1" max="100000" step="any" value="500"></label><button data-act="buffer" data-layer="${layer.id}">產生影響範圍</button>` : ''}
      <button data-act="layer-remove" data-layer="${layer.id}">移除圖層</button></div>`;
  }

  async function runIntegratedAnalysis(options,label){
    if(chatBusy||transit.busy){chatStatus('工作中... 目前工作完成後即可接續分析。');return;}
    const generation=chatGeneration,session={...options,id:String(++analysisSequence),corridorMeters:options.corridorMeters||30};
    session.suggestions=session.type==='layers'?[
      {label:'比較範圍內設施與站點',prompt:'依已計算範圍內生活設施、公車站點與建物數比較，指出優先查核項目；不得假造人口或服務品質。'},
      {label:'查核自行車道兩側 50 公尺建物',corridorMeters:50,prompt:'已重新計算自行車道兩側各50公尺內建物；說明此距離的查核用途與資料限制，提出可調閱證據。'},
      {label:'查核來源與統計缺口',prompt:'逐項查核來源、涵蓋、更新日期及圖徵單位，列出須調閱原始清冊的三點查核建議。'},
    ]:[
      {label:'比較紀錄時序與執行落差',prompt:'依紀錄時序建立條件、承諾動作、實際成果與落差比較表，引用來源紀錄編號。'},
      {label:'整理原始證據調閱清單',prompt:'以資深審計人員觀點建立應調閱文件、核對目的、負責單位及證據缺口表；責任未記載不得杜撰。'},
      {label:'提出改善追蹤查核程序',prompt:'依合併紀錄提出三點可執行查核程序，用表格列查核步驟、預期證據與確認標準。'},
    ];
    analysisSession=session;analysisSessions.set(session.id,session);if(analysisSessions.size>20)analysisSessions.delete(analysisSessions.keys().next().value);
    chatBusy=true;chatController=new AbortController();const signal=chatController.signal;
    chatMessages.push({role:'user',content:label|| (session.type==='layers'?'依勾選圖資進行AI分析':'依紀錄進行AI整合分析')});
    const progress={role:'assistant',content:'工作中... 正在整理分析來源。'},stages=[];chatMessages.push(progress);showAssistant();
    const update=stage=>{if(generation!==chatGeneration)return;if(stages.at(-1)!==stage)stages.push(stage);progress.content=stages.slice(-5).map(s=>'- '+s).join('\n')+'\n\n工作中...';chatStatus('工作中... '+stage);renderChatMessages();};
    let base='';
    try{
      const configured=await hasApiKey('openrouter');
      const ask=async(prompt,context)=>{
        signal.throwIfAborted();if(!configured)throw Error('尚未設定 OpenRouter；空間計算結果仍可使用。');
        const answer=await streamBrowserChat({model:selectedModel()||'openrouter/free',messages:[{role:'user',content:prompt}],context:{...context,analysisKind:session.type},responseStyle},{signal,onStatus:update});
        return String(answer.content||'').trim();
      };
      let content;
      if(session.type==='layers'){
        const result=await analyzeSelectedLayers(session.layers,{signal,onProgress:update,corridorMeters:session.corridorMeters});session.result=result;base=result.markdown;content=base;
        if(session.prompt&&configured){
          const parts=[];for(const [index,chunk] of textChunks(base).entries()){update(`空間計算已完成；正在分析第 ${index+1}/${textChunks(base).length} 個成果區塊。`);parts.push(await ask(session.prompt+' 只引用本區塊實際計算結果，先摘要，分項用條列、比較用表格，引用圖資來源。回覆不超過400字。',{calculatedResult:chunk}));}
          content=`## 後續查核分析\n\n${parts.join('\n\n')}\n\n${base}`;
        }else if(session.prompt)content=`${base}\n\n- 目前未取得文字模型回覆；本次已重新完成空間計算並回報上述查核依據。`;
      }else{
        const result=await analyzeRecords(session.records,{signal,onProgress:update,ask,prompt:session.prompt});session.result=result;content=result.markdown;
      }
      signal.throwIfAborted();if(generation!==chatGeneration)return;
      progress.content=stages.map(s=>'- '+s).join('\n')+'\n\n本次工作已結束，成果如下。';
      chatMessages.push({role:'assistant',content,analysisSuggestions:{id:session.id,items:session.suggestions}});chatStatus('分析結果已回報，可點選查核建議接續分析。');
    }catch(error){
      if(generation!==chatGeneration)return;progress.content=stages.map(s=>'- '+s).join('\n')+'\n\n本次工作已停止。';
      chatMessages.push({role:'assistant',content:`${base}\n\n## 分析執行結果\n\n${error.name==='AbortError'?'已停止此次分析。':'未完成部分：'+error.message}。已完成階段已保留，可點選建議重新查核。`,analysisSuggestions:{id:session.id,items:session.suggestions}});chatStatus('已回報完成階段及未完成原因。');
    }finally{if(generation===chatGeneration){chatBusy=false;chatController=null;renderChatMessages();}}
  }

  async function explainLayers(layerId) {
    analysisSession=null;
    focusLayer = layerId || null;
    analysisTarget = layerId || 'project';
    const layer = layerId && getLayer(layerId);
    chatPanel.querySelector('#tw-chat-input').value = layer
      ? `請分析「${layer.name}」的用途、屬性統計、空間分析建議與資料限制。`
      : '請分析目前載入專案的各圖層用途、可見狀態、屬性統計、改善潛力與可執行的空間分析。請區分既有計算結果與待驗證推論。';
    if (chatPanel.hidden) toggleChat();
    try { await sendChat(); } finally { focusLayer = null; analysisTarget = null; }
  }

  function renderSettings() {
    const saved = JSON.parse(localStorage.getItem('gev.tw.resourceProfile') || '{"name":"balanced","custom":{}}');
    const current = saved.name;
    const c = saved.custom || {};
    open('設定', `
      <h3>效能與資源</h3>
      <div class="tw-profile-grid">${Object.entries(PROFILES).map(([k,v]) => `<button class="${current===k?'on':''}" data-act="apply-profile" data-profile="${k}"><b>${v.label}</b><small>${v.fps} FPS · ${v.cacheMB} MB tiles</small></button>`).join('')}</div>
      <details class="tw-details" ${current==='custom'?'open':''}>
        <summary>自訂 GPU／記憶體預算</summary>
        <label>目標 FPS <input id="tw-c-fps" type="number" min="20" max="60" value="${c.fps||40}"></label>
        <label>渲染解析度比例 <input id="tw-c-scale" type="number" min="0.5" max="1.5" step="0.05" value="${c.scale||0.9}"></label>
        <label>3D Tiles 快取 MB <input id="tw-c-cache" type="number" min="128" max="2048" step="64" value="${c.cacheMB||384}"></label>
        <label>LOD 誤差（越大越省 GPU）<input id="tw-c-sse" type="number" min="6" max="40" value="${c.sse||20}"></label>
        <button data-act="apply-custom">套用自訂配置</button>
      </details>
      <p class="tw-note">瀏覽器模式透過本機服務讀取實際系統 RAM 與 GPU；不支援的硬體指標會顯示未提供，不會估造數值。RAM≥88%、Swap≥75% 或 VRAM≥88% 時會自動降載，只限制本程式，不修改 Windows Pagefile 或 GPU 時脈。</p>
      <h3>服務與 API</h3>
      <div class="tw-card"><b>設定地圖與資料服務</b><p>瀏覽器版可直接在此輸入服務金鑰，以 Windows 加密保存，重新開啟可沿用。</p><button data-act="open-original-keys">開啟服務與 API 金鑰設定</button></div>`);
  }

  async function refreshFreeModels({ silent = false } = {}) {
    const status = body.querySelector('#tw-openrouter-status');
    if (status) status.textContent = '正在更新…';
    try {
      freeModels = await browserAi('/models');
      freeModels = [{ id:'openrouter/free', name:'自動選擇免費模型' }, ...freeModels.filter(model => model.id !== 'openrouter/free')];
      localStorage.setItem('gev.tw.freeModels', JSON.stringify(freeModels));
      const savedModel = localStorage.getItem('gev.tw.aiModel');
      if ((!savedModel || !freeModels.some(model => model.id === savedModel)) && freeModels[0]?.id) {
        localStorage.setItem('gev.tw.aiModel', freeModels[0].id);
      }
      populateFreeModels();
      syncModelUi();
      if (status) status.textContent = `已更新 ${freeModels.length} 個免費模型`;
      if (!silent) toast(`已更新 ${freeModels.length} 個最新免費模型`);
    } catch (error) {
      if (!freeModels.length) {
        try { freeModels = JSON.parse(localStorage.getItem('gev.tw.freeModels') || '[]'); } catch { freeModels = []; }
      }
      populateFreeModels();
      syncModelUi();
      if (status) status.textContent = freeModels.length ? '離線使用上次清單' : '本機服務連線 OpenRouter 後載入清單';
      if (!silent) throw error;
    }
  }

  function populateFreeModels() {
    const select = body.querySelector('#tw-model');
    if (!select) return;
    freeModels=freeModels.filter(m=>!/safety|guard|moderation|embedding|lyria/i.test(`${m.id} ${m.name}`));
    const selected = localStorage.getItem('gev.tw.aiModel') || freeModels[0]?.id || '';
    select.innerHTML = freeModels.length
      ? freeModels.map(model => `<option value="${esc(model.id)}">${esc(model.name || model.id)}</option>`).join('')
      : '<option value="">請先更新免費模型清單</option>';
    if (freeModels.some(model => model.id === selected)) select.value = selected;
    else if (freeModels[0]) select.value = freeModels[0].id;
  }

  function selectedModel() {
    const saved = localStorage.getItem('gev.tw.aiModel');
    return freeModels.find(model => model.id === saved)?.id || freeModels[0]?.id || 'openrouter/free';
  }

  function syncModelUi() {
    const select = root.querySelector('#tw-active-model');
    if (!select) return;
    select.innerHTML = freeModels.length
      ? freeModels.map(model => `<option value="${esc(model.id)}">${esc(model.name || model.id)}</option>`).join('')
      : '<option value="">請更新模型清單</option>';
    select.value = selectedModel();
    select.title = select.selectedOptions[0]?.textContent || '請更新模型清單';
  }

  function syncChatUnread() {
    root.querySelectorAll('[data-chat-unread]').forEach(badge => {
      badge.hidden = chatUnread === 0;
      badge.textContent = chatUnread > 9 ? '9+' : String(chatUnread);
    });
  }

  function voiceHelp(){return `<details class="tw-card tw-voice-help"><summary>語音回覆風格與設定</summary><details open><summary>功能與回答範圍</summary><ul><li>協助載入、顯示、隱藏、切換圖資；明確說出圖資與區域就直接執行，未指定才詢問。</li><li>飛往地點、顯示五秒矩形地點標籤、環繞建物；規劃汽車／機車路線與中途點，建立圖層影響範圍。</li><li>介紹本程式功能，回答台灣地理與歷史問題；新聞與輿情透過公開新聞搜尋查詢，區分報導與推論，不代表全體民意。</li><li>可讀取目前圖資及鏡頭狀態。勾選分享地圖後，可要求觀看當下地圖；不包含其他應用程式、金鑰或對話畫面。</li><li>CCTV 影像辨識、標註及量測請使用工具列。圖資依來源涵蓋範圍載入；建物只串流官方服務圖磚，不代表每一棟建物。</li></ul></details><details><summary>提問範例</summary><ul><li>這個程式可以做哪些事？道路中心線可以如何分析？</li><li>介紹宜蘭平原的地形與發展歷史。</li><li>查詢宜蘭最近的交通新聞，列出來源與日期，再分析報導重點。</li><li>看目前地圖，說明我載入的圖資與可以進行的分析。</li></ul></details><details><summary>畫面操作範例</summary><ul><li>載入宜蘭縣的 3D 建物圖資。</li><li>載入全台灣道路中心線；隱藏飛機即時動態。</li><li>帶我到宜蘭縣審計室並顯示地點標籤。</li><li>從宜蘭縣審計室，經宜蘭國小，規劃到羅東國小的汽車路線。</li></ul></details><section class="tw-chat-style tw-voice-style"><label>回覆角色<select id="tw-voice-role">${VOICE_ROLES.map(role=>`<option value="${role.id}" ${voiceSettings.role===role.id?'selected':''}>${esc(role.name)}</option>`).join('')}</select></label><small>兒童角色使用較輕快的聲線與語氣模擬；非特定真人或原生專用兒童聲音。</small><label>自訂 AI 語音回答風格<textarea id="tw-voice-style" rows="3" maxlength="1400" placeholder="例如：用繁體中文、先說結論，補充三項具體建議。">${esc(voiceSettings.style)}</textarea></label><div class="tw-actions"><button data-act="voice-style-save">儲存風格</button><button data-act="voice-style-reset">重訂風格</button></div><small>保存於瀏覽器及本機使用者設定；儲存後立即套用，重啟後沿用此風格，資料正確性規則仍適用。</small></section><label class="tw-inline-option"><input id="tw-voice-clear-place" type="checkbox" ${voiceSettings.clearPlaceOnNext?'checked':''}>下一個語音指令開始時清除暫時地點標籤</label><label class="tw-inline-option"><input id="tw-voice-share-map" type="checkbox" ${voiceSettings.shareMap?'checked':''}>允許語音助理在要求時取得目前地圖畫面</label><p class="tw-note">勾選設定會隨「儲存風格」一併保存；語音連線自動重新啟動以套用新設定。地點名稱以深色矩形白字標示，緩慢閃爍，五秒後消失；同一地點不重複新增。</p></details>`;}
  let aiHelpView='home';
  function renderAI(view=aiHelpView) {
    aiHelpView=view;
    const back='<button class="tw-ai-back" data-act="ai-help-home">返回</button>';
    if(view==='home'){open('AI 功能說明',`<div class="tw-ai-help-menu"><button class="tw-ai-voice-entry" data-act="ai-help-voice"><b>AI語音助理說明</b><small>語音操作、回覆角色與風格、Gemini Live 連線及額度</small></button><button class="tw-ai-space-entry" data-act="ai-help-space"><b>AI空間助理說明</b><small>空間分析、交通規劃、官方資料擷取、對話風格與 OpenRouter 額度</small></button></div>`);return;}
    if(view==='voice'){
      open('AI語音助理說明',`<section class="tw-ai-voice-help">${back}${voiceHelp()}<article class="tw-card"><b>Gemini Live（僅供語音助理）</b><label>語音模型<select id="tw-voice-model"><option value="gemini-3.8-live" ${voiceSettings.model==='gemini-3.8-live'?'selected':''}>gemini-3.8-live（預設）</option><option value="gemini-3.1-flash-live-preview" ${voiceSettings.model==='gemini-3.1-flash-live-preview'?'selected':''}>gemini-3.1-flash-live-preview</option></select></label><div class="tw-actions"><button data-act="voice-model-save">儲存語音模型</button></div><div id="tw-gemini-quota" class="tw-quota-card" aria-live="polite">讀取額度中…</div><a href="https://aistudio.google.com/usage" target="_blank" rel="noopener noreferrer">查看 Google AI Studio 專案額度</a><div id="tw-voice-sources" class="tw-voice-sources"></div><p id="tw-live-status-banner" class="tw-note">${esc(lastGeminiStatus)}</p><p id="tw-gemini-connection" class="tw-note">尚未檢查</p><p class="tw-note">實際免費用量依 Google AI Studio 顯示。</p><p class="tw-note">可說：「載入飛機即時動態」、「隱藏道路中心線」、「切換到 NLSC 臺灣通用正射影像」、「一鍵載入所有內建圖資」、「一鍵隱藏所有圖資」。</p></article><div class="tw-actions"><button data-act="open-original-keys">服務與 API 金鑰設定</button></div></section>`);
      body.querySelector('.tw-voice-help').open=true;
      void refreshGeminiQuota();void refreshAiStatus();return;
    }
    open('AI空間助理說明',`<section class="tw-ai-space-help">${back}<article class="tw-card"><details><summary>功能與設計說明</summary><p>以目前專案、可見圖資與結構化計算結果回答；區分既有資料、計算結果與推論。</p><p>大眾運輸直接查詢 TDX；查無可靠方案、權限不足或用量限制時，改查已登錄的官方公開班表及票價來源，保留日期、停留、車種與乘客限制。班表與示意路線不代表即時車輛位置或餘票。</p><p>執行期間顯示「工作中...」及各階段查核結果；確認建議後自動回報結論、顯示完整路徑並開始 3D 示意。外部資料無法驗證時明示原因，不由文字模型猜班次或金額。</p></details><div class="tw-actions"><button data-act="ai-help-chat">開啟 AI 空間助理</button><button data-act="ai-help-style">自訂對話風格</button></div></article><article class="tw-card"><b>OpenRouter 連線與額度</b><p id="tw-openrouter-connection" class="tw-note">尚未檢查</p><div id="tw-openrouter-usage" class="tw-quota-card" aria-live="polite">讀取額度中…</div><p class="tw-note">本程式不限制對話次數；免費模型逐一嘗試，無可用模型時保留條件並回報服務原因。供應商的免費額度與速率限制仍適用。</p><p id="tw-chat-count" class="tw-note"></p></article><div class="tw-actions"><button data-act="open-original-keys">服務與 API 金鑰設定</button></div></section>`);
    localStorage.setItem('gev.tw.chatLimit','unlimited');updateChatCount();void refreshAiStatus();
  }

  let chatSentCount = 0;
  function updateChatCount() {
    const el = body.querySelector('#tw-chat-count');
    if (el) el.textContent = `本次已傳送 ${chatSentCount} 次；本程式無次數上限。`;
  }

  function quotaCard(target,{remaining,limit,description,reset,used,unit='美元'}) {
    if(!target?.isConnected)return;
    const known=typeof remaining==='number' && Number.isFinite(remaining) && typeof limit==='number' && Number.isFinite(limit) && limit>=0;
    const percent=known?Math.max(0,Math.min(100,limit===0?0:remaining/limit*100)):null;
    target.innerHTML=`<b>使用量與剩餘額度</b><div class="tw-quota-row"><div class="tw-quota-track ${known?'':'unknown'}" role="${known?'meter':'img'}" aria-label="剩餘額度" ${known?`aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"`:'aria-valuetext="服務未提供可計算的剩餘比例"'}><span style="width:${percent??0}%"></span></div><strong>${known?`剩餘 ${Math.round(percent)}%`:'未提供比例'}</strong></div><small>${esc(description)}</small>${typeof used==='number'?`<small>已用 ${unit==='次'?used:used.toFixed(4)} ${esc(unit)}${known?`；剩餘 ${remaining}／上限 ${limit} ${esc(unit)}`:''}</small>`:''}<small>${esc(reset||'服務未提供確切重置時間')}</small><small>自動更新：${new Date().toLocaleTimeString('zh-TW')}</small>`;
  }
  async function refreshGeminiQuota(){
    const target=body.querySelector('#tw-gemini-quota');if(!target)return;
    try{const value=await browserAi('/gemini-status');quotaCard(target,{remaining:value.quota?.remaining,limit:value.quota?.limit,description:value.quota?.explanation||'額度按專案共用；請查看 Google AI Studio。',reset:value.quota?.resetsAt?`重置：${new Date(value.quota.resetsAt).toLocaleString('zh-TW')}`:null});}
    catch(error){quotaCard(target,{description:`無法取得額度：${error.message}`});}
  }
  async function refreshAiStatus() {
    const geminiEl=body.querySelector('#tw-gemini-connection'),routerEl=body.querySelector('#tw-openrouter-connection'),usageEl=body.querySelector('#tw-openrouter-usage');
    try{
      const result=await browserAi('/status');
      if(geminiEl?.isConnected)geminiEl.textContent=result.gemini?'已儲存金鑰；語音連線尚需實際啟用確認':result.errors?.gemini||'尚未設定金鑰';
      if(routerEl?.isConnected)routerEl.textContent=result.openrouter?'✓ 金鑰有效，服務可連線':result.errors?.openrouter||'尚未設定金鑰';
      if(usageEl){const value=result.openrouter||{},daily=value.free_model_daily_requests,reset={daily:'每日',weekly:'每週',monthly:'每月'}[value.limit_reset];quotaCard(usageEl,daily && Number.isFinite(daily.remaining) && Number.isFinite(daily.limit)?{remaining:daily.remaining,limit:daily.limit,used:daily.used,unit:'次',description:'OpenRouter 官方回傳的免費模型每日請求額度；其他速率限制另依供應商規定。',reset:daily.resets_at?`重置：${new Date(daily.resets_at).toLocaleString('zh-TW')}`:'每日額度；API 未提供下次確切重置時間'}:{remaining:value.limit_remaining,limit:value.limit,used:value.usage,description:result.openrouter?(value.limit==null?'此金鑰未設定金額上限；API 尚未提供免費模型剩餘次數。':'依 OpenRouter 回傳的金鑰金額上限與剩餘金額計算。'):result.errors?.openrouter||'尚未設定金鑰',reset:reset?`金額上限${reset}重置；API 未提供下次確切時間`:null});}
    }catch(error){if(geminiEl?.isConnected)geminiEl.textContent=`檢查失敗：${error.message}`;if(routerEl?.isConnected)routerEl.textContent=`檢查失敗：${error.message}`;quotaCard(usageEl,{description:`無法取得額度：${error.message}`});}
  }
  const quotaRefreshTimer=setInterval(()=>{if(!drawer.hidden && drawerWindow.mode!=='minimized' && !document.hidden){if(body.querySelector('#tw-gemini-quota'))void refreshGeminiQuota();if(body.querySelector('#tw-openrouter-usage'))void refreshAiStatus();}},60000);

  function showAssistant(){assistantWindow.restore().bringToFront();chatUnread=0;syncChatUnread();root.querySelector('.tw-chat-open').setAttribute('aria-expanded','true');renderChatMessages();}
  function toggleChat() {
    if(assistantWindow.mode==='hidden')showAssistant();else assistantWindow.hide();
    root.querySelector('.tw-chat-open').setAttribute('aria-expanded',String(!chatPanel.hidden));
  }

  function renderChatMessages() {
    const thread = chatPanel.querySelector('#tw-chat-thread');
    if (!thread) return;
    thread.innerHTML = chatMessages.length
      ? chatMessages.map(message => `<div class="tw-chat-bubble ${message.role === 'user' ? 'user' : message.role === 'system' ? 'system' : 'assistant'}"><small>${message.role === 'user' ? '你' : message.role === 'system' ? '系統' : 'AI'}</small>${message.cctvResult ? cctvFrameHtml(message.cctvResult) : message.cctvFrame ? `<figure class="tw-cctv-analysis-frame"><img src="${esc(message.cctvFrame.image)}" alt="AI 分析的 CCTV 截圖"><figcaption>${esc(message.cctvFrame.cameraName)} · ${esc(new Date(message.cctvFrame.observedAt).toLocaleString('zh-TW'))}</figcaption></figure>` : ''}<div class="tw-chat-content">${message.role === 'assistant' ? renderChatMarkdown(message.content) : esc(message.content)}</div>${message.transitRecovery?`<div class="tw-transit-recovery-actions">${message.transitRecovery.suggestions.map((s,i)=>`<button data-act="transit-recovery" data-recovery-id="${esc(message.transitRecovery.id)}" data-recovery-index="${i}" ${transit.recovery?.id!==message.transitRecovery.id||transit.busy||chatBusy?'disabled':''}>${i+1}｜${esc(s.label)}</button>`).join('')}</div>`:''}${message.analysisSuggestions?`<div class="tw-transit-recovery-actions">${message.analysisSuggestions.items.map((item,i)=>`<button data-act="analysis-followup" data-analysis-id="${esc(message.analysisSuggestions.id)}" data-analysis-index="${i}" ${chatBusy?'disabled':''}>${i+1}｜${esc(item.label)}</button>`).join('')}</div>`:''}${(message.serviceLimits?.length?message.serviceLimits:message.transitRecovery?.rateLimit?[message.transitRecovery.rateLimit]:[]).map(limit=>`<p class="tw-transit-countdown" data-transit-limit="${esc(JSON.stringify(limit))}">${esc(rateLimitText(limit))}</p>`).join('')}</div>`).join('')
      : '<div class="tw-chat-empty">你可以直接詢問地圖、圖資或分析做法。</div>';
    if (chatBusy && !aiStreaming) thread.insertAdjacentHTML('beforeend', '<div class="tw-chat-bubble assistant pending">AI 正在輸入…</div>');
    thread.scrollTop = thread.scrollHeight;
  }

  const transitCountdownTimer=setInterval(()=>{for(const node of chatPanel.querySelectorAll('[data-transit-limit]'))try{node.textContent=rateLimitText(JSON.parse(node.dataset.transitLimit));}catch{/* Invalid displayed metadata is ignored. */}},1000);

  function chatStatus(message) {
    const status = chatPanel.querySelector('#tw-chat-status');
    if (status) status.textContent = message;
  }

  async function sendChat() {
    if (chatBusy) return;
    const input = chatPanel.querySelector('#tw-chat-input');
    const content = input?.value.trim();
    if (!content) return;
    const generation=chatGeneration;
    if(analysisSession&&!/(?:TDX|重新規劃|班次|規劃.*(?:旅程|交通)|(?:旅程|大眾運輸).*規劃|^(?:請)?(?:帶我到|飛到|前往|搜尋並前往|搜尋地標))/i.test(content)){
      input.value='';await runIntegratedAnalysis({...analysisSession,prompt:content},content);return;
    }
    const visit=content.match(/^(?:請)?(?:帶我到|飛到|前往|搜尋並前往|搜尋地標)\s*(.+?)(?:[。！!]|$)/);
    if(visit && !focusLayer) {
      input.value='';chatBusy=true;chatMessages.push({role:'user',content});renderChatMessages();
      try {const orbit=/環繞|繞.*一圈/.test(content);const place=visit[1].replace(/(?:並|然後|再)?(?:環繞|繞).*/, '').trim();const result=await (orbit ? geminiLive.flyToAndOrbitPlace(place) : geminiLive.flyToPlace(place));if(generation!==chatGeneration)return;if(!result.ok){chatMessages.push({role:'assistant',content:result.question || result.message});chatStatus('請確認地點');return;}chatMessages.push({role:'assistant',content:`已${orbit ? '飛往並完成環繞' : '飛往'}「${result.place}」。WGS84：${result.coordinates.join(', ')}。`});chatStatus('地圖操作已完成');}
      catch(error){if(generation!==chatGeneration)return;chatMessages.push({role:'system',content:error.message});chatStatus('地標搜尋失敗');}
      finally{if(generation===chatGeneration){chatBusy=false;renderChatMessages();}}return;
    }
    const transitIntent=transitMessageIntent(content,{hasRequest:transit.active,active:!!transit.recovery||!!transit.results});
    if(transit.recovery||transitIntent){input.value='';await runTransitInteraction(()=>transit.handleMessage(content),content);return;}
    if (!await hasApiKey('openrouter')) { chatStatus('請先在「服務與 API」設定 OpenRouter 金鑰。'); return; }
    if(generation!==chatGeneration)return;
    const latestCctv=chatMessages.filter(message=>message.cctvResult).at(-1)?.cctvResult;
    if(latestCctv && /事故|積水|淹水|施工|阻斷|異常停車|重新(?:辨識|判讀)|再(?:辨識|判讀)/.test(content)){
      input.value='';chatBusy=true;chatMessages.push({role:'user',content});renderChatMessages();
      chatController=new AbortController();chatStatus('此操作將使用外部 AI 服務分析最近一次固定 CCTV 截圖。');
      try{const result=await analyzeCctvFrame({model:'auto-free',image:latestCctv.screenshot,cameraName:latestCctv.cameraName,observedAt:latestCctv.capturedAt,prompt:`使用者針對請求 ${latestCctv.requestId} 的問題：${content}。本機統計：${JSON.stringify(latestCctv.counts)}。只依這張固定畫面判讀，不能確定請寫無法判定。`},{signal:chatController.signal});if(generation!==chatGeneration)return;chatMessages.push({role:'assistant',content:`## CCTV 後續影像判讀\n攝影機：${latestCctv.cameraName}\n固定截圖：${latestCctv.capturedAt}\n原辨識請求：${latestCctv.requestId}\n方式：免費 AI（外部服務）\n\n${result.content}`});chatStatus('已完成固定截圖的後續判讀');}
      catch(error){if(generation===chatGeneration)chatMessages.push({role:'system',content:`免費影像分析目前不可用：${error.message}`});}
      finally{if(generation===chatGeneration){chatBusy=false;chatController=null;renderChatMessages();}}return;
    }
    const reportTarget = analysisTarget;
    const model = selectedModel();
    if (!model) { chatStatus('請先點右上方 ↻ 更新並選擇可用模型。'); return; }
    chatMessages.push({ role:'user', content });
    input.value = '';
    chatBusy = true;
    renderChatMessages();
    chatStatus(`正在由 ${model} 回覆…`);
    const epoch = workEpoch;
    aiPending = true;
    chatController = new AbortController();
    let draft = null;
    try {
      const messages = chatMessages.slice(chatContextStartIndex).filter(message => message.role !== 'system').slice(-8);
      chatSentCount++; updateChatCount();
      await responseStyleReady;
      if (epoch !== workEpoch || generation !== chatGeneration || chatController?.signal.aborted) return;
      const context = {...buildSpatialContext(listLayers(),{project:activeProject,drawing:lastDrawingResult,focusLayer}),cctvResults:cctvContext(chatMessages),tripContext:transit.state,tripPlans:transit.results};
      const answer = await streamBrowserChat({model,messages,context,responseStyle},{signal:chatController.signal,
          onStatus:message => { if (epoch === workEpoch && generation===chatGeneration) chatStatus(message); },
          onDelta:text => { if (epoch !== workEpoch || generation!==chatGeneration) return; if (!draft) { draft = {role:'assistant',content:''}; chatMessages.push(draft); } draft.content = text; aiStreaming = true; renderChatMessages(); }
        });
      if (epoch !== workEpoch || generation!==chatGeneration) return;
      if (draft) draft.content = String(answer.content).trim();
      else chatMessages.push({ role:'assistant', content:String(answer.content).trim() || '模型沒有回傳文字。' });
      if (reportTarget) {
        const report = {createdAt:new Date().toISOString(),model:answer.model || model,content:String(answer.content).slice(0,10000)};
        const targetLayer = getLayer(reportTarget);
        if (targetLayer) targetLayer.aiReports = [...(targetLayer.aiReports || []),report].slice(-3);
        else if (reportTarget === 'project' && activeProject) activeProject.metadata = {...activeProject.metadata,aiReports:[...(activeProject.metadata.aiReports || []),report].slice(-3)};
        if (!drawer.hidden && title.textContent === '圖資') renderLayers();
        if (!drawer.hidden && title.textContent === '專案') renderProject();
        if (!drawer.hidden && title.textContent === '標註與量測') renderDrawing();
      }
      if (chatPanel.hidden) { chatUnread++; syncChatUnread(); }
      chatStatus(answer.model && answer.model !== model ? `已由備援模型 ${answer.model} 回覆` : '已收到回覆');
    } catch (error) {
      if (epoch !== workEpoch || generation!==chatGeneration) return;
      if(draft)chatMessages.splice(chatMessages.indexOf(draft),1);
      chatMessages.push({ role:'system', content:`對話失敗：${error?.message || String(error)}` });
      chatStatus('對話失敗，請檢查金鑰、模型與網路。');
    } finally {
      if(generation===chatGeneration){
      aiPending = false;
      chatBusy = false;
      aiStreaming = false;
      chatController = null;
      if (chatMessages.length > 40) { const removed = chatMessages.length-40; chatMessages.splice(0,removed); chatContextStartIndex = Math.max(0,chatContextStartIndex-removed); }
      renderChatMessages();
      }
    }
  }

  async function doBuffer(id) {
    const l = getLayer(id);
    const distance = Number(body.querySelector(`[data-buffer-distance="${CSS.escape(id)}"]`)?.value);
    await runBuffer(l, viewer, distance);
    toast(`已產生 ${distance}m 影響範圍圖層`);
    renderLayers();
  }

  async function doExport() {
    const blob=await exportProject({name:activeProject?.name || '未命名專案',metadata:activeProject?.metadata || {},viewer,layers:listLayers()});
    download(blob,`上帝之眼-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
    toast('已匯出 JSON 專案');
  }
  async function renderResults(){return chatArchive.render();}

  async function doSuggestAI() {
    const out = body.querySelector('#tw-ai-output');
    if (!out) return;
    if (!await hasApiKey('openrouter')) {
      out.innerHTML = '尚未設定 OpenRouter API Key。<button data-act="open-original-keys">開啟服務與 API 金鑰設定</button>';
      toast('請先設定 OpenRouter API Key');
      return;
    }
    out.textContent = 'AI 正在檢視目前圖資…';
    const savedModel = localStorage.getItem('gev.tw.aiModel');
    const model = freeModels.some(candidate => candidate.id === savedModel) ? savedModel : freeModels[0]?.id || '';
    if (!model) throw new Error('請先在「設定」更新 OpenRouter 免費模型清單。');
    const epoch = workEpoch;
    aiPending = true;
    let data;
    try { data = await suggestTopics(model); }
    finally { aiPending = false; }
    if (epoch !== workEpoch || !out.isConnected) return;
    out.innerHTML = (data.topics || []).map((t,i) => `<article class="tw-card"><b>${i+1}. ${esc(t.title)}</b><p>${esc(t.purpose||'')}</p><small>資料準備度：${esc(t.readiness||'--')}</small><button class="tw-plan" data-topic="${encodeURIComponent(JSON.stringify(t))}">建立分析計畫</button><div class="tw-plan-output"></div></article>`).join('');
    out.querySelectorAll('.tw-plan').forEach(b => b.addEventListener('click', async () => {
      const target = b.nextElementSibling;
      target.textContent = '規劃中…';
      const planEpoch = workEpoch;
      aiPending = true;
      try {
        const result = await planAnalysis(JSON.parse(decodeURIComponent(b.dataset.topic)), model);
        if (planEpoch === workEpoch && target.isConnected) target.textContent = JSON.stringify(result, null, 2);
      } finally { aiPending = false; }
    }));
  }

  async function validateProvider(name) {
    const el = body.querySelector(name === 'cesium' ? '#tw-cesium-status' : '#tw-tomtom-status');
    if (el) el.textContent = '驗證中…';
    let message = '服務驗證失敗，請確認金鑰權限與網路後再試';
    try {
      if (name === 'cesium') {
        const config = await readRuntimeConfig();
        if (!config.cesiumIonToken) {message='尚未設定 Cesium Token';throw new Error(message);}
        await Cesium.IonResource.fromAssetId(2275207, {accessToken:config.cesiumIonToken});
      } else if (name === 'tomtom') {
        if (!await hasApiKey('TOMTOM_API_KEY')) {message='尚未設定 TomTom Key';throw new Error(message);}
        const result = await browserAi('/search', {method:'POST',data:{query:'宜蘭縣審計室'}});
        if (!result.results?.some(hit=>hit.source==='TomTom Search')) {message='TomTom 搜尋未回傳可用結果，請確認金鑰與服務權限';throw new Error(message);}
      } else {message='不支援的服務驗證';throw new Error(message);}
      if (el) el.textContent = '✓ 已連線';
      return {ok:true,provider:name};
    } catch (error) {
      // SDK errors can contain authenticated URLs; display only safe status information.
      const code = Number(error?.statusCode);
      if (Number.isInteger(code) && code >= 400 && code <= 599) message += `（HTTP ${code}）`;
      if (el) el.textContent = '✕ ' + message;
      throw new Error(message);
    }
  }

  async function ensureBuildingSurface(){const job=linkedLoad('正在配合建物地形與底圖…');try{await prepareBuildingSurface(viewer,{signal:job.controller.signal});job.controller.signal.throwIfAborted();}finally{job.finish();}}

  async function doRoutePlan() {
    const epoch=workEpoch;
    if(!await hasApiKey('TOMTOM_API_KEY'))throw new Error('未輸入金鑰');
    if(epoch!==workEpoch)return;
    captureRouteInputs();
    const waypoints=routeInputs.waypoints.map(name=>{const point=routeCandidates.get(name);return point?{lat:point.lat,lon:point.lon,label:name}:name;});
    const result = await navigation.planRoute({...routeInputs,waypoints});
    const el = root.querySelector('#tw-navigation-status');
    if (el) el.textContent = `已規劃：${result.origin} → ${result.destination}｜${(result.lengthMeters/1000).toFixed(1)} km｜約 ${Math.round(result.travelTimeSeconds/60)} 分鐘`;
  }

  async function doOsmCheck() {
    const status = body.querySelector('#tw-live-health');
    if (status) status.innerHTML = '<p class="tw-note">正在向 Overpass 強制取得最新資料時間…</p>';
    const c = viewer.camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(c.latitude);
    const lon = Cesium.Math.toDegrees(c.longitude);
    const result = await checkOsmFreshness({ lat, lon });
    if (status) status.innerHTML = `<div class="tw-card"><b>OSM 資料時間：${esc(result.dataTime || '無法取得')}</b><p>與目前時間約差 ${result.lagMinutes ?? '--'} 分鐘。來源：${esc(result.upstream || 'Overpass')}</p><small>檢查時間 ${new Date(result.checkedAt).toLocaleString()}</small></div>`;
  }

  async function doCctvCheck() {
    const status = body.querySelector('#tw-live-health');
    if (status) status.innerHTML = '<p class="tw-note">正在直接抽查 CCTV frame；不使用瀏覽器快取…</p>';
    const result = await checkCctvFreshness({ sampleSize:3 });
    if (status) status.innerHTML = `<div class="tw-card"><b>${esc(result.message)}</b><p>總目錄 ${result.total} 支。只有 <code>upstream-image</code> 才標示為直接取得上游當下 snapshot；Street View／synthetic 只算備援，不會誤標成即時 CCTV。</p>${result.samples.map(s => `<div class="tw-metrics">${s.isCurrentUpstream?'✓':'△'} ${esc(s.name)} · ${esc(s.provider)} · ${esc(s.source)} · ${s.latencyMs}ms</div>`).join('')}<small>檢查時間 ${new Date(result.checkedAt).toLocaleString()}</small></div>`;
  }

  async function renderTaiwanCctv() {
    open('台灣國道 CCTV', '<p class="tw-note">正在讀取交通部高速公路局公開影像目錄…</p>');
    const response = await fetch('/api/cctv/sources', { cache:'no-store' });
    if (!response.ok) throw new Error(`CCTV 目錄 HTTP ${response.status}`);
    const catalog = await response.json();
    const sources = (catalog.sources || []).filter(camera => camera.provider === '交通部高速公路局' && camera.feedType === 'mjpeg');
    if (!sources.length) {
      body.innerHTML = '<p class="tw-note">目前無法取得台灣國道動態來源；請檢查本機 provider 服務與官方目錄連線。</p>';
      return;
    }
    body.innerHTML = `<p class="tw-note">${sources.length} 支台灣國道 MJPEG 來源。選擇後直接播放官方動態串流；攝影機若離線會顯示連線錯誤。</p>
      <label>搜尋道路、里程或設備編號<input id="tw-cctv-filter" type="search" placeholder="例如：國道5號、雪山隧道"></label>
      <label>攝影機<select id="tw-cctv-select"></select></label>
      <div class="tw-actions"><button data-act="taiwan-cctv-play">播放選取影像</button><a href="https://data.gov.tw/dataset/37665" target="_blank" rel="noopener noreferrer">官方來源與授權</a></div>
      <div id="tw-cctv-play-status" class="tw-note" role="status">尚未播放</div>
      <img id="tw-cctv-live-image" class="tw-cctv-live-image" alt="台灣國道即時影像" />
      <p class="tw-note">MJPEG 影像會持續傳送畫格；這與單張快照不同。若來源只提供靜態圖或連線失敗，介面不會標示為直播。</p>`;
    const image = body.querySelector('#tw-cctv-live-image');
    const status = body.querySelector('#tw-cctv-play-status');
    const select = body.querySelector('#tw-cctv-select');
    const populate = (term = '') => {
      const matches = sources.filter(camera => camera.name.toLowerCase().includes(term.trim().toLowerCase())).slice(0, 100);
      select.innerHTML = matches.length
        ? matches.map(camera => `<option value="${esc(camera.id)}">${esc(camera.name)}</option>`).join('')
        : '<option value="">找不到符合的攝影機</option>';
    };
    populate();
    body.querySelector('#tw-cctv-filter').addEventListener('input', event => populate(event.target.value));
    image.addEventListener('load', () => { status.textContent = `動態影像已連線 · ${new Date().toLocaleTimeString()}`; image.scrollIntoView({ block:'nearest' }); });
    image.addEventListener('error', () => { status.textContent = '影像連線失敗，請換一支攝影機或稍後再試'; });
  }

  function playTaiwanCctv() {
    const id = body.querySelector('#tw-cctv-select')?.value;
    const image = body.querySelector('#tw-cctv-live-image');
    const status = body.querySelector('#tw-cctv-play-status');
    if (!id || !image || !status) return;
    image.removeAttribute('src');
    status.textContent = '正在連接官方 MJPEG 動態影像…';
    image.src = `/api/cctv/media/${encodeURIComponent(id)}?ts=${Date.now()}`;
  }

  function openLegacyCctv() {
    setLegacyMode(true);
    const panel = document.getElementById('cctv-panel');
    panel?.classList.remove('collapsed');
    panel?.classList.add('active');
    toast('已開啟 CCTV 即時影像面板');
  }

  function updateResources(s) {
    set('ram',pct(s.systemMemoryUsed,s.systemMemoryTotal));
    set('swap',pct(s.swapUsed,s.swapTotal));
    set('gpu',Number.isFinite(s.gpuUtilization) ? `${s.gpuUtilization}%` : '未提供');
    root.querySelector('[data-r=gpu]')?.setAttribute('title', `${s.gpuName || 'GPU 裝置未偵測'}；使用率${Number.isFinite(s.gpuUtilization) ? '由本機硬體計數器讀取' : '未提供'}`);
    root.querySelector('[data-r=vram]')?.previousElementSibling?.replaceChildren(document.createTextNode(s.gpuMemoryKind === 'shared' ? 'GPU 記憶體' : 'VRAM'));
    set('vram',s.gpuTotal ? pct(s.gpuUsed,s.gpuTotal) : bytes(s.gpuUsed));
    const p = root.querySelector('[data-r=pressure]');
    p.textContent = s.pressured ? '資源保護中' : '';
    p.classList.toggle('on',!!s.pressured);
  }

  function set(k,v) {
    const el = root.querySelector(`[data-r=${k}]`);
    if (el) el.textContent = v;
  }

  return () => {
    disposeBuildingDisplay();window.removeEventListener('gev-tw:building-status',updateBuildingStatus);
    cinematic.destroy();
    flightObservation.destroy();
    cameraPath.destroy();cctvWall.destroy();floatingPanels.destroy();
    removeBuildingMoveListener();
    voiceSubtitles.destroy();chatArchive.destroy();labels.destroy();
    drawing.destroy();
    geminiLive.stop().catch(()=>{});
    clearInterval(transitCountdownTimer);transit.destroy();journey.destroy();drivingPanel?.destroy();
    navigation.destroy();
    chatController?.abort();
    window.removeEventListener('resize', refreshGlobeViewport);
    governor.stop();
    window.removeEventListener('gev-tw:keys-changed',onKeysChanged);
    clearInterval(quotaRefreshTimer);
    window.removeEventListener('gev-tw:aerial-capture-ui',onCaptureUi);
    document.body.classList.remove('gev-tw-aerial-capture');
    providerSettings.dispose();
    root.remove();
  };
}

function quickGearIcon() { return '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" class="tw-gear-ring"/><path d="M21 7h6l1 4.2 3.4 1.4 3.7-2.3 4.2 4.2-2.3 3.7 1.4 3.4 4.2 1v6l-4.2 1-1.4 3.4 2.3 3.7-4.2 4.2-3.7-2.3-3.4 1.4-1 4.2h-6l-1-4.2-3.4-1.4-3.7 2.3-4.2-4.2 2.3-3.7-1.4-3.4-4.2-1v-6l4.2-1 1.4-3.4-2.3-3.7 4.2-4.2 3.7 2.3 3.4-1.4z" class="tw-gear-teeth"/><circle cx="24" cy="24" r="6" class="tw-gear-center"/></svg>'; }
function nav(a,icon,label) { return `<button data-act="${a}" data-sprite="${icon}" title="${label}" aria-label="${label}"><em>${label}</em></button>`; }
function flyTaiwan(v) { v.camera.flyTo({ destination:Cesium.Rectangle.fromDegrees(119.2,21.6,122.4,25.7), duration:1.4 }); }
function flyGlobal(v) { v.camera.flyHome(1.25); }
function pct(a,b) { return b ? `${Math.round(a/b*100)}%` : '--'; }
function bytes(v) { if(!Number.isFinite(Number(v))||Number(v)<=0)return '--'; const n=Number(v); return n>=1073741824?`${(n/1073741824).toFixed(1)} GB`:`${Math.round(n/1048576)} MB`; }
function metric(k,a,b) { return `<div><span>${k}</span><b>${a}</b><small>${b||''}</small></div>`; }
function num(sel,fallback) { const n=Number(document.querySelector(sel)?.value); return Number.isFinite(n)?n:fallback; }
function esc(v) { return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtSummary(l) { try { const s=l.geojson?summarize(l.geojson):null; return s?`${s.count} 筆 · 面積 ${(s.areaM2/1e6).toFixed(2)} km² · 線長 ${s.lengthKm.toFixed(2)} km`:'非 GeoJSON'; } catch { return '統計待計算'; } }
function download(blob,name) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
