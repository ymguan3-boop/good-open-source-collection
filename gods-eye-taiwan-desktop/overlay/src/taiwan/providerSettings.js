import { browserAi } from './browserAi.js';

const SECURE_SERVICES = [
  { id:'google-maps', key:'google', title:'GOOGLE MAPS' },
  { id:'cesium-ion', key:'cesium', title:'CESIUM ION' },
  { id:'tomtom', key:'tomtom', title:'TOMTOM', url:'https://my.tomtom.com/' },
  { id:'openrouter', key:'openrouter', title:'OPENROUTER', url:'https://openrouter.ai/settings/keys', description:'AI 查核主題建議；免費模型清單會依目前可用模型更新。' },
  { id:'gemini-live', key:'gemini', title:'GEMINI LIVE', url:'https://aistudio.google.com/apikey', description:'即時語音助理；使用 Google AI Studio API Key。' },
  { id:'tdx', key:'TDX_CLIENT_ID', title:'TDX 運輸資料服務', url:'https://tdx.transportdata.tw/', description:'公共運輸旅程規劃。需 Client ID 與 Client Secret；權限與額度依 TDX 帳號方案。' },
];

export function integrateProviderSettings({manager,onRestartRequired}={}) {
  const dialog = document.getElementById('key-setup');
  const chip = document.getElementById('key-setup-chip');
  const rows = dialog?.querySelector('[data-key-setup-rows]');
  if (!dialog || !chip || !rows) return { open:async () => false, dispose() {} };
  const releasePanel=manager?.registerExisting(dialog,{controls:true});

  const footer = dialog.querySelector('.key-setup-footer');
  const applyButton = dialog.querySelector('[data-key-setup-apply]');
  const extra = document.createElement('div');
  extra.className = 'tw-provider-secure-actions';
  extra.innerHTML = `<span data-tw-provider-status role="status" aria-live="polite">瀏覽器版金鑰以 Windows 使用者加密保存，重新開啟後可沿用。</span>`;
  footer?.before(extra);
  const status = extra.querySelector('[data-tw-provider-status]');
  let modelRefreshPending = false;
  function makeRow(service) {
    const row = document.createElement('section');
    row.className = 'key-setup-row tw-provider-row';
    row.dataset.keyId = service.id;
    row.dataset.set = 'false';
    row.dataset.twService = service.key;
    const head = document.createElement('div');
    head.className = 'key-setup-row-head';
    const led = document.createElement('span');
    led.className = 'key-setup-led';
    led.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = service.title;
    const link = document.createElement('a');
    link.className = 'key-setup-get';
    link.href = service.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '申請金鑰 ↗';
    head.append(led, title, link);
    const description = document.createElement('p');
    description.className = 'key-setup-unlocks';
    description.textContent = service.description;
    const fields = document.createElement('div');
    fields.className = 'key-setup-fields';
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.twSecureKey = service.key;
    input.setAttribute('aria-label', `${service.title} API Key`);
    input.placeholder = '貼上後加密保存；留白沿用已存金鑰';
    input.disabled = false;
    fields.append(input);
    if(service.id==='tdx'){
      input.setAttribute('aria-label','TDX Client ID');input.placeholder='TDX Client ID（留白沿用）';
      const secret=document.createElement('input');secret.type='password';secret.autocomplete='off';secret.dataset.twSecureKey='TDX_CLIENT_SECRET';secret.placeholder='TDX Client Secret（留白沿用）';secret.setAttribute('aria-label','TDX Client Secret');
      const result=document.createElement('p');result.dataset.tdxStatus='';result.setAttribute('role','status');result.textContent='使用頁面下方「儲存金鑰」保存；規劃時會自動驗證授權與服務權限。';
      fields.append(secret,result);
      const fare=document.createElement('section');fare.className='tw-fare-status';fare.innerHTML='<strong>票價資料</strong><div data-fare-data-status role="status">尚未查詢</div><label>重新驗證間隔（小時）<input type="number" data-fare-ttl min="0.017" max="720" step="1" value="24"></label><button type="button" data-fare-refresh>更新最新票價</button>';
      fields.append(fare);
      const display=data=>{const labels={TRA:'臺鐵',HSR:'高鐵',BUS:'公車',METRO:'捷運',LRT:'輕軌',BIKE:'公共自行車'};fare.querySelector('[data-fare-data-status]').textContent=Object.entries(labels).map(([mode,name])=>`${name}：${data.modes?.[mode]?.records?'部分（已核實 '+data.modes[mode].records+' 筆）':'無資料'}${data.modes?.[mode]?.stale?'／待重新驗證':''}`).join('；')+'。最後更新：'+(data.lastUpdated?new Date(data.lastUpdated).toLocaleString('zh-TW'):'尚未取得')+(data.warning?'；'+data.warning:'')+(data.quarantine?.length?'；需要重新驗證票價來源，異常價格未覆蓋舊資料。':'')+((data.report||[]).some(r=>r.status==='kept-last-verified')?'；官方來源未通過此次驗證，保留最近成功驗證的票價。':'');fare.querySelector('[data-fare-ttl]').value=String((data.ttlMs||86400000)/3600000);};
      void browserAi('/tdx',{method:'POST',data:{action:'fare-status'}}).then(display).catch(()=>{fare.querySelector('[data-fare-data-status]').textContent='票價資料狀態暫不可用';});
      fare.querySelector('[data-fare-refresh]').addEventListener('click',async()=>{const button=fare.querySelector('[data-fare-refresh]');button.disabled=true;fare.querySelector('[data-fare-data-status]').textContent='正在重新驗證已使用的官方票價來源…';try{await browserAi('/tdx',{method:'POST',data:{action:'fare-config',ttlMs:Number(fare.querySelector('[data-fare-ttl]').value)*3600000}});display(await browserAi('/tdx',{method:'POST',data:{action:'fare-update'}}));}catch(e){fare.querySelector('[data-fare-data-status]').textContent=e.message+'；最近成功驗證資料保留。';}finally{button.disabled=false;}});
    }
    if (service.key === 'openrouter') {
      const select = document.createElement('select');
      select.dataset.twFreeModel = '';
      select.setAttribute('aria-label', 'OpenRouter 免費模型');
      fields.append(select);
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.dataset.twRefreshModels = '';
      refresh.textContent = '更新免費模型';
      fields.append(refresh);
    }
    row.append(head, description, fields);
    return row;
  }

  function ensureRows() {
    if (!rows.isConnected) return;
    for (const input of rows.querySelectorAll('input[data-env-var]')) {
      input.dataset.twSecureKey = input.dataset.envVar;
      input.removeAttribute('data-env-var');
      input.disabled = false;
      input.placeholder = '貼上後加密保存；留白沿用已存金鑰';
    }
    for (const service of SECURE_SERVICES) {
      const row = rows.querySelector(`[data-key-id="${service.id}"]`);
      if (!row) {
        if (service.url) rows.append(makeRow(service));
        continue;
      }
      if (service.url) row.querySelector('.key-setup-get')?.setAttribute('href', service.url);
      if (!['openrouter','gemini'].includes(service.key) || row.dataset.twService === service.key) continue;
      const input = row.querySelector('input[data-tw-secure-key]');
      if (!input) continue;
      input.placeholder = '貼上後加密保存';
      row.dataset.twService = service.key;
      row.querySelector('[data-key-setup-remove]')?.remove();
      if (service.key === 'openrouter' && !row.querySelector('[data-tw-free-model]')) {
        const controls = makeRow(service).querySelector('.key-setup-fields');
        row.querySelector('.key-setup-fields')?.append(...[...controls.children].filter(element => element.tagName !== 'INPUT'));
      }
    }
    for (const row of rows.querySelectorAll('.key-setup-row')) {
      row.querySelector('[data-key-setup-remove]')?.remove();
      if (!row.querySelector('[data-tw-remove-key]')) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.twRemoveKey = ''; remove.textContent = '清除已存金鑰';
        row.append(remove);
      }
    }
    populateModels();
  }

  function populateModels() {
    const select = rows.querySelector('[data-tw-free-model]');
    if (!select) return;
    let models = [];
    try { models = JSON.parse(localStorage.getItem('gev.tw.freeModels') || '[]'); } catch {}
    const selected = localStorage.getItem('gev.tw.aiModel') || '';
    select.replaceChildren(...models.map(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name || model.id;
      return option;
    }));
    if (!models.length) {
      const option = document.createElement('option');
      option.value = '';
      option.disabled = true;
      option.textContent = '請更新免費模型清單';
      select.append(option);
    } else if (models.some(model => model.id === selected)) select.value = selected;
  }

  async function refreshModels() {
    if (modelRefreshPending) return;
    modelRefreshPending = true;
    status.textContent = '正在更新 OpenRouter 免費模型…';
    try {
      const available = await browserAi('/models');
      const models = [{id:'openrouter/free',name:'自動選擇免費模型'},...available.filter(model => model.id !== 'openrouter/free')];
      localStorage.setItem('gev.tw.freeModels', JSON.stringify(models));
      if (!models.some(model => model.id === localStorage.getItem('gev.tw.aiModel')) && models[0]) {
        localStorage.setItem('gev.tw.aiModel', models[0].id);
      }
      window.dispatchEvent(new Event('gev-tw:model-changed'));
      populateModels();
      status.textContent = `已更新 ${models.length} 個免費模型`;
    } catch (error) { status.textContent = `模型更新失敗：${error?.message || error}`; }
    finally { modelRefreshPending = false; }
  }

  async function updateKeyIndicators() {
      try {
        const available = await browserAi('/keys');
        if (available.warning) status.textContent = available.warning;
        for (const row of rows.querySelectorAll('.key-setup-row')) {
          const inputs = [...row.querySelectorAll('input[data-tw-secure-key]')];
          row.dataset.set = String(inputs.length > 0 && inputs.every(input => available[input.dataset.twSecureKey] || available.env?.[input.dataset.twSecureKey]));
        }
      } catch { /* Service availability is reported on save. */ }
  }

  async function saveSecureKeys() {
    const inputs = [...rows.querySelectorAll('input[data-tw-secure-key]')].filter(input => input.value.trim());
    if (!inputs.length) return false;
    status.textContent = '正在安全儲存…';
    let keysSaved=false;
    try {
      for (const input of inputs) {
        await browserAi('/keys', { method:'POST', data:{ name:input.dataset.twSecureKey, value:input.value.trim() } });
        input.value = '';
      }
      keysSaved=true;
      const model = rows.querySelector('[data-tw-free-model]')?.value;
      if (model) localStorage.setItem('gev.tw.aiModel', model);
      window.dispatchEvent(new Event('gev-tw:model-changed'));
      await updateKeyIndicators();
      const names=inputs.map(input=>input.dataset.twSecureKey);
      window.dispatchEvent(new CustomEvent('gev-tw:keys-changed',{detail:{names}}));
      status.textContent = '已加密儲存，下次開啟可沿用；AI 與地圖服務立即套用；已啟用的語音助理會自動重新連線。';
      await onRestartRequired?.(names);
      return true;
    } catch (error) { status.textContent = `${keysSaved?'金鑰已儲存，但套用或重新啟動失敗':'儲存失敗'}：${error?.message || error}`; return false; }
  }

  const onApply = async event => {
    ensureRows();
    if (![...rows.querySelectorAll('input[data-tw-secure-key]')].some(input => input.value.trim())) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await saveSecureKeys();
  };
  applyButton?.addEventListener('click', onApply, true);
  rows.addEventListener('click', event => {
    const remove = event.target.closest('[data-tw-remove-key]');
    if (remove) {
      void (async () => { try {
        const names=[...remove.closest('.key-setup-row').querySelectorAll('[data-tw-secure-key]')].map(input=>input.dataset.twSecureKey);
        for (const name of names) await browserAi('/keys',{method:'DELETE',data:{name}});
        await updateKeyIndicators(); window.dispatchEvent(new CustomEvent('gev-tw:keys-changed',{detail:{names}})); status.textContent = '已清除該服務金鑰，正在套用設定。';
        await onRestartRequired?.(names);
      } catch (error) { status.textContent = `清除失敗：${error.message}`; } })();
    }
    if (event.target.closest('[data-tw-refresh-models]')) void refreshModels();
  });
  rows.addEventListener('change', event => {
    if (event.target.matches('[data-tw-free-model]') && event.target.value) {
      localStorage.setItem('gev.tw.aiModel', event.target.value);
      window.dispatchEvent(new Event('gev-tw:model-changed'));
    }
  });
  const rowObserver = new MutationObserver(ensureRows);
  rowObserver.observe(rows, { childList:true });
  const syncVisibility = () => {
    const visible = !dialog.hidden && dialog.classList.contains('visible');
    document.body.classList.toggle('gev-tw-provider-settings-open', visible);
    if (visible) { ensureRows(); void updateKeyIndicators(); void refreshModels(); }
  };
  const dialogObserver = new MutationObserver(syncVisibility);
  dialogObserver.observe(dialog, { attributes:true, attributeFilter:['hidden','class'] });
  ensureRows();
  const description = dialog.querySelector('#key-setup-description');
  if (description) description.textContent = '所有服務均可在下列欄位輸入；金鑰以 Windows 使用者加密保存。留白保留原金鑰，AI 金鑰不回傳至瀏覽器或 JSON 專案。';
  syncVisibility();

  return {
    async open() {
      for (let i = 0; i < 30 && !rows.querySelector('[data-key-id="google-maps"]') && dialog.isConnected; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!dialog.isConnected || !rows.querySelector('[data-key-id="google-maps"]')) return false;
      if (dialog.hidden || !dialog.classList.contains('visible')) chip.click();
      return true;
    },
    dispose() {
      rowObserver.disconnect();
      releasePanel?.();
      dialogObserver.disconnect();
      applyButton?.removeEventListener('click', onApply, true);
      document.body.classList.remove('gev-tw-provider-settings-open');
      extra.remove();
    },
  };
}
