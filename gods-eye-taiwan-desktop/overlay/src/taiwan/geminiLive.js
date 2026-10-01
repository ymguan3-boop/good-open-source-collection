import { GoogleGenAI, Modality } from '@google/genai';
import { invoke } from '@tauri-apps/api/core';
import * as Cesium from 'cesium';
import { listLayers, getLayer } from './layerRegistry.js';
import { runBuffer } from './analysis.js';
import { browserAi } from './browserAi.js';
import { resolvePlace as searchPlace } from './places.js';

const MODEL = 'gemini-3.8-live';

export function createGeminiLiveController({ viewer, navigation, onStatus = () => {}, onTranscript = () => {} }) {
  let session = null;
  let pendingStart = null;
  let generation = 0;
  let inputStream = null;
  let inputContext = null;
  let inputSource = null;
  let inputProcessor = null;
  let silentGain = null;
  let outputContext = null;
  let nextPlayAt = 0;
  const playingSources = new Set();
  let lastUserTranscript = '';
  let orbitFrame = null;
  let finishOrbit = null;
  let outputTranscript='',languageCorrectionPending=false,toolQueue=Promise.resolve();
  const languagePolicy='所有語音一律使用台灣常用的中文（國語）回答，逐字稿使用繁體中文。除非使用者明確要求翻譯或切換語言，禁止改用英文回答。工具名稱、JSON 英文欄位與英文錯誤只是程式資料，解釋給使用者時必須用中文，不照念英文。回答簡短清楚，不朗讀思考過程。';

  const tools = [{
    functionDeclarations: [
      {
        name:'list_layers',
        description:'列出上帝之眼目前載入的自訂 GIS 圖層。',
        parameters:{ type:'OBJECT', properties:{} }
      },
      {
        name:'fly_to_taiwan',
        description:'將 3D 地球飛到台灣視角。',
        parameters:{ type:'OBJECT', properties:{} }
      },
      {
        name:'fly_global',
        description:'回到完整地球視角。',
        parameters:{ type:'OBJECT', properties:{} }
      },
      {
        name:'fly_to_place',
        description:'使用 3D 鏡頭飛到指定地標或建物觀看。使用者說「帶我到」「看看」「飛到」時用此工具，不要規劃行車路線。',
        parameters:{ type:'OBJECT', properties:{ place:{type:'STRING',description:'地標或建物名稱，例如台北101'} }, required:['place'] }
      },
      {
        name:'fly_to_and_orbit_place',
        description:'使用 3D 鏡頭飛到指定建物，接著環繞建物完整一圈。使用者說「帶我到台北101並繞一圈」時必須用此工具，這不是行車導航。',
        parameters:{ type:'OBJECT', properties:{ place:{type:'STRING',description:'地標或建物名稱，例如台北101'} }, required:['place'] }
      },
      {
        name:'plan_driving_route',
        description:'只有使用者明確要求開車、行車路線或道路導航時，才用 TomTom 規劃路線。觀看建物、飛往地標與環繞鏡頭不可使用此工具。',
        parameters:{
          type:'OBJECT',
          properties:{
            origin:{type:'STRING',description:'起點名稱，可省略'},
            destination:{type:'STRING',description:'目的地名稱'}
          },
          required:['destination']
        }
      },
      {
        name:'show_route',
        description:'將鏡頭縮放到目前已規劃的行車路線。',
        parameters:{ type:'OBJECT', properties:{} }
      },
      {
        name:'navigation_view',
        description:'切換到沿目前路線方向的導航視角。',
        parameters:{ type:'OBJECT', properties:{} }
      },
      {
        name:'start_navigation',
        description:'使用裝置目前位置開始跟隨導航；必須先規劃路線。',
        parameters:{ type:'OBJECT', properties:{} }
      },
      {
        name:'drive_route',
        description:'不用 GPS，使用低角度行車視角沿已規劃的道路路線連續前進。使用者說「沿路線開過去」「行車視角」「模擬開車」用此工具；若尚未規劃路線，先呼叫 plan_driving_route。這是行車預覽，不是真實位置。',
        parameters:{type:'OBJECT',properties:{}}
      },
      {
        name:'stop_navigation',
        description:'停止目前位置跟隨導航，但保留路線。',
        parameters:{ type:'OBJECT', properties:{} }
      },
      {
        name:'create_buffer',
        description:'對指定 GeoJSON 圖層建立公尺距離的影響範圍。',
        parameters:{
          type:'OBJECT',
          properties:{
            layerId:{type:'STRING',description:'list_layers 回傳的圖層 id'},
            distanceMeters:{type:'NUMBER',description:'Buffer 距離，單位公尺'}
          },
          required:['layerId','distanceMeters']
        }
      }
    ]
  }];

  async function start() {
    if (session) return;
    if (pendingStart) return pendingStart;
    const current = ++generation;
    outputTranscript='';languageCorrectionPending=false;
    outputContext ||= new AudioContext({sampleRate:24000});
    void outputContext.resume().catch(()=>{});
    const task = (async () => {
    onStatus('正在取得 Gemini Live 短效權杖… 最多等待 30 秒');
    const token = await deadline(globalThis.__TAURI_INTERNALS__
      ? invoke('gemini_ephemeral_token')
      : browserAi('/gemini-token', { method:'POST' }).then(result => result.token),
      30000, '取得短效權杖逾時，請檢查網路或稍後重試');
    if (current !== generation) return;
    onStatus('短效權杖已取得，正在連線 Gemini Live…');
    const ai = new GoogleGenAI({ apiKey: token, apiVersion:'v1beta' });
    const connection = ai.live.connect({
      model: MODEL,
      callbacks:{
        onopen:() => { if (current === generation) onStatus('Gemini Live 已連線'); },
        onerror:(e) => { if (current === generation) onStatus(`Gemini Live 錯誤：${e?.message || e}`); },
        onclose:(e) => {
          if (current !== generation) return;
          onStatus(`Gemini Live 已中斷${e?.reason ? '：'+e.reason : ''}`);
          generation++;cancelOrbit();session = null;
          void releaseAudio();
        },
        onmessage:(message) => { if (current === generation) void handleMessage(message,current).catch(error=>{if(current===generation)onStatus(`語音訊息處理失敗：${error.message}`);}); },
      },
      config:{
        responseModalities:[Modality.AUDIO],
        inputAudioTranscription:{},
        outputAudioTranscription:{},
        speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}},
        systemInstruction:languagePolicy+'你是「上帝之眼・台灣版」即時 3D 地圖語音助理。使用繁體中文，先完整理解使用者一句話的所有動作。說「帶我到台北101並繞該建物一圈」代表鏡頭飛往建物並環繞，直接呼叫 fly_to_and_orbit_place(place="台北101")，不要詢問目的地，也不要呼叫行車導航。其他「帶我到」「飛到」「看看」用 fly_to_place。只有明確提到開車、行車路線或道路導航才呼叫 plan_driving_route；想沿路線開過去或看行車視角時呼叫 drive_route，不要求 GPS；只有明確要求依裝置實際定位導航才呼叫 start_navigation。需要操作時必須呼叫工具，不可假裝已完成。工具失敗時說明實際原因。',
        tools,
      }
    });
    connection.then(late => { if (current !== generation) late.close(); }).catch(() => {});
    const connected = await deadline(connection, 25000, 'Gemini Live 連線逾時，請檢查網路與金鑰權限');
    if (current !== generation) { connected.close(); return; }
    session = connected;
    onStatus('Gemini Live 已連線，正在開啟麥克風…');
    await startMicrophone(current);
    if (current !== generation) return;
    onStatus('Gemini Live 聆聽中；再按一次麥克風即可停止');
    })().catch(async error => {
      if (current === generation) {
        generation++;
        try { session?.close(); } catch {}
        session = null;
        await releaseAudio();
        onStatus(`Gemini Live 啟動失敗：${error?.message || String(error)}`);
      }
      throw error;
    }).finally(() => { if (pendingStart === task) pendingStart = null; });
    pendingStart = task;
    return task;
  }

  async function stop() {
    generation++;
    cancelOrbit();
    try { session?.sendRealtimeInput?.({ audioStreamEnd:true }); } catch {}
    await releaseAudio();
    try { session?.close(); } catch {}
    session = null;
    pendingStart = null;
    onStatus('Gemini Live 已停止');
  }

  async function releaseAudio() {
    stopPlayback();
    inputProcessor?.disconnect(); inputProcessor = null;
    inputSource?.disconnect(); inputSource = null;
    silentGain?.disconnect(); silentGain = null;
    inputStream?.getTracks?.().forEach(t => t.stop()); inputStream = null;
    if (inputContext) { try { await inputContext.close(); } catch {} inputContext = null; }
    if (outputContext) { try { await outputContext.close(); } catch {} outputContext = null; }
    nextPlayAt = 0;
  }

  async function toggle() {
    if (session || pendingStart) return stop();
    return start();
  }

  async function startMicrophone(current) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true }
    });
    if(current!==generation){stream.getTracks().forEach(track=>track.stop());throw new DOMException('語音已停止','AbortError');}
    inputStream=stream;
    inputContext = new AudioContext({ sampleRate:16000 });
    await inputContext.resume();
    inputSource = inputContext.createMediaStreamSource(inputStream);
    inputProcessor = inputContext.createScriptProcessor(4096, 1, 1);
    silentGain = inputContext.createGain();
    silentGain.gain.value = 0;

    inputProcessor.onaudioprocess = (event) => {
      if (!session) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = floatToPcm16(input);
      session.sendRealtimeInput({
        audio:{ data:bytesToBase64(new Uint8Array(pcm.buffer)), mimeType:`audio/pcm;rate=${inputContext.sampleRate}` }
      });
    };
    inputSource.connect(inputProcessor);
    inputProcessor.connect(silentGain);
    silentGain.connect(inputContext.destination);
  }

  async function handleMessage(message,current) {
    if(current!==generation)return;
    const inputText = message?.serverContent?.inputTranscription?.text;
    const outputText = message?.serverContent?.outputTranscription?.text;
    if (inputText) { lastUserTranscript=(lastUserTranscript+inputText).slice(-1000);onTranscript({ role:'user', text:inputText }); }
    if (outputText) {
      outputTranscript+=outputText;
      const englishOnly=!/[\u3400-\u9fff]/.test(outputTranscript) && (outputTranscript.match(/[a-zA-Z]+/g)||[]).length>=8;
      const requestsEnglish=/(?:請|改|用|以|切換|翻譯成).{0,12}(?:英文|英語|English)/i.test(lastUserTranscript) && !/(?:不要|別|禁止|不能|不准|不用).{0,8}(?:英文|英語|English)/i.test(lastUserTranscript);
      if(englishOnly && !languageCorrectionPending && !requestsEnglish){
        languageCorrectionPending=true;stopPlayback();onStatus('正在將語音回覆改回台灣中文…');
        session?.sendClientContent({turns:[{role:'user',parts:[{text:'請停止剛才的英文回答，立即改用台灣中文（國語）完整回答上一個問題；保持繁體中文逐字稿。'}]}],turnComplete:true});
        return;
      }
      if(!languageCorrectionPending)onTranscript({ role:'assistant', text:outputText });
    }

    if (message?.toolCall?.functionCalls?.length) {
      const job=toolQueue.catch(()=>{}).then(async()=>{const responses = [];
      for (const fc of message.toolCall.functionCalls) {
        if(current!==generation)return;
        try {
          responses.push({ id:fc.id, name:fc.name, response:{ result:await executeTool(fc.name, fc.args || {}) } });
        } catch (error) {
          responses.push({ id:fc.id, name:fc.name, response:{ error:error?.message || String(error) } });
        }
      }
      if(current===generation)session?.sendToolResponse({ functionResponses:responses.map(item=>({...item,response:{...item.response,replyLanguage:'請用台灣中文（國語）解釋執行結果；不要照念英文欄位。'}})) });
      });toolQueue=job;await job;
    }

    if (message?.serverContent?.interrupted) { stopPlayback();outputTranscript='';languageCorrectionPending=false;return; }
    if(message?.serverContent?.turnComplete){outputTranscript='';languageCorrectionPending=false;lastUserTranscript='';}
    if(current!==generation || languageCorrectionPending)return;
    const parts = message?.serverContent?.modelTurn?.parts || [];
    // SDK message.data is a convenience getter for the same inline audio.
    const audio = parts.filter(part => part.inlineData?.data && /^audio\/pcm/i.test(part.inlineData.mimeType || 'audio/pcm')).map(part => part.inlineData.data);
    if (audio.length) for (const payload of new Set(audio)) queueAudio(payload);
    else if (typeof message?.data === 'string') queueAudio(message.data);
  }

  async function executeTool(name, args) {
    if (name === 'list_layers') {
      return listLayers().map(l => ({ id:l.id, name:l.name, kind:l.kind, featureCount:l.geojson?.features?.length ?? null }));
    }
    if (name === 'fly_to_taiwan') {
      viewer.camera.flyTo({ destination:Cesium.Rectangle.fromDegrees(119.2,21.6,122.4,25.7), duration:1.2 });
      return { ok:true, view:'taiwan' };
    }
    if (name === 'fly_global') {
      viewer.camera.flyHome(1.2);
      return { ok:true, view:'global' };
    }
    if (name === 'fly_to_place') return flyToPlace(String(args.place || ''));
    if (name === 'fly_to_and_orbit_place') return flyToAndOrbitPlace(String(args.place || ''));
    if (name === 'plan_driving_route') {
      if (isVisualVisit(lastUserTranscript)) {
        const place = String(args.destination || extractVisualPlace(lastUserTranscript));
        return /繞|環繞|一圈/.test(lastUserTranscript) ? flyToAndOrbitPlace(place) : flyToPlace(place);
      }
      if (!navigation) throw new Error('導航工具尚未初始化');
      return navigation.planRoute({
        origin:String(args.origin || ''),
        destination:String(args.destination || ''),
      });
    }
    if (name === 'show_route') {
      if (!navigation) throw new Error('導航工具尚未初始化');
      return navigation.showRoute();
    }
    if (name === 'navigation_view') {
      if (!navigation) throw new Error('導航工具尚未初始化');
      return navigation.navigationView();
    }
    if(name==='drive_route'){
      if(!navigation)throw new Error('導航工具尚未初始化');
      return navigation.driveRoute();
    }
    if (name === 'start_navigation') {
      if (!navigation) throw new Error('導航工具尚未初始化');
      return navigation.startNavigation();
    }
    if (name === 'stop_navigation') {
      if (!navigation) throw new Error('導航工具尚未初始化');
      return navigation.stopNavigation();
    }
    if (name === 'create_buffer') {
      const layer = getLayer(String(args.layerId || ''));
      if (!layer) throw new Error('找不到指定圖層');
      const distance = Number(args.distanceMeters);
      if (!Number.isFinite(distance) || distance <= 0 || distance > 100000) throw new Error('Buffer 距離必須在 0–100000 公尺');
      const result = await runBuffer(layer, viewer, distance);
      return { ok:true, outputLayerId:result.id, outputLayerName:result.name, distanceMeters:distance };
    }
    throw new Error(`不支援的工具：${name}`);
  }

  function isVisualVisit(text) {
    return /帶我到|飛到|看一看|看看|環繞|繞.*一圈/.test(text) && !/開車|駕車|行車|道路導航|規劃路線/.test(text);
  }
  function extractVisualPlace(text) {
    if (/台北\s*101|臺北\s*101|Taipei\s*101/i.test(text)) return '台北101';
    return text.replace(/^(帶我到|飛到|看看|看一看)/,'').replace(/(並且|然後|再)?(繞|環繞).*/,'').trim();
  }
  async function resolvePlace(place) {
    return searchPlace(place);
  }
  async function flyToPlace(place) {
    cancelOrbit();
    const target = await resolvePlace(place);
    onStatus(`正在飛往${target.name}…`);
    await new Promise((resolve,reject) => viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(target.lon,target.lat,target.height/2), Math.max(160,target.height/2)),
      { duration:2, offset:new Cesium.HeadingPitchRange(0,Cesium.Math.toRadians(-24),Math.max(900,target.height*2)), complete:resolve, cancel:()=>reject(new Error('鏡頭飛行已取消')) }
    ));
    onStatus(`已到達${target.name}`);
    return { ok:true, place:target.name, mode:'3D 視角', coordinates:[target.lat,target.lon], heightMeters:target.height };
  }
  async function flyToAndOrbitPlace(place) {
    const result = await flyToPlace(place);
    const target = { name:result.place, lat:result.coordinates[0], lon:result.coordinates[1], height:result.heightMeters };
    const center = Cesium.Cartesian3.fromDegrees(target.lon,target.lat,target.height/2);
    const distance = Math.max(900,target.height*2);
    onStatus(`正環繞${target.name}一圈…`);
    await new Promise((resolve,reject) => {
      let began = null;
      finishOrbit = () => reject(new Error('環繞已停止'));
      const frame = time => {
        if (began === null) began = time;
        const progress = Math.min((time-began)/9000,1);
        viewer.camera.lookAt(center,new Cesium.HeadingPitchRange(progress*Cesium.Math.TWO_PI,Cesium.Math.toRadians(-24),distance));
        viewer.scene.requestRender();
        if (progress < 1) orbitFrame = requestAnimationFrame(frame);
        else { orbitFrame = null; finishOrbit = null; viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); resolve(); }
      };
      orbitFrame = requestAnimationFrame(frame);
    });
    onStatus(`已完成${target.name}環繞`);
    return { ...result, mode:'3D 環繞', orbitCompleted:true };
  }
  function cancelOrbit() {
    if (orbitFrame !== null) cancelAnimationFrame(orbitFrame);
    orbitFrame = null;
    if (finishOrbit) { finishOrbit(); finishOrbit = null; }
    try { viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); } catch {}
  }

  function queueAudio(base64) {
    const bytes = base64ToBytes(base64);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (!sampleCount) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
    const samples = new Float32Array(sampleCount);
    for (let i=0;i<sampleCount;i++) samples[i] = view.getInt16(i*2, true) / 32768;

    outputContext ||= new AudioContext({ sampleRate:24000 });
    const buffer = outputContext.createBuffer(1, sampleCount, 24000);
    buffer.copyToChannel(samples, 0);
    const source = outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputContext.destination);
    playingSources.add(source);
    source.onended = () => { playingSources.delete(source); source.disconnect(); };
    const now = outputContext.currentTime;
    nextPlayAt = Math.max(nextPlayAt, now + 0.02);
    source.start(nextPlayAt);
    nextPlayAt += buffer.duration;
  }

  function stopPlayback() {
    for (const source of playingSources) { try { source.stop(); source.disconnect(); } catch {} }
    playingSources.clear();
    nextPlayAt = 0;
  }

  return { start, stop, toggle, flyToPlace, flyToAndOrbitPlace, get active(){ return !!session; }, get connecting(){ return !!pendingStart; }, model:MODEL };
}

function deadline(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

function floatToPcm16(input) {
  const out = new Int16Array(input.length);
  for (let i=0;i<input.length;i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i=0;i<bytes.length;i+=step) binary += String.fromCharCode(...bytes.subarray(i,i+step));
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i++) out[i] = binary.charCodeAt(i);
  return out;
}
