const STORAGE_PREFIX = 'gev-tw-floating-panel:';
const MODES = new Set(['expanded', 'minimized', 'hidden']);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Shared, non-modal panels. Hiding/minimizing never invokes the work teardown. */
export function createFloatingPanelManager({ host = document.body } = {}) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const panels = new Map();
  const order = [];
  const existing = new Map();
  const enhanced = new Map();
  const base = host === doc.body ? 6600 : 50;
  let disposed = false;
  const read = id => {
    try { return JSON.parse(win.localStorage.getItem(STORAGE_PREFIX + id) || 'null'); }
    catch { return null; }
  };
  function stack() {
    // Reassign a bounded range rather than incrementing forever.
    order.forEach((element, index) => { element.style.setProperty('z-index',String(base + index),'important'); });
  }
  function front(element) {
    const index = order.indexOf(element);
    if (index >= 0) order.splice(index, 1);
    order.push(element); stack();
  }
  function unregister(element) {
    const index = order.indexOf(element);
    if (index >= 0) order.splice(index, 1);
    stack();
  }
  function registerExisting(element,options={}) {
    if (disposed) throw new Error('浮動視窗管理器已關閉');
    if(options.controls){
      const handle=element.querySelector('.key-setup-header,header,.tw-drawer-head');
      const closeButton=element.querySelector('[data-key-setup-close],[data-record-close],[data-act="close-drawer"]');
      if(!handle)return registerExisting(element);
      const oldParent=element.parentNode,oldNext=element.nextSibling;
      if(!host.contains(element))host.append(element);
      const panel=enhanceExisting(element,{id:element.id||options.id||'provider-settings',handle,closeButton});
      return ()=>{panel.destroy();if(oldParent && oldParent!==element.parentNode)oldParent.insertBefore(element,oldNext?.parentNode===oldParent?oldNext:null);};
    }
    if (existing.has(element)) return existing.get(element);
    const priorZ = element.style.zIndex,priorPriority=element.style.getPropertyPriority('z-index');
    const focus = () => front(element);
    element.addEventListener('pointerdown', focus, true);
    element.addEventListener('focusin', focus);
    order.push(element); stack();
    const release = () => {
      element.removeEventListener('pointerdown', focus, true);
      element.removeEventListener('focusin', focus);
      element.style.setProperty('z-index',priorZ,priorPriority);
      existing.delete(element); unregister(element);
    };
    existing.set(element, release);
    return release;
  }

  /** Preserve existing DOM/action handlers while sharing the same window stack. */
  const helpContent = new WeakMap();
  function collectHelp(element) {
    const name=element.querySelector('.tw-drawer-head h2,.tw-floating-header strong,[data-floating-existing-header] h2,[data-aircraft-label]')?.textContent || element.getAttribute('aria-label') || '視窗';
    let entry=helpContent.get(element);
    if(!entry || entry.name!==name){entry={name,sections:new Map()};helpContent.set(element,entry);}
    for(const detail of [...element.querySelectorAll('details')]) {
      const summary=detail.querySelector(':scope > summary');
      if(!summary || !/(功能|操作|操控|規劃與安全).*說明|操作方式|操作範例|提問範例|功能與回答範圍/.test(summary.textContent) || detail.querySelector('input,select,textarea,button'))continue;
      const section=doc.createElement('section'),heading=doc.createElement('h3');heading.textContent=summary.textContent;section.append(heading);
      for(const child of [...detail.children])if(child!==summary)section.append(child.cloneNode(true));
      for(const paragraph of [...section.querySelectorAll('p')]){
        const list=doc.createElement('ul');
        for(const text of paragraph.textContent.split(/。|；/).map(value=>value.trim()).filter(Boolean)){const item=doc.createElement('li');item.textContent=text;list.append(item);}
        paragraph.replaceWith(list);
      }
      entry.sections.set(heading.textContent,section.innerHTML);detail.remove();
    }
    return entry;
  }
  function showHelp(element) {
    const entry=collectHelp(element);
    const help=create({id:'panel-function-help',title:'功能及說明',width:480,height:540});
    help.body.replaceChildren();
    const heading=doc.createElement('h2');heading.textContent=entry.name;help.body.append(heading);
    const content=doc.createElement('div');content.className='tw-panel-help-content';
    content.innerHTML=[...entry.sections.values()].join('') || '<ul><li>拖曳標題列可移動視窗；拖曳右下角可調整大小。</li><li>按縮小／展開切換視窗大小，背景工作繼續執行。</li><li>按關閉結束此功能；可從工具列再次開啟。</li></ul>';
    help.body.append(content);help.restore().bringToFront();
    return help;
  }
  function enhanceExisting(element,{id,handle,closeButton,onClose=()=>{element.hidden=true;}}={}) {
    if(!element || !id || !handle)throw new Error('既有視窗需要 element、id 與標題列');
    if(enhanced.has(element))return enhanced.get(element);
    // Aircraft status rewrites its text node on every update. Keep controls in
    // an outer header so a live textContent refresh cannot remove the buttons.
    let wrappedHandle=null;
    if(handle.hasAttribute?.('data-aircraft-label')){
      wrappedHandle=handle;const wrapper=doc.createElement('header');
      handle.before(wrapper);wrapper.append(handle);handle=wrapper;
    }
    const releaseStack=registerExisting(element),saved=read(id);
    const originalStyle=element.getAttribute('style'),originalMode=element.dataset.panelMode;
    const originalHeader=handle.getAttribute('data-floating-existing-header');
    element.classList.add('tw-managed-existing');handle.dataset.floatingExistingHeader='';
    let mode=saved?.mode==='minimized'?'minimized':'expanded',drag=null,positioned=!!saved;
    let bounds={x:finite(saved?.x,102),y:finite(saved?.y,95),width:finite(saved?.width,380),height:finite(saved?.height,480)};
    const save=()=>{try{win.localStorage.setItem(STORAGE_PREFIX+id,JSON.stringify({...bounds,mode}));}catch{}};
    const set=(name,value)=>element.style.setProperty(name,value,'important');
    const clamp=()=>{
      if(element.hidden)return;
      const rect=element.getBoundingClientRect();
      if(!positioned){bounds={x:rect.left,y:rect.top,width:rect.width,height:rect.height};positioned=true;}
      bounds.width=Math.max(Math.min(240,win.innerWidth-16),Math.min(bounds.width,win.innerWidth-16));
      bounds.height=Math.max(Math.min(120,win.innerHeight-16),Math.min(bounds.height,win.innerHeight-16));
      const shownHeight=mode==='minimized'?Math.min(46,win.innerHeight-16):bounds.height;
      bounds.x=Math.max(8,Math.min(bounds.x,win.innerWidth-bounds.width-8));
      bounds.y=Math.max(8,Math.min(bounds.y,win.innerHeight-shownHeight-8));
      set('position','fixed');set('left',`${bounds.x}px`);set('top',`${bounds.y}px`);
      set('transform','none');
      set('right','auto');set('bottom','auto');set('width',`${bounds.width}px`);set('height',`${shownHeight}px`);
      set('max-width',`${Math.max(1,win.innerWidth-16)}px`);set('max-height',`${Math.max(1,win.innerHeight-16)}px`);
      element.dataset.panelMode=mode;save();
    };
    const toggle=doc.createElement('button');toggle.type='button';toggle.dataset.existingPanelAction='toggle';
    const helpButton=doc.createElement('button');helpButton.type='button';helpButton.dataset.existingPanelAction='help';helpButton.textContent='?';helpButton.title='功能及說明';helpButton.setAttribute('aria-label',helpButton.title);
    let madeClose=false;
    if(!closeButton){madeClose=true;closeButton=doc.createElement('button');closeButton.type='button';closeButton.textContent='×';closeButton.title='關閉視窗';closeButton.setAttribute('aria-label','關閉視窗');handle.append(closeButton);}
    closeButton.title='關閉視窗';closeButton.setAttribute('aria-label','關閉視窗');closeButton.classList.add('tw-managed-close');
    closeButton.before(toggle,helpButton);
    const render=()=>{toggle.textContent=mode==='minimized'?'□':'−';toggle.title=mode==='minimized'?'展開視窗':'縮小視窗（工作繼續）';toggle.setAttribute('aria-label',toggle.title);element.dataset.panelMode=mode;collectHelp(element);clamp();};
    const end=()=>{if(!drag)return;const pointer=drag.id;drag=null;if(handle.hasPointerCapture?.(pointer))handle.releasePointerCapture(pointer);save();};
    const down=event=>{
      if(event.button!==0 || event.target.closest('button,input,select,textarea,a'))return;
      clamp();front(element);drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:bounds.x,top:bounds.y};
      handle.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
    };
    const move=event=>{if(!drag || event.pointerId!==drag.id)return;bounds.x=drag.left+event.clientX-drag.x;bounds.y=drag.top+event.clientY-drag.y;clamp();};
    const click=event=>{const button=event.target.closest('[data-existing-panel-action]');if(!button)return;event.stopPropagation();if(button===toggle){if(mode==='minimized')api.restore();else api.minimize();}else if(button===helpButton)showHelp(element);};
    const closeClick=()=>{end();Promise.resolve(onClose()).catch(()=>{});};
    const api={element,get mode(){return mode;},get state(){return {...bounds,mode};},
      show(){element.hidden=false;render();front(element);return api;},hide(){end();element.hidden=true;return api;},
      minimize(){end();mode='minimized';render();front(element);return api;},restore(){end();mode='expanded';element.hidden=false;render();front(element);return api;},
      bringToFront(){front(element);return api;},resize(width,height){bounds.width=finite(width,bounds.width);bounds.height=finite(height,bounds.height);clamp();return api;},
      destroy(){end();save();visibility?.disconnect();resizeObserver?.disconnect();releaseStack();
        handle.removeEventListener('pointerdown',down,true);handle.removeEventListener('pointermove',move);handle.removeEventListener('click',click);
        for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(name,end);
        win.removeEventListener('resize',clamp);win.removeEventListener('blur',end);if(madeClose){closeButton.removeEventListener('click',closeClick);closeButton.remove();}
        toggle.remove();helpButton.remove();element.classList.remove('tw-managed-existing');
        if(originalStyle===null)element.removeAttribute('style');else element.setAttribute('style',originalStyle);
        if(originalMode===undefined)delete element.dataset.panelMode;else element.dataset.panelMode=originalMode;
        if(originalHeader===null)handle.removeAttribute('data-floating-existing-header');else handle.setAttribute('data-floating-existing-header',originalHeader);
        if(wrappedHandle){handle.before(wrappedHandle);handle.remove();}
        enhanced.delete(element);
      },
    };
    const visibility=win.MutationObserver?new win.MutationObserver(()=>{if(!element.hidden)render();}):null;
    visibility?.observe(element,{attributes:true,attributeFilter:['hidden']});
    const resizeObserver=win.ResizeObserver?new win.ResizeObserver(()=>{if(element.hidden||mode==='minimized')return;const rect=element.getBoundingClientRect();if(Math.abs(rect.width-bounds.width)>.5 || Math.abs(rect.height-bounds.height)>.5){bounds.width=rect.width;bounds.height=rect.height;clamp();}}):null;
    resizeObserver?.observe(element);
    handle.addEventListener('pointerdown',down,true);handle.addEventListener('pointermove',move);handle.addEventListener('click',click);
    for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,end);
    win.addEventListener('resize',clamp);win.addEventListener('blur',end);if(madeClose)closeButton.addEventListener('click',closeClick);
    enhanced.set(element,api);render();return api;
  }

  function create({ id, title, width = 400, height = 500, onClose = () => {}, minimizedContent } = {}) {
    if (disposed) throw new Error('浮動視窗管理器已關閉');
    if (!id) throw new Error('浮動視窗需要固定識別碼');
    if (panels.has(id)) return panels.get(id);
    const saved = read(id);
    const state = {
      x: finite(saved?.x, Math.max(8, win.innerWidth - width - 24)),
      y: finite(saved?.y, 86), width: finite(saved?.width, width), height: finite(saved?.height, height),
      mode: MODES.has(saved?.mode) ? saved.mode : 'hidden',
      visibleMode: saved?.visibleMode === 'minimized' ? 'minimized' : 'expanded',
    };
    let destroyed = false, drag = null;
    const element = doc.createElement('section');
    element.className = 'tw-floating-panel';
    element.dataset.floatingPanel = id;
    element.setAttribute('aria-label', title || id);
    const header = doc.createElement('header'); header.className = 'tw-floating-header';
    const heading = doc.createElement('strong'); heading.textContent = title || id;
    const summary = doc.createElement('span'); summary.className = 'tw-floating-summary';
    const actions = doc.createElement('div'); actions.className = 'tw-floating-window-actions';
    const buttons = [ ['toggle', '−', '縮小視窗（工作繼續）'], ['help', '?', '功能及說明'], ['close', '×', '關閉視窗並停止工作'] ];
    for (const [action, text, label] of buttons) {
      const button = doc.createElement('button'); button.type = 'button';
      button.dataset.panelAction = action; button.textContent = text; button.title = label;
      button.setAttribute('aria-label', label); actions.append(button);
    }
    header.append(heading, summary, actions);
    const mini = doc.createElement('div'); mini.className = 'tw-floating-mini-controls';
    if (typeof minimizedContent === 'string') mini.innerHTML = minimizedContent;
    else if (minimizedContent) mini.append(minimizedContent);
    const body = doc.createElement('div'); body.className = 'tw-floating-body';
    element.append(header, mini, body); host.append(element);
    order.push(element); stack();
    function save() {
      if (destroyed) return;
      try { win.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state)); } catch { /* Storage can be disabled. */ }
    }
    function clamp() {
      if (destroyed) return;
      const viewportWidth = Math.max(1, win.innerWidth), viewportHeight = Math.max(1, win.innerHeight);
      const margin = viewportWidth > 32 && viewportHeight > 32 ? 8 : 0;
      const maxWidth = Math.max(1, viewportWidth - margin * 2), maxHeight = Math.max(1, viewportHeight - margin * 2);
      state.width = Math.max(Math.min(280, maxWidth), Math.min(state.width, maxWidth));
      state.height = Math.max(Math.min(140, maxHeight), Math.min(state.height, maxHeight));
      // Expanded dimensions are preserved while the panel is a compact strip.
      const minimized = state.mode === 'minimized';
      const shownHeight = minimized ? Math.min(mini.childNodes.length ? 78 : 42, maxHeight) : state.height;
      state.x = Math.max(margin, Math.min(state.x, viewportWidth - state.width - margin));
      state.y = Math.max(margin, Math.min(state.y, viewportHeight - shownHeight - margin));
      element.style.left = `${state.x}px`; element.style.top = `${state.y}px`;
      element.style.width = `${state.width}px`; element.style.height = `${shownHeight}px`;
      element.style.maxWidth = `${maxWidth}px`; element.style.maxHeight = `${maxHeight}px`;
      element.style.minWidth = `${Math.min(280, maxWidth)}px`;
      element.style.minHeight = `${Math.min(minimized ? shownHeight : 140, maxHeight)}px`;
      save();
    }
    function render() {
      element.hidden = state.mode === 'hidden';
      element.dataset.panelMode = state.mode;
      const toggle=header.querySelector('[data-panel-action="toggle"]');
      toggle.textContent=state.mode==='minimized'?'□':'−';
      toggle.title=state.mode==='minimized'?'展開視窗':'縮小視窗（工作繼續）';toggle.setAttribute('aria-label',toggle.title);
      collectHelp(element);
      clamp();
    }
    function endDrag() {
      if (!drag) return;
      const pointerId = drag.id; drag = null;
      if (header.hasPointerCapture?.(pointerId)) header.releasePointerCapture(pointerId);
      header.classList.remove('tw-floating-dragging'); save();
    }
    function down(event) {
      if (event.button !== 0 || event.target.closest('button,input,select,textarea,a')) return;
      front(element);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: state.x, top: state.y };
      header.setPointerCapture(event.pointerId); header.classList.add('tw-floating-dragging'); event.preventDefault();
    }
    function move(event) {
      if (!drag || event.pointerId !== drag.id) return;
      state.x = drag.left + event.clientX - drag.x; state.y = drag.top + event.clientY - drag.y; clamp();
    }
    const focus = () => front(element);
    const api = {
      element, body, minimizedBody: mini,
      get mode() { return state.mode; },
      get state() { return { ...state }; },
      show() {
        if (destroyed) return api;
        state.mode = state.mode === 'hidden' ? state.visibleMode : state.mode;
        render(); front(element); return api;
      },
      hide() {
        if (destroyed) return api;
        if (state.mode !== 'hidden') state.visibleMode = state.mode;
        endDrag(); state.mode = 'hidden'; render(); return api;
      },
      minimize() {
        if (destroyed) return api;
        endDrag(); state.mode = state.visibleMode = 'minimized'; render(); front(element); return api;
      },
      restore() {
        if (destroyed) return api;
        endDrag(); state.mode = state.visibleMode = 'expanded'; render(); front(element); return api;
      },
      bringToFront() { if (!destroyed) front(element); return api; },
      resize(newWidth, newHeight) {
        if (destroyed) return api;
        if (typeof newWidth === 'object') { newHeight = newWidth.height; newWidth = newWidth.width; }
        state.width = finite(newWidth, state.width); state.height = finite(newHeight, state.height); clamp(); return api;
      },
      setSummary(text) { summary.textContent = String(text ?? ''); },
      close() {
        if (destroyed) return;
        api.hide();
        // Closing releases the feature resources; the UI instance remains reusable.
        return onClose();
      },
      destroy() {
        if (destroyed) return;
        endDrag(); save(); destroyed = true; observer?.disconnect(); helpObserver?.disconnect();
        header.removeEventListener('pointerdown', down); header.removeEventListener('pointermove', move);
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) header.removeEventListener(name, endDrag);
        element.removeEventListener('pointerdown', focus, true); element.removeEventListener('focusin', focus);
        element.removeEventListener('click', click); win.removeEventListener('blur', endDrag);
        unregister(element); panels.delete(id); element.remove();
        return onClose();
      },
    };
    function click(event) {
      const button = event.target.closest('[data-panel-action]');
      if (!button || !actions.contains(button)) return;
      const action = button.dataset.panelAction;
      if (action === 'help') {
        showHelp(element);
      } else if (action === 'toggle') {
        if(state.mode==='minimized')api.restore();else api.minimize();
      } else if (action === 'close') {
        try { Promise.resolve(api.close()).catch(error => element.dispatchEvent(new win.CustomEvent('panelerror', { detail: error }))); }
        catch (error) { element.dispatchEvent(new win.CustomEvent('panelerror', { detail: error })); }
      } else api[action]?.();
    }
    const helpObserver=win.MutationObserver?new win.MutationObserver(()=>collectHelp(element)):null;
    helpObserver?.observe(body,{childList:true});
    const observer = win.ResizeObserver ? new win.ResizeObserver(() => {
      if (destroyed || element.hidden || state.mode === 'minimized') return;
      const rect = element.getBoundingClientRect();
      if (Math.abs(rect.width - state.width) > 0.5 || Math.abs(rect.height - state.height) > 0.5) {
        state.width = rect.width; state.height = rect.height; clamp();
      }
    }) : null;
    observer?.observe(element);
    header.addEventListener('pointerdown', down); header.addEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) header.addEventListener(name, endDrag);
    element.addEventListener('pointerdown', focus, true); element.addEventListener('focusin', focus);
    element.addEventListener('click', click); win.addEventListener('blur', endDrag);
    panels.set(id, api); render(); return api;
  }
  const viewport = () => { for (const panel of panels.values()) panel.resize(panel.state.width, panel.state.height); };
  win.addEventListener('resize', viewport);
  return {
    create, registerExisting, enhanceExisting, showHelp,
    get(id) { return panels.get(id); },
    destroy() {
      if (disposed) return; disposed = true; win.removeEventListener('resize', viewport);
      for (const panel of [...panels.values()]) {
        try { Promise.resolve(panel.destroy()).catch(() => {}); } catch { /* Continue releasing the other panels. */ }
      }
      for (const release of [...existing.values()]) release();
      for (const panel of [...enhanced.values()]) panel.destroy();
    },
  };
}
