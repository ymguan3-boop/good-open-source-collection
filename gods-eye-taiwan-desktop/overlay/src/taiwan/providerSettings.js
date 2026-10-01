import { invoke } from '@tauri-apps/api/core';
import { browserAi } from './browserAi.js';

const SECURE_SERVICES = [
  { id:'google-maps', key:'google', title:'GOOGLE MAPS' },
  { id:'cesium-ion', key:'cesium', title:'CESIUM ION' },
  { id:'tomtom', key:'tomtom', title:'TOMTOM', url:'https://my.tomtom.com/' },
  { id:'openrouter', key:'openrouter', title:'OPENROUTER', url:'https://openrouter.ai/settings/keys', description:'AI 查核主題建議；免費模型清單會依目前可用模型更新。' },
  { id:'gemini-live', key:'gemini', title:'GEMINI LIVE', url:'https://aistudio.google.com/apikey', description:'即時語音助理；使用 Google AI Studio API Key。' },
];

export function integrateProviderSettings() {
  const dialog = document.getElementById('key-setup');
  const chip = document.getElementById('key-setup-chip');
  const rows = dialog?.querySelector('[data-key-setup-rows]');
  if (!dialog || !chip || !rows) return { open:async () => false, dispose() {} };

  const desktop = Boolean(globalThis.__TAURI_INTERNALS__);
  const footer = dialog.querySelector('.key-setup-footer');
  const applyButton = dialog.querySelector('[data-key-setup-apply]');
  const legacyStatus = dialog.querySelector('[data-key-setup-status]');
  const extra = document.createElement('div');
  extra.className = 'tw-provider-secure-actions';
  extra.innerHTML = `<span data-tw-provider-status role="status" aria-live="polite">${desktop ? '台灣版金鑰只儲存在 Windows Credential Manager' : '瀏覽器版金鑰以 Windows 使用者加密保存，重新開啟後可沿用。'}</span>`;
  footer?.before(extra);
  const status = extra.querySelector('[data-tw-provider-status]');
  let modelRefreshPending = false;
  let forwardLegacySave = false;
  let legacySavePending = false;
  let restartScheduled = false;

  function scheduleRestart() {
    if (restartScheduled) return;
    restartScheduled = true;
    status.textContent = '金鑰已儲存，正在重新開啟桌面程式…';
    window.setTimeout(() => {
      void invoke('restart_after_key_save').catch(error => {
        restartScheduled = false;
        status.textContent = `自動重啟失敗：${error?.message || error}。請關閉後重新開啟程式。`;
      });
    }, 900);
  }

  const onKeyLinkClick = event => {
    const link = event.target.closest?.('a.key-setup-get');
    if (!desktop || !link || !dialog.contains(link)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void invoke('open_provider_key_url', { url:link.getAttribute('href') }).catch(error => {
      status.textContent = `無法開啟申請網址：${error?.message || error}`;
    });
  };
  dialog.addEventListener('click', onKeyLinkClick, true);

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
    input.placeholder = desktop ? '貼上後安全儲存' : ['openrouter', 'gemini'].includes(service.key) ? '貼上後加密保存' : '此服務請使用原版設定欄位';
    input.disabled = false;
    fields.append(input);
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
    if (!desktop) {
      for (const input of rows.querySelectorAll('input[data-env-var]')) {
        input.dataset.twSecureKey = input.dataset.envVar;
        input.removeAttribute('data-env-var');
        input.disabled = false;
        input.placeholder = '貼上後加密保存；留白沿用已存金鑰';
      }
    }
    for (const service of SECURE_SERVICES) {
      const row = rows.querySelector(`[data-key-id="${service.id}"]`);
      if (!row) {
        if (service.url) rows.append(makeRow(service));
        continue;
      }
      if (service.url) row.querySelector('.key-setup-get')?.setAttribute('href', service.url);
      if ((!desktop && !['openrouter','gemini'].includes(service.key)) || row.dataset.twService === service.key) continue;
      const input = row.querySelector('input[data-env-var]');
      if (!input) continue;
      input.removeAttribute('data-env-var');
      input.disabled = false;
      input.dataset.twSecureKey = service.key;
      input.placeholder = desktop ? '貼上後安全儲存' : '貼上後加密保存';
      row.dataset.twService = service.key;
      row.querySelector('[data-key-setup-remove]')?.remove();
      if (service.key === 'openrouter' && !row.querySelector('[data-tw-free-model]')) {
        const controls = makeRow(service).querySelector('.key-setup-fields');
        row.querySelector('.key-setup-fields')?.append(...[...controls.children].filter(element => element.tagName !== 'INPUT'));
      }
    }
    if (!desktop) for (const row of rows.querySelectorAll('.key-setup-row')) {
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
      const available = desktop ? await invoke('openrouter_free_models') : await browserAi('/models');
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
    if (!desktop) {
      try {
        const available = await browserAi('/keys');
        if (available.warning) status.textContent = available.warning;
        for (const row of rows.querySelectorAll('.key-setup-row')) {
          const inputs = [...row.querySelectorAll('input[data-tw-secure-key]')];
          row.dataset.set = String(inputs.length > 0 && inputs.every(input => available[input.dataset.twSecureKey] || available.env?.[input.dataset.twSecureKey]));
        }
      } catch { /* Service availability is reported on save. */ }
      return;
    }
    for (const service of SECURE_SERVICES) {
      const row = rows.querySelector(`[data-tw-service="${service.key}"]`);
      if (!row) continue;
      try { row.dataset.set = String(await invoke('has_api_key', { name:service.key })); }
      catch { row.dataset.set = 'false'; }
    }
  }

  async function saveSecureKeys() {
    const inputs = [...rows.querySelectorAll('input[data-tw-secure-key]')].filter(input => input.value.trim());
    if (!inputs.length) return false;
    status.textContent = '正在安全儲存…';
    try {
      for (const input of inputs) {
        if (desktop) await invoke('save_api_key', { name:input.dataset.twSecureKey, value:input.value.trim() });
        else await browserAi('/keys', { method:'POST', data:{ name:input.dataset.twSecureKey, value:input.value.trim() } });
        input.value = '';
      }
      const model = rows.querySelector('[data-tw-free-model]')?.value;
      if (model) localStorage.setItem('gev.tw.aiModel', model);
      window.dispatchEvent(new Event('gev-tw:model-changed'));
      await updateKeyIndicators();
      window.dispatchEvent(new Event('gev-tw:keys-changed'));
      status.textContent = desktop ? '已儲存至 Windows Credential Manager。' : '已加密儲存，下次開啟可沿用；AI 與地圖服務會使用新設定。';
      return true;
    } catch (error) { status.textContent = `儲存失敗：${error?.message || error}`; return false; }
  }

  applyButton?.addEventListener('click', async event => {
    if (forwardLegacySave) { forwardLegacySave = false; return; }
    if (![...rows.querySelectorAll('input[data-tw-secure-key]')].some(input => input.value.trim())) {
      legacySavePending = [...rows.querySelectorAll('input[data-env-var]')].some(input => input.value.trim());
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const legacyHasInput = [...rows.querySelectorAll('input[data-env-var]')].some(input => input.value.trim());
    if (await saveSecureKeys()) {
      if (legacyHasInput) {
        legacySavePending = true;
        forwardLegacySave = true;
        applyButton.click();
      } else if (desktop) scheduleRestart();
    }
  }, true);
  const legacyStatusObserver = new MutationObserver(() => {
    if (desktop && legacySavePending && /Restarting|重新啟動/.test(legacyStatus?.textContent || '')) {
      legacySavePending = false;
      scheduleRestart();
    }
  });
  if (legacyStatus) legacyStatusObserver.observe(legacyStatus, { childList:true, characterData:true, subtree:true });
  rows.addEventListener('click', event => {
    const remove = event.target.closest('[data-tw-remove-key]');
    if (remove) {
      void (async () => { try {
        for (const input of remove.closest('.key-setup-row').querySelectorAll('[data-tw-secure-key]')) await browserAi('/keys',{method:'DELETE',data:{name:input.dataset.twSecureKey}});
        await updateKeyIndicators(); window.dispatchEvent(new Event('gev-tw:keys-changed')); status.textContent = '已清除該服務金鑰；地圖服務重新整理後套用。';
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
  if (description) description.textContent = desktop
    ? '沿用原版服務設定欄位；台灣版服務金鑰儲存在 Windows Credential Manager。'
    : '所有服務均可在下列欄位輸入；金鑰以 Windows 使用者加密保存。留白保留原金鑰，AI 金鑰不回傳至瀏覽器或 JSON 專案。';
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
      dialogObserver.disconnect();
      legacyStatusObserver.disconnect();
      dialog.removeEventListener('click', onKeyLinkClick, true);
      document.body.classList.remove('gev-tw-provider-settings-open');
      extra.remove();
    },
  };
}
