import { GoogleGenAI, Modality } from '@google/genai';
import { invoke } from '@tauri-apps/api/core';
import * as Cesium from 'cesium';
import { listLayers, getLayer } from './layerRegistry.js';
import { runBuffer } from './analysis.js';

const MODEL = 'gemini-3.8-live';

export function createGeminiLiveController({ viewer, navigation, onStatus = () => {}, onTranscript = () => {} }) {
  let session = null;
  let inputStream = null;
  let inputContext = null;
  let inputSource = null;
  let inputProcessor = null;
  let silentGain = null;
  let outputContext = null;
  let nextPlayAt = 0;

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
        name:'plan_driving_route',
        description:'使用 TomTom 規劃行車路線並顯示在 Cesium。可指定起點；起點省略時使用目前位置。',
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
    if (!globalThis.__TAURI_INTERNALS__) throw new Error('Gemini Live 安全模式需要 Tauri 桌面環境');
    onStatus('正在取得 Gemini Live 短效權杖…');
    const token = await invoke('gemini_ephemeral_token');
    const ai = new GoogleGenAI({ apiKey: token });

    session = await ai.live.connect({
      model: MODEL,
      callbacks:{
        onopen:() => onStatus('Gemini Live 已連線'),
        onerror:(e) => onStatus(`Gemini Live 錯誤：${e?.message || e}`),
        onclose:(e) => {
          onStatus(`Gemini Live 已中斷${e?.reason ? '：'+e.reason : ''}`);
          session = null;
        },
        onmessage:(message) => handleMessage(message),
      },
      config:{
        responseModalities:[Modality.AUDIO],
        inputAudioTranscription:{},
        outputAudioTranscription:{},
        systemInstruction:'你是「上帝之眼・台灣版」的即時 GIS 與導航語音助理。使用繁體中文。需要操作地圖、圖層、路線或導航時必須呼叫工具，不可假裝已操作；GIS 幾何與路線計算由工具執行。當使用者說「導航到某地」時，先規劃行車路線，再啟動導航。',
        tools,
      }
    });

    await startMicrophone();
    onStatus('Gemini Live 聆聽中；再按一次麥克風即可停止');
  }

  async function stop() {
    try { session?.sendRealtimeInput?.({ audioStreamEnd:true }); } catch {}
    inputProcessor?.disconnect(); inputProcessor = null;
    inputSource?.disconnect(); inputSource = null;
    silentGain?.disconnect(); silentGain = null;
    inputStream?.getTracks?.().forEach(t => t.stop()); inputStream = null;
    if (inputContext) { try { await inputContext.close(); } catch {} inputContext = null; }
    try { session?.close(); } catch {}
    session = null;
    onStatus('Gemini Live 已停止');
  }

  async function toggle() {
    if (session) return stop();
    return start();
  }

  async function startMicrophone() {
    inputStream = await navigator.mediaDevices.getUserMedia({
      audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true }
    });
    inputContext = new AudioContext({ sampleRate:16000 });
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

  async function handleMessage(message) {
    const inputText = message?.serverContent?.inputTranscription?.text;
    const outputText = message?.serverContent?.outputTranscription?.text;
    if (inputText) onTranscript({ role:'user', text:inputText });
    if (outputText) onTranscript({ role:'assistant', text:outputText });

    if (message?.toolCall?.functionCalls?.length) {
      const responses = [];
      for (const fc of message.toolCall.functionCalls) {
        try {
          responses.push({ id:fc.id, name:fc.name, response:{ result:await executeTool(fc.name, fc.args || {}) } });
        } catch (error) {
          responses.push({ id:fc.id, name:fc.name, response:{ error:error?.message || String(error) } });
        }
      }
      session?.sendToolResponse({ functionResponses:responses });
    }

    if (typeof message?.data === 'string') queueAudio(message.data);
    const parts = message?.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (part?.inlineData?.data) queueAudio(part.inlineData.data);
    }
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
    if (name === 'plan_driving_route') {
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
    const now = outputContext.currentTime;
    nextPlayAt = Math.max(nextPlayAt, now + 0.02);
    source.start(nextPlayAt);
    nextPlayAt += buffer.duration;
  }

  return { start, stop, toggle, get active(){ return !!session; }, model:MODEL };
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
