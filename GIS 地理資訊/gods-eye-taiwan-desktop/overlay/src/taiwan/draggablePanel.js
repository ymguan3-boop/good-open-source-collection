// Panels stay inside the viewport and release capture on cancellation/disposal.
export function makePanelDraggable(panel, handle) {
  let drag=null, moved=false;
  const clamp=()=>{
    if(!moved || panel.hidden)return;
    const parent=panel.offsetParent?.getBoundingClientRect() || {left:0,top:0};
    const rect=panel.getBoundingClientRect();
    panel.style.left=`${Math.max(0,Math.min(innerWidth-rect.width,rect.left))-parent.left}px`;
    panel.style.top=`${Math.max(0,Math.min(innerHeight-Math.min(rect.height,innerHeight),rect.top))-parent.top}px`;
  };
  const end=()=>{if(!drag)return;const id=drag.id;drag=null;if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);handle.classList.remove('tw-dragging');};
  const down=e=>{
    if(e.button!==0 || e.target.closest('button,input,select,textarea,a'))return;
    const rect=panel.getBoundingClientRect(),parent=panel.offsetParent?.getBoundingClientRect() || {left:0,top:0};
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left-parent.left,top:rect.top-parent.top};moved=true;
    panel.style.right='auto';panel.style.bottom='auto';panel.style.left=`${drag.left}px`;panel.style.top=`${drag.top}px`;
    handle.setPointerCapture(e.pointerId);handle.classList.add('tw-dragging');e.preventDefault();
  };
  const move=e=>{if(!drag || e.pointerId!==drag.id)return;panel.style.left=`${drag.left+e.clientX-drag.x}px`;panel.style.top=`${drag.top+e.clientY-drag.y}px`;clamp();};
  handle.classList.add('tw-drag-handle');handle.title='拖曳此標題可移動視窗';
  handle.addEventListener('pointerdown',down);handle.addEventListener('pointermove',move);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,end);
  window.addEventListener('resize',clamp);window.addEventListener('blur',end);
  return ()=>{end();handle.removeEventListener('pointerdown',down);handle.removeEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(name,end);window.removeEventListener('resize',clamp);window.removeEventListener('blur',end);};
}
