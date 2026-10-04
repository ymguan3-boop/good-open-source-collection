import { makePanelDraggable } from './draggablePanel.js';

// Models are display illustrations. Pixel sizing retains the GLB in city views;
// a tiny depth-independent symbol locates the same vehicle in distant views.
export function vehicleDisplayPolicy(mode) {
  const motorcycle = mode === 'motorcycle';
  const shape = motorcycle
    ? '<circle cx="8" cy="25" r="5"/><circle cx="26" cy="25" r="5"/><path d="M8 25L14 15L23 15L26 25M12 13H19M22 10L26 25"/>'
    : '<path d="M7 13L10 7H24L27 13V27H7Z"/><path d="M11 14V10H23V14M11 23H23"/>';
  const color = motorcycle ? '#ffcd55' : '#42ceff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34"><rect x="1" y="1" width="32" height="32" rx="8" fill="#071a2b" stroke="${color}" stroke-width="2"/><g fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
  return {
    uri: motorcycle ? '/models/taiwan-scooter.glb' : '/models/taiwan-car.glb',
    minimumPixelSize: motorcycle ? 56 : 64,
    markerImage: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    markerSize: 18,
    markerNear: 350,
    label: motorcycle ? '機車行進示意' : '汽車行進示意',
  };
}

/** Attach the existing shared drag handlers without owning camera controls. */
export function attachNavigationCard(card) {
  if (!card) return () => {};
  const doc = card.ownerDocument, win = doc.defaultView;
  const oldStyles = new Map(['maxWidth','maxHeight','minWidth','minHeight','overflow','resize'].map(name => [name,card.style[name]]));
  let handle = card.querySelector('[data-navigation-drag-handle]');
  const created = !handle;
  if (!handle) {
    handle = doc.createElement('header');
    handle.dataset.navigationDragHandle = '';
    handle.textContent = '行車路線與行進示意';
    handle.style.cssText = 'font-weight:700;user-select:none;touch-action:none;cursor:move;padding:2px 0 8px;position:sticky;top:0;background:inherit;z-index:1';
    card.prepend(handle);
  }
  card.style.overflow = 'auto';card.style.resize = 'both';
  card.style.minHeight = '100px';
  const releaseDrag = makePanelDraggable(card,handle);
  const clamp = () => {
    if (card.hidden) return;
    const width = Math.max(1,win.innerWidth),height = Math.max(1,win.innerHeight);
    card.style.maxWidth = `${width}px`;card.style.maxHeight = `${height}px`;
    card.style.minWidth = `${Math.min(240,width)}px`;
    const rect = card.getBoundingClientRect();
    const parent = card.offsetParent?.getBoundingClientRect() || {left:0,top:0};
    const left = Math.max(0,Math.min(width-Math.min(rect.width,width),rect.left));
    const top = Math.max(0,Math.min(height-Math.min(rect.height,height),rect.top));
    if (Math.abs(left-rect.left)>.5 || Math.abs(top-rect.top)>.5) {
      card.style.right='auto';card.style.bottom='auto';
      card.style.left=`${left-parent.left}px`;card.style.top=`${top-parent.top}px`;
    }
  };
  const observer = win.ResizeObserver ? new win.ResizeObserver(clamp) : null;
  observer?.observe(card);
  const visibility = win.MutationObserver ? new win.MutationObserver(clamp) : null;
  visibility?.observe(card,{attributes:true,attributeFilter:['hidden']});
  win.addEventListener('resize',clamp);clamp();
  return () => {
    releaseDrag();observer?.disconnect();visibility?.disconnect();
    win.removeEventListener('resize',clamp);
    for (const [name,value] of oldStyles) card.style[name]=value;
    if(created)handle.remove();
  };
}
