import * as Cesium from 'cesium';

// Weak ownership never keeps cleared route entities alive. All route pickers use
// the first route in the same drill-pick order, so overlapping modes open one card.
const owners = new WeakMap();
export function markRouteEntity(entity, type) {
  if (entity && ['driving', 'transit'].includes(type)) owners.set(entity, type);
  return entity;
}

export function findRoutePick(hits, type, contains) {
  for (const hit of hits || []) {
    const entity = hit?.id || hit?.primitive?.id;
    const owner = entity && owners.get(entity);
    if (owner) return owner === type && contains(entity) ? entity : null;
  }
  return null;
}

export function attachRoutePicker({viewer, type, getSource, onPick}) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction(click => {
    const source = getSource();
    if (!source || source.show === false) return;
    let hits;
    try { hits = viewer.scene.drillPick(click.position, 8); }
    catch { return; }
    const entity = findRoutePick(hits, type, item => source.entities.contains(item));
    if (entity) onPick(entity);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  return () => { if (!handler.isDestroyed()) handler.destroy(); };
}

export function escapeRouteText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function routePickInfo(type, {title, html, routeId}) {
  if (!['driving', 'transit'].includes(type)) throw new Error('不支援的導航路線');
  return {type, title, routeId:String(routeId), html:`${html}<div class="tw-actions"><button type="button" data-act="hide-${type}-route" data-route-id="${escapeRouteText(routeId)}">關閉這條導航路線</button></div>`};
}
