// Thresholds are configurable visual estimates, never official traffic counts.
export const VISION_CLASSES = Object.freeze([
  { id: 0, name: 'person', label: '行人' },
  { id: 1, name: 'bicycle', label: '自行車' },
  { id: 2, name: 'car', label: '汽車' },
  { id: 3, name: 'motorcycle', label: '機車' },
  { id: 5, name: 'bus', label: '公車' },
  { id: 7, name: 'truck', label: '卡車' },
]);
export const VISION_CONFIG = Object.freeze({
  confidence: 0.35, nms: 0.45, maxDetections: 200, inputSize: 416,
  congestion: [
    { level: 'very-high', label: '非常高', vehicles: 25, occupancy: 0.45 },
    { level: 'high', label: '高', vehicles: 15, occupancy: 0.28 },
    { level: 'medium', label: '中', vehicles: 7, occupancy: 0.12 },
    { level: 'low', label: '低', vehicles: 0, occupancy: 0 },
  ],
  profiles: {
    eco: { label: '省電', concurrency: 1, intervalMs: 5000, model: 'nano' },
    balanced: { label: '平衡', concurrency: 2, intervalMs: 3000, model: 'tiny' },
    realtime: { label: '即時', concurrency: 2, intervalMs: 1500, model: 'tiny' },
  },
});
export const VISION_MODELS = Object.freeze({
  tiny: { name: 'YOLOX-Tiny', url: '/models/yolox/yolox_tiny.onnx' },
  nano: { name: 'YOLOX-Nano', url: '/models/yolox/yolox_nano.onnx' },
});
export function supportsRealtime(hardware = globalThis.navigator || {}) {
  return Number(hardware.hardwareConcurrency || 0) >= 8 && Number(hardware.deviceMemory || 0) >= 8 && Boolean(hardware.gpu);
}
