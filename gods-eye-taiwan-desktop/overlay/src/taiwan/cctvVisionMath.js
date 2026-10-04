import { VISION_CLASSES, VISION_CONFIG } from './cctvVisionConfig.js';

// Official YOLOX 0.1.1rc0: top-left letterbox 114, BGR CHW float32,
// 0..255 (no normalization); output is undecoded [1,3549,85].
export function preprocessYolox({ data, width, height }, size = VISION_CONFIG.inputSize) {
  if (!width || !height || data.length !== width * height * 4) throw new Error('CCTV 影像尺寸或像素格式無效');
  const ratio = Math.min(size / width, size / height), rw = Math.floor(width * ratio), rh = Math.floor(height * ratio);
  const pixels = new Float32Array(3 * size * size); pixels.fill(114);
  for (let y = 0; y < rh; y++) {
    const sy = Math.max(0, (y + 0.5) * height / rh - 0.5), y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < rw; x++) {
      const sx = Math.max(0, (x + 0.5) * width / rw - 0.5), x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0;
      for (let c = 0; c < 3; c++) {
        const channel = 2 - c;
        const top = data[(y0 * width + x0) * 4 + channel] * (1 - fx) + data[(y0 * width + x1) * 4 + channel] * fx;
        const bottom = data[(y1 * width + x0) * 4 + channel] * (1 - fx) + data[(y1 * width + x1) * 4 + channel] * fx;
        pixels[c * size * size + y * size + x] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { pixels, ratio };
}
function overlap(a, b) {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / Math.max(1e-9, a.width * a.height + b.width * b.height - area);
}
export function decodeYolox(output, width, height, ratio, config = VISION_CONFIG) {
  if (output.length !== 3549 * 85) throw new Error('YOLOX 輸出格式不符合隨附模型');
  const byId = new Map(VISION_CLASSES.map(c => [c.id, c])), candidates = [];
  let row = 0;
  for (const stride of [8, 16, 32]) {
    const grid = config.inputSize / stride;
    for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++, row++) {
      const offset = row * 85, objectness = output[offset + 4];
      if (objectness < config.confidence) continue;
      let id = 0, probability = output[offset + 5];
      for (let c = 1; c < 80; c++) if (output[offset + 5 + c] > probability) { id = c; probability = output[offset + 5 + c]; }
      const cls = byId.get(id), score = objectness * probability;
      if (!cls || score < config.confidence) continue;
      const cx = (output[offset] + gx) * stride / ratio, cy = (output[offset + 1] + gy) * stride / ratio;
      const bw = Math.exp(output[offset + 2]) * stride / ratio, bh = Math.exp(output[offset + 3]) * stride / ratio;
      const x = Math.max(0, cx - bw / 2), y = Math.max(0, cy - bh / 2), right = Math.min(width, cx + bw / 2), bottom = Math.min(height, cy + bh / 2);
      if (![x, y, right, bottom].every(Number.isFinite) || right <= x || bottom <= y) continue;
      candidates.push({ className: cls.name, label: cls.label, score, x, y, width: right - x, height: bottom - y });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const boxes = [];
  for (const box of candidates) {
    // One vehicle can have both car/truck hypotheses; suppress cross-class duplicates.
    if (!boxes.some(kept => overlap(kept, box) > config.nms)) boxes.push(box);
    if (boxes.length >= config.maxDetections) break;
  }
  return boxes;
}
export function summarizeVision(boxes, width, height, roi = null, config = VISION_CONFIG) {
  const counts = Object.fromEntries(VISION_CLASSES.map(c => [c.name, 0]));
  const rect = roi || { x: 0, y: 0, width, height };
  const rx = Math.max(0, Math.min(width - 1, rect.x)), ry = Math.max(0, Math.min(height - 1, rect.y));
  const rw = Math.max(1, Math.min(width - rx, rect.width)), rh = Math.max(1, Math.min(height - ry, rect.height));
  const inside = boxes.filter(b => b.x + b.width / 2 >= rx && b.x + b.width / 2 <= rx + rw && b.y + b.height / 2 >= ry && b.y + b.height / 2 <= ry + rh);
  for (const box of inside) counts[box.className]++;
  const vehicles = inside.filter(b => ['car', 'motorcycle', 'bus', 'truck'].includes(b.className));
  // Raster union prevents overlapping boxes from inflating occupancy above 100%.
  const cells = new Uint8Array(64 * 64);
  for (const b of vehicles) {
    const left = Math.max(0, Math.floor((b.x - rx) / rw * 64)), right = Math.min(64, Math.ceil((b.x + b.width - rx) / rw * 64));
    const top = Math.max(0, Math.floor((b.y - ry) / rh * 64)), bottom = Math.min(64, Math.ceil((b.y + b.height - ry) / rh * 64));
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) cells[y * 64 + x] = 1;
  }
  const occupancy = cells.reduce((sum, value) => sum + value, 0) / cells.length;
  const threshold = config.congestion.find(t => vehicles.length >= t.vehicles || occupancy >= t.occupancy);
  return { counts, congestion: { level: threshold.level, label: threshold.label, vehicles: vehicles.length, occupancy, roi: { x: rx, y: ry, width: rw, height: rh }, scope: roi ? '使用者道路範圍' : '完整畫面', disclaimer: 'AI 視覺估計，不代表官方交通統計；單張影像無法量測通過流量或實際車速。' } };
}
