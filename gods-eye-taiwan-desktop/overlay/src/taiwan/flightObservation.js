/** UI entry points for the upstream aircraft tracker and cockpit controller. */
export function createFlightObservation({ root, dataManager, styleManager, onStatus = () => {} }) {
  const card = document.createElement('section');
  card.className = 'tw-aircraft-card';
  card.hidden = true;
  card.setAttribute('aria-label', '飛機觀察視角');
  card.innerHTML = '<p data-aircraft-label></p><p data-aircraft-status role="status"></p><dl class="tw-flight-info" data-aircraft-info></dl><div class="tw-actions"><button data-aircraft-view="first">第一人稱</button><button data-aircraft-view="third">第三人稱</button><button data-aircraft-view="stop">停止觀察</button></div>';
  root.appendChild(card);
  let pending = null, disposed = false, ownsContext = false, restoreMode = null;
  const module = () => dataManager?.layers.get('flights')?.module;
  const cockpitActive = () => styleManager?.getCockpitState?.()?.active === true;
  const ownCockpit = () => {const state=styleManager?.getCockpitState?.();return state?.active && state.subject?.layerId==='flights';};
  function update() {
    if (disposed) return;
    const subject = module()?.getTrackedSubject?.();
    if (!dataManager?.isEnabled('flights') || !subject) {
      if(!dataManager?.isEnabled('flights') && ownCockpit())void styleManager.controlCockpit('exit');
      if (!pending) { card.hidden = true; }
      return;
    }
    card.hidden = false;
    card.querySelector('[data-aircraft-label]').textContent = `已選取飛機：${subject.label || subject.id}`;
    const info = module()?.getTrackedInfo?.();
    card.querySelector('[data-aircraft-status]').textContent = pending ? '正在切換觀察視角…' : `${cockpitActive() ? '第一人稱：沿飛機航向觀察' : '第三人稱：跟隨飛機，可拖曳旋轉／縮放'}${info?.stale ? '；位置為最後觀測資料推估' : ''}`;
    const missing='來源未提供',num=(value,unit,digits=0)=>Number.isFinite(value)?`${value.toFixed(digits)} ${unit}`:missing;
    const fields=[['航空公司',info?.airline || missing],['機型',info?.typeName || info?.typeCode || missing],['註冊編號',info?.registration || missing],['起訖機場',info?.origin || info?.destination ? `${info.origin || missing} → ${info.destination || missing}` : missing],['飛行高度',num(info?.altitudeM,'公尺')],['速度',num(Number.isFinite(info?.velocityMps)?info.velocityMps*3.6:null,'公里／時')],['航向',num(info?.track,'度')],['位置',Number.isFinite(info?.latitude)&&Number.isFinite(info?.longitude)?`${info.latitude.toFixed(5)}, ${info.longitude.toFixed(5)}`:missing],['狀態',!info?missing:info.onGround?'地面':info.stale?'最後資料推估':'來源回報飛行中']];
    const details=card.querySelector('[data-aircraft-info]');details.replaceChildren();
    for(const [name,value] of fields){const term=document.createElement('dt'),description=document.createElement('dd');term.textContent=name;description.textContent=value;details.append(term,description);}
    for (const button of card.querySelectorAll('[data-aircraft-view]')) {
      button.disabled = !!pending && button.dataset.aircraftView !== 'stop';
      button.setAttribute('aria-pressed', String(button.dataset.aircraftView === (cockpitActive() ? 'first' : 'third')));
    }
  }
  async function setView(mode) {
    if (mode === 'stop') return stop();
    if (!['first', 'third'].includes(mode)) throw new Error('不支援的飛機觀察視角');
    const target = module()?.getTrackedSubject?.();
    if (!target || !dataManager?.isEnabled('flights')) throw new Error('請先點選一架已載入的飛機');
    pending?.abort();
    const controller = new AbortController(); pending = controller; update();
    const priorMode=styleManager?.getContextModeState?.()?.mode || null;
    let contextChanged=false;
    try {
      if (mode === 'first') {
        const context = styleManager?.getContextModeState?.();
        if (context?.mode !== 'flights' || !context.active || context.changing) {
          const result = await styleManager?.setContextMode?.('flights', { signal: controller.signal, claimVisualAuthority: false });
          contextChanged=result?.ok===true && priorMode!=='flights';
          if (!result?.ok) throw new Error('飛機觀察模式尚未就緒，請稍後再試');
        }
        controller.signal.throwIfAborted();
        if (module()?.getTrackedSubject?.()?.id !== target.id) throw new Error('選取飛機已變更，請重新選擇視角');
        const result = await styleManager.controlCockpit('enter', { targetLayer: 'flights', selectedTarget: target });
        if (!result?.ok) throw new Error('無法進入此飛機的第一人稱視角，請稍後再試');
        if(contextChanged){ownsContext=true;restoreMode=priorMode;}
      } else {
        if (cockpitActive()) await styleManager.controlCockpit('exit');
        controller.signal.throwIfAborted();
        // Force the existing tracker to reacquire its normal camera frame.
        module()?.stopTracking?.({ origin: 'user' });
        if (!module()?.trackById?.(target.id, { origin: 'user' })) throw new Error('此飛機已離開資料範圍');
        module()?.refocusTrackedById?.(target.id, { origin: 'user' });
      }
      controller.signal.throwIfAborted();
      return { ok: true, id: target.id, view: mode };
    } catch(error){
      if(contextChanged && styleManager?.getContextModeState?.()?.mode==='flights' && !cockpitActive())await styleManager.setContextMode(priorMode,{claimVisualAuthority:false});
      throw error;
    } finally {
      if (pending === controller) pending = null;
      update();
    }
  }
  async function stop() {
    pending?.abort(); pending = null;
    if (ownCockpit()) styleManager?.controlCockpit?.('exit');
    module()?.stopTracking?.({ origin: 'user' });
    card.hidden = true;
    const restore=ownsContext && styleManager?.getContextModeState?.()?.mode==='flights',mode=restoreMode;ownsContext=false;restoreMode=null;
    if(restore)await styleManager.setContextMode(mode,{claimVisualAuthority:false});
    return { ok: true, message: '已停止飛機觀察' };
  }
  const click = event => {
    const button = event.target.closest('[data-aircraft-view]');
    if (button) void setView(button.dataset.aircraftView).catch(error => onStatus(error.name === 'AbortError' ? '已停止切換視角' : error.message));
  };
  const selection = event => { if (event.detail?.layerId === 'flights') update(); };
  card.addEventListener('click', click);
  window.addEventListener('gev:awareness-subject-selected', selection);
  window.addEventListener('gev:awareness-subject-cleared', selection);
  window.addEventListener('gev:cockpit-mode-changed', update);
  const timer = setInterval(update, 500);
  return { stop, setView, destroy() {
    void stop().catch(()=>{}); disposed = true; clearInterval(timer);
    window.removeEventListener('gev:awareness-subject-selected', selection);
    window.removeEventListener('gev:awareness-subject-cleared', selection);
    window.removeEventListener('gev:cockpit-mode-changed', update);
    card.removeEventListener('click', click); card.remove();
  } };
}
