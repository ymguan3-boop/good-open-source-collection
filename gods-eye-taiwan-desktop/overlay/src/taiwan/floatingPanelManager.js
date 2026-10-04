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
  const base = host === doc.body ? 6600 : 50;
  let disposed = false;
  const read = id => {
    try { return JSON.parse(win.localStorage.getItem(STORAGE_PREFIX + id) || 'null'); }
    catch { return null; }
  };
  function stack() {
    // Reassign a bounded range rather than incrementing forever.
    order.forEach((element, index) => { element.style.zIndex = String(base + index); });
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
  function registerExisting(element) {
    if (disposed) throw new Error('浮動視窗管理器已關閉');
    if (existing.has(element)) return existing.get(element);
    const priorZ = element.style.zIndex;
    const focus = () => front(element);
    element.addEventListener('pointerdown', focus, true);
    element.addEventListener('focusin', focus);
    order.push(element); stack();
    const release = () => {
      element.removeEventListener('pointerdown', focus, true);
      element.removeEventListener('focusin', focus);
      element.style.zIndex = priorZ;
      existing.delete(element); unregister(element);
    };
    existing.set(element, release);
    return release;
  }

  function create({ id, title, width = 400, height = 500, onClose = () => {}, minimizedContent, onHelp } = {}) {
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
    const buttons = [ ['minimize', '─', '縮小視窗（工作繼續）'], ['restore', '□', '展開視窗'], ['hide', '◉', '隱藏視窗（工作繼續）'], ['close', '×', '關閉視窗並停止工作'] ];
    if (onHelp) buttons.splice(buttons.length - 1, 0, ['help', '?', '功能說明']);
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
      header.querySelector('[data-panel-action="minimize"]').hidden = state.mode === 'minimized';
      header.querySelector('[data-panel-action="restore"]').hidden = state.mode !== 'minimized';
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
        endDrag(); save(); destroyed = true; observer?.disconnect();
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
        try { Promise.resolve(onHelp?.()).catch(error => element.dispatchEvent(new win.CustomEvent('panelerror', { detail:error }))); }
        catch (error) { element.dispatchEvent(new win.CustomEvent('panelerror', { detail:error })); }
      } else if (action === 'close') {
        try { Promise.resolve(api.close()).catch(error => element.dispatchEvent(new win.CustomEvent('panelerror', { detail: error }))); }
        catch (error) { element.dispatchEvent(new win.CustomEvent('panelerror', { detail: error })); }
      } else api[action]?.();
    }
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
    create, registerExisting,
    get(id) { return panels.get(id); },
    destroy() {
      if (disposed) return; disposed = true; win.removeEventListener('resize', viewport);
      for (const panel of [...panels.values()]) {
        try { Promise.resolve(panel.destroy()).catch(() => {}); } catch { /* Continue releasing the other panels. */ }
      }
      for (const release of [...existing.values()]) release();
    },
  };
}
