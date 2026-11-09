import * as ort from 'onnxruntime-web/webgpu';
import { VISION_MODELS } from './cctvVisionConfig.js';
import { preprocessYolox, decodeYolox, summarizeVision } from './cctvVisionMath.js';

ort.env.wasm.numThreads = 1; // Works without COOP/COEP and leaves CPUs for Cesium.
ort.env.wasm.proxy = false; // Already inside our dedicated worker.
ort.env.wasm.wasmPaths = new URL('/models/onnxruntime/', self.location.origin).href;
let session = null, modelName = null, backend = null, queue = Promise.resolve();
async function release() {
  if (session) await session.release();
  session = null; modelName = null; backend = null;
}
async function load(model, preferred) {
  if (session && modelName === model && (preferred !== 'wasm' || backend === 'wasm')) return;
  await release();
  const url = new URL(VISION_MODELS[model].url, self.location.origin).href;
  self.postMessage({ type: 'status', message: `正在本機載入 ${VISION_MODELS[model].name}…` });
  if (preferred !== 'wasm' && self.navigator?.gpu) {
    try { session = await ort.InferenceSession.create(url, { executionProviders: ['webgpu', 'wasm'], graphOptimizationLevel: 'all' }); backend = 'webgpu'; }
    catch { session = null; self.postMessage({ type: 'status', message: 'WebGPU 無法使用，改用本機 WASM／CPU。' }); }
  }
  if (!session) { session = await ort.InferenceSession.create(url, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); backend = 'wasm'; }
  modelName = model;
}
async function infer(message) {
  const { imageData, options = {} } = message, model = options.model === 'nano' ? 'nano' : 'tiny';
  await load(model, options.preferBackend);
  const start = performance.now(), { pixels, ratio } = preprocessYolox(imageData);
  const input = new ort.Tensor('float32', pixels, [1, 3, 416, 416]);
  let output;
  try {
    try { output = await session.run({ [session.inputNames[0]]: input }); }
    catch (error) {
      if (backend !== 'webgpu') throw error;
      self.postMessage({ type: 'status', message: 'GPU 推論失敗，改用本機 WASM／CPU。' });
      await load(model, 'wasm'); output = await session.run({ [session.inputNames[0]]: input });
    }
    const tensor = output[session.outputNames[0]];
    const boxes = decodeYolox(tensor.data, imageData.width, imageData.height, ratio);
    return { boxes, ...summarizeVision(boxes, imageData.width, imageData.height, options.roi), model, modelName: VISION_MODELS[model].name, backend, inferenceMs: performance.now() - start, width: imageData.width, height: imageData.height, imageWidth: imageData.width, imageHeight: imageData.height, cameraId: options.cameraId, observedAt: options.observedAt, analyzedAt: new Date().toISOString() };
  } finally {
    input.dispose();
    for (const tensor of Object.values(output || {})) tensor.dispose();
  }
}
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const result = data.type === 'dispose' ? await release() : await infer(data);
      self.postMessage({ type: 'result', id: data.id, result });
    } catch (error) { self.postMessage({ type: 'error', id: data.id, error: error.message || String(error) }); }
  });
};
