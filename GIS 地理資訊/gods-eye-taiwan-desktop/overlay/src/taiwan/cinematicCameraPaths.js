// Local camera mathematics. Coordinates are metres in Cesium's Earth-fixed frame.
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const blendAngle = (from, to, t) => from + angleDelta(from, to) * t;
export const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Centripetal Catmull-Rom avoids loops when waypoints have uneven spacing. */
export function smoothPath(points, samplesPerSegment = 32) {
  const clean = [];
  for (const p of points) if (p?.length === 3 && p.every(Number.isFinite) && (!clean.length || distance(p, clean.at(-1)) > .01)) clean.push(p);
  if (clean.length < 2) throw new Error('需要至少兩個不同位置的航點');
  if (clean.length > 3000) throw new Error('航點過多，請縮短路徑');
  const output = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const p1 = clean[i], p2 = clean[i + 1];
    const p0 = clean[i - 1] || lerp(p2, p1, 2), p3 = clean[i + 2] || lerp(p1, p2, 2);
    const t0 = 0, t1 = t0 + Math.sqrt(distance(p0, p1)), t2 = t1 + Math.sqrt(distance(p1, p2)), t3 = t2 + Math.sqrt(distance(p2, p3));
    const mix = (a, b, ta, tb, t) => lerp(a, b, (t - ta) / Math.max(.00001, tb - ta));
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = t1 + (t2 - t1) * j / samplesPerSegment;
      const a1 = mix(p0, p1, t0, t1, t), a2 = mix(p1, p2, t1, t2, t), a3 = mix(p2, p3, t2, t3, t);
      output.push(mix(mix(a1, a2, t0, t2, t), mix(a2, a3, t1, t3, t), t1, t2, t));
    }
  }
  output.push(clean.at(-1).slice());
  return createArcPath(output);
}

export function createArcPath(points) {
  if (points.length < 2) throw new Error('路徑點不足');
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + distance(points[i - 1], points[i]));
  const total = lengths.at(-1);
  if (total < .01) throw new Error('路徑長度不足');
  return { points, lengths, total, sample(metres) {
    const d = clamp(metres, 0, total);
    let lo = 1, hi = lengths.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] < d) lo = mid + 1; else hi = mid; }
    return lerp(points[lo - 1], points[lo], (d - lengths[lo - 1]) / Math.max(.00001, lengths[lo] - lengths[lo - 1]));
  } };
}

export function keyframeAt(frames, elapsed) {
  if (frames.length < 2) throw new Error('需要至少兩個鏡頭');
  let remaining = Math.max(0, elapsed);
  for (let i = 0; i < frames.length - 1; i++) {
    const duration = clamp(Number(frames[i].duration) || 4, .5, 180);
    if (remaining <= duration || i === frames.length - 2) return { index:i, fraction:clamp(remaining / duration, 0, 1) };
    remaining -= duration;
  }
}
