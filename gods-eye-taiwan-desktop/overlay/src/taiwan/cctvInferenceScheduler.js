import { createCctvLocalVision } from './cctvLocalVision.js';
import { VISION_CONFIG, supportsRealtime } from './cctvVisionConfig.js';

export function createCctvInferenceScheduler({ onResult = () => {}, onStatus = () => {}, onError = () => {}, visionFactory = createCctvLocalVision, hardware = globalThis.navigator || {}, isBackground = () => globalThis.document?.hidden || false } = {}) {
  let sources = [], profile = 'balanced', model = 'auto', pressured = false, running = false, timer = null, generation = 0, cursor = 0, destroyed = false;
  const workers = [], busy = new Set(), nextAt = new Map(), manual = [], requests = new Set(), suppressed = new Set(), sourceVersions = new Map(), manualLocks = new Map();
  const stats = { completed: 0, failed: 0, peakConcurrency: 0 };
  function configuration() {
    const p = VISION_CONFIG.profiles[profile];
    return pressured ? { ...VISION_CONFIG.profiles.eco, intervalMs: 8000 } : { ...p, model: model === 'auto' ? p.model : model };
  }
  function setProfile(value) {
    if (!(value in VISION_CONFIG.profiles)) throw new Error('未知的 CCTV 排程模式');
    if (value === 'realtime' && !supportsRealtime(hardware)) throw new Error('即時模式需要至少 8 個邏輯核心、8 GB 記憶體與 WebGPU；目前使用平衡模式');
    profile = value; onStatus(`${VISION_CONFIG.profiles[value].label}模式`); tick();
  }
  function setModel(value) { model = ['tiny', 'nano'].includes(value) ? value : 'auto'; }
  function setPressure(value) { pressured = Boolean(typeof value === 'object' ? value.pressured : value); if (pressured) onStatus('資源保護：改用 Nano，最多 1 路，每 8 秒取樣；背景暫停'); tick(); }
  function setSources(value) {
    for (const source of sources) sourceVersions.set(source.id, (sourceVersions.get(source.id) || 0) + 1);
    suppressed.clear();
    sources = (value || []).filter(s => s.id && typeof s.capture === 'function');
    const ids = new Set(sources.map(s => s.id));
    for (const id of nextAt.keys()) if (!ids.has(id)) nextAt.delete(id);
    cursor = 0; tick();
  }
  function arm() { if (!timer && !destroyed && (running || manual.length)) timer = setInterval(tick, 250); }
  function start() { if (destroyed) throw new Error('CCTV 排程已關閉'); if (!running) suppressed.clear(); running = true; arm(); tick(); }
  function stop() {
    running = false; generation++; clearInterval(timer); timer = null;
    for (const worker of workers) worker?.dispose(); workers.length = 0; busy.clear(); nextAt.clear(); suppressed.clear(); sourceVersions.clear();
    const abort = new DOMException('本機辨識已停止', 'AbortError');
    for (const request of requests) request.reject(abort); requests.clear(); manual.length = 0; manualLocks.clear();
    onStatus('本機辨識已停止，worker 與模型資源已釋放');
  }
  function sampleOnce(id, options = {}) {
    if (destroyed) return Promise.reject(new Error('CCTV 排程已關閉'));
    if (manualLocks.has(id)) return manualLocks.get(id);
    const source = sources.find(s => s.id === id);
    if (!source) return Promise.reject(new Error('CCTV 不在目前畫面，請先開啟該路影像'));
    resumeSource(id);
    let request;
    const promise = new Promise((resolve, reject) => { request = { source, resolve, reject, frame: options.frame, model: options.model, requestId: options.requestId }; });
    manualLocks.set(id, promise);
    const unlock = () => { if (manualLocks.get(id) === promise) manualLocks.delete(id); };
    promise.then(unlock, unlock);
    manual.push(request); requests.add(request); arm(); tick();
    return promise;
  }
  function suppressSource(id) {
    suppressed.add(id); sourceVersions.set(id, (sourceVersions.get(id) || 0) + 1);
    const abort = new DOMException('該路辨識結果已清除，已暫停自動辨識', 'AbortError');
    for (const request of requests) if (request.source.id === id) { request.reject(abort); requests.delete(request); }
    for (let i = manual.length - 1; i >= 0; i--) if (manual[i].source.id === id) manual.splice(i, 1);
  }
  function resumeSource(id) { suppressed.delete(id); nextAt.delete(id); }
  function getAutomatic() {
    if (!running || !sources.length || (pressured && isBackground())) return null;
    const now = Date.now();
    for (let i = 0; i < sources.length; i++) {
      const source = sources[cursor++ % sources.length];
      if (!suppressed.has(source.id) && !busy.has(source.id) && (nextAt.get(source.id) || 0) <= now) return { source };
    }
    return null;
  }
  function tick() {
    if (destroyed) return;
    const config = configuration();
    for (let slot = 0; slot < config.concurrency; slot++) {
      if (workers[slot]?.busy || busy.size >= config.concurrency) continue;
      const manualIndex = manual.findIndex(r => !busy.has(r.source.id));
      const job = manualIndex >= 0 ? manual.splice(manualIndex, 1)[0] : getAutomatic();
      if (!job) continue;
      const current = generation, { source } = job, version = sourceVersions.get(source.id) || 0;
      const isSuppressed = () => suppressed.has(source.id) || version !== (sourceVersions.get(source.id) || 0);
      const worker = workers[slot] ||= { engine: visionFactory({ onStatus }), busy: false, dispose() { this.engine.dispose(); } };
      worker.busy = true; busy.add(source.id); stats.peakConcurrency = Math.max(stats.peakConcurrency, busy.size);
      void (async () => {
        try {
          const frame = job.frame || await source.capture({ requestId: job.requestId });
          if (current !== generation || !sources.some(s => s.id === source.id)) throw new DOMException('該路影像已離開目前畫面', 'AbortError');
          if (isSuppressed()) throw new DOMException('該路辨識結果已清除', 'AbortError');
          if (!frame?.imageData) throw new Error('尚未取得可分析的官方 CCTV 影像');
          const result = await worker.engine.infer(frame.imageData, { model: job.model || config.model, cameraId: source.id, observedAt: frame.observedAt, roi: source.roi });
          if (current !== generation) return;
          if (!sources.some(s => s.id === source.id)) throw new DOMException('該路影像已離開目前畫面', 'AbortError');
          if (isSuppressed()) throw new DOMException('該路辨識結果已清除', 'AbortError');
          if (profile === 'realtime' && result.backend === 'wasm') {
            profile = 'balanced';
            onStatus('未取得可用 GPU，即時模式自動降為平衡模式。');
          }
          stats.completed++;
          const event = { ...result, cameraId: source.id, camera: source.camera, cameraName: frame.cameraName || source.camera?.name, requestId: job.requestId || frame.requestId, screenshot: frame.screenshot, observedAt: frame.observedAt, capturedAt: frame.capturedAt, sourceObservedAt: frame.sourceObservedAt || null, receivedAt: frame.receivedAt || null, source: frame.source };
          onResult(event); job.resolve?.(event);
        } catch (error) {
          if (current === generation) { if (error.name !== 'AbortError') { stats.failed++; onError({ cameraId: source.id, error }); } job.reject?.(error); }
        } finally {
          requests.delete(job);
          if (current === generation) {
            worker.busy = false; busy.delete(source.id); nextAt.set(source.id, Date.now() + configuration().intervalMs);
            if (!running && !manual.length && !busy.size) { clearInterval(timer); timer = null; }
          }
        }
      })();
    }
  }
  function destroy() { stop(); destroyed = true; sources = []; }
  return { start, stop, destroy, sampleOnce, suppressSource, resumeSource, setSources, setProfile, setModel, setPressure, configuration,
    get running() { return running; }, get stats() { return { ...stats, active: busy.size, sources: sources.length, suppressed: [...suppressed], profile, model, pressured, realtimeAvailable: supportsRealtime(hardware) }; } };
}
