// Frames cross only the local worker boundary; no upload/API/key is used here.
export function createCctvLocalVision({ onStatus = () => {}, preferBackend = 'auto' } = {}) {
  let worker = null, nextId = 0, generation = 0, queued = Promise.resolve();
  const pending = new Map();
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./cctvVisionWorker.js', import.meta.url), { type: 'module', name: 'CCTV-local-YOLOX' });
    const instance = worker;
    worker.onmessage = ({ data }) => {
      if (worker !== instance) return;
      if (data.type === 'status') { onStatus(data.message); return; }
      const job = pending.get(data.id); if (!job) return;
      pending.delete(data.id); clearTimeout(job.timer);
      if (data.type === 'error') job.reject(new Error(data.error)); else job.resolve(data.result);
    };
    worker.onerror = event => { if (worker !== instance) return; dispose(); onStatus(`本機辨識 worker 錯誤：${event.message || '無法載入'}`); };
    return worker;
  }
  function infer(imageData, options = {}) {
    const current = generation;
    // One session never has overlapping run() calls; callers cannot bypass this queue.
    const task = queued.catch(() => {}).then(() => {
      if (current !== generation) throw new DOMException('本機辨識已停止', 'AbortError');
      if (options.signal?.aborted) throw new DOMException('辨識已取消', 'AbortError');
      return new Promise((resolve, reject) => {
        const id = ++nextId, instance = ensureWorker();
        const copy = new Uint8ClampedArray(imageData.data);
        const timer = setTimeout(() => { dispose(); reject(new Error('本機辨識逾時，worker 已停止，可重新開始')); }, 90000);
        pending.set(id, { resolve, reject, timer });
        // Copy leaves the exact captured screenshot intact for later optional analysis.
        instance.postMessage({ type: 'infer', id, imageData: { data: copy, width: imageData.width, height: imageData.height }, options: { model: options.model, cameraId: options.cameraId, observedAt: options.observedAt, roi: options.roi, preferBackend } }, [copy.buffer]);
      });
    });
    queued = task; return task;
  }
  function dispose() {
    generation++; worker?.terminate(); worker = null;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new DOMException('本機辨識已停止', 'AbortError')); }
    pending.clear(); queued = Promise.resolve();
  }
  return { infer, dispose, get active() { return Boolean(worker); } };
}
