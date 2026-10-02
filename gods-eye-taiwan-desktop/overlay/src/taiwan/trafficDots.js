import * as Cesium from 'cesium';

// Draw the pulse on the same ground-classified path as the road overlay.
// Cartesian point sprites at terrain height do not follow Google 3D road height.
// The material animates on the GPU; no per-vertex GPU height reads are needed.
const DOT_MATERIAL = `
uniform vec4 color;
uniform float phase;
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 st = materialInput.st;
    float delta = abs(fract(st.s - phase + 0.5) - 0.5);
#if (__VERSION__ == 300 || defined(GL_OES_standard_derivatives))
    float halfLength = max(abs(fwidth(st.s)) * 2.0 * czm_pixelRatio, 0.000001);
#else
    float halfLength = 0.015;
#endif
    vec2 offset = vec2(delta / halfLength, (st.t - 0.5) * 2.0);
    float alpha = 1.0 - smoothstep(0.65, 1.0, length(offset));
    material.diffuse = color.rgb;
    material.alpha = color.a * alpha;
    return material;
}
`;

export function createTrafficDots(viewer) {
  const primitives = viewer.scene.groundPrimitives.add(new Cesium.PrimitiveCollection());
  let batches = [], visible = true, disposed = false, elapsed = 0, last = 0;
  function replace(segments) {
    if (disposed) return 0;
    primitives.removeAll(); batches = [];
    const moving = segments.filter(segment => !segment.closure && segment.trafficLevel > 0 && segment.coords.length > 1);
    const step = Math.max(1, Math.ceil(moving.length / 800)), groups = new Map();
    let count = 0;
    for (let index = 0; index < moving.length; index += step) {
      const segment = moving[index], coords = segment.coords;
      let length = 0;
      for (let k = 1; k < coords.length; k++) {
        const [lon, lat] = coords[k], previous = coords[k - 1];
        length += Math.hypot((lon - previous[0]) * 111320 * Math.cos(lat * Math.PI / 180), (lat - previous[1]) * 110540);
      }
      if (!Number.isFinite(length) || length < 5) continue;
      const colorBand = segment.trafficLevel < .4 ? 0 : segment.trafficLevel < .75 ? 1 : 2;
      const base = /(motorway|freeway|trunk)/i.test(segment.roadType) ? 24 : 12;
      // Batch similar traversal rates; the pulses are speed illustrations,
      // not measured positions of individual vehicles. sqrt(2) buckets limit
      // the rate approximation to about 19% while keeping draw calls bounded.
      const rate = base * segment.trafficLevel / length;
      const rateBucket = Math.round(Math.log2(rate) * 2);
      const key = `${colorBand}:${rateBucket}`;
      let group = groups.get(key);
      if (!group) {
        group = { colorBand, rate: 2 ** (rateBucket / 2), instances: [] };
        groups.set(key, group);
      }
      group.instances.push(new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions: Cesium.Cartesian3.fromDegreesArray(coords.flatMap(point => point.slice(0, 2))),
          width: 4,
        }),
      }));
      count++;
    }
    for (const group of groups.values()) {
      const offset = (batches.length * .61803398875) % 1;
      const material = new Cesium.Material({
        fabric: { type: 'TaiwanTrafficRoadDot', uniforms: {
          color: Cesium.Color.fromCssColorString(['#ff5c54', '#ffd45c', '#70ffc7'][group.colorBand]),
          phase: offset,
        }, source: DOT_MATERIAL },
        translucent: true,
      });
      primitives.add(new Cesium.GroundPolylinePrimitive({
        geometryInstances: group.instances,
        classificationType: Cesium.ClassificationType.BOTH,
        appearance: new Cesium.PolylineMaterialAppearance({ material, translucent: true }),
        allowPicking: false,
      }));
      batches.push({ material, rate: group.rate, offset });
    }
    elapsed = 0; last = 0;
    primitives.show = visible;
    viewer.scene.requestRender();
    return count;
  }
  const remove = viewer.scene.preUpdate.addEventListener(() => {
    const now = performance.now();
    if (!visible || !batches.length) { last = now; return; }
    elapsed += last ? Math.min(.15, (now - last) / 1000) : 0;
    last = now;
    for (const batch of batches) batch.material.uniforms.phase = (batch.offset + elapsed * batch.rate) % 1;
  });
  const timer = setInterval(() => {
    if (visible && batches.length) viewer.scene.requestRender();
  }, 1000 / 24);
  return {
    replace,
    setVisibility(value) { visible = !!value; primitives.show = visible; last = 0; },
    dispose() {
      if (disposed) return;
      disposed = true; clearInterval(timer); remove();
      viewer.scene.groundPrimitives.remove(primitives); batches = [];
    },
  };
}
