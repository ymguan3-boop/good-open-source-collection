import { makePanelDraggable } from './draggablePanel.js';
import * as Cesium from 'cesium';

/** Display-only sizing keeps the complete model above terrain at distant zooms. */
export function illustrativeModelPlacement(viewer,lon,lat,height,pixels,diameter){
  let lift=0,scale=1;
  try {
    const surface=Cesium.Cartesian3.fromDegrees(lon,lat,height+.12);
    const distance=Cesium.Cartesian3.distance(viewer.camera.positionWC,surface);
    const size=viewer.camera.frustum.getPixelDimensions(viewer.canvas.clientWidth,viewer.canvas.clientHeight,distance,1,new Cesium.Cartesian2());
    const visualDiameter=Math.max(size.x,size.y)*pixels;
    scale=Math.max(1,visualDiameter/diameter);lift=Math.max(0,visualDiameter*.6-1);
  }catch{/* Use natural ground placement if projection is unavailable. */}
  return {scale,lift,position:Cesium.Cartesian3.fromDegrees(lon,lat,height+.12+lift)};
}

// Pixel sizing retains the complete GLB in city views. Body-only material variants
// preserve the original wheels, glass, lighting and metallic parts.
export const VEHICLE_COLORS = Object.freeze([
  {id:'blue',name:'海洋藍',color:'#2e9de7'},
  {id:'red',name:'珊瑚紅',color:'#ef4e45'},
  {id:'white',name:'珍珠白',color:'#f6f8fa'},
]);
export function vehicleDisplayPolicy(mode, bodyColor = 'blue') {
  const motorcycle = mode === 'motorcycle';
  const color = VEHICLE_COLORS.some(item=>item.id===bodyColor) ? bodyColor : 'blue';
  return {
    uri: `/models/taiwan-${motorcycle ? 'scooter' : 'car'}-${color}.glb`,
    minimumPixelSize: motorcycle ? 56 : 64,
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
