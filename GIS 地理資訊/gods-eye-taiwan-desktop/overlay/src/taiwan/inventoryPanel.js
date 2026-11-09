import { buildXlsxFromMarkdown } from './xlsxExport.js';

// AI 清冊與航照智慧勾稽：工具列「AI」內的功能。清冊、航照、照片與分析結果只在本機；匯出檔由使用者自行保存。
const API = '/api/taiwan/inventory';
const CADASTRE = '/api/taiwan/nlsc-buildings/info/cadastre/status';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const NATURE = 'AI 候選，非正式現勘結論';
const FIELD_LABELS = { id: '變異點編號', period: '期別', county: '縣市／所在地', origResult: '原查證結果', cadastre: '參考地籍', lon: '經度', lat: '緯度', area: '變異點面積', desc: '內容描述', photoUrl: '查證照片 URL', otherPhotos: '其他照片 URL', excelRow: '來源 Excel 列號', changeType: '變異類型／行為', reportDate: '查報日期', checkResult: '查核結果', prevImage: '前期影像', nextImage: '後期影像', authority: '權責單位', landUse: '土地使用類型' };
const STATUS_ZH = { consistent: '色彩粗檢一致', inconsistent: '色彩粗檢疑不一致', not_assessable: '不可評', not_run: '尚未執行' };
const GEO_ZH = { point_in_cited: '座標落在所引地號內', near_cited: '座標在所引地號外 30 公尺內', mismatch: '座標與所引地號不符（待查）', cited_not_found: '所引地號查無（舊段名或不存在）', no_cadastre_text: '清冊無參考地籍', no_coordinate: '無有效座標', no_cadastre: '尚未匯入地籍圖' };
const IMAGERY_ZH = { ok: '已取得', partial: '部分取得', failed: '取圖失敗', no_location: '無法定位' };
const STYLE = `
.tw-inv{display:grid;gap:10px;font-size:13px}
.tw-inv h4{margin:0 0 6px;font-size:14px}
.tw-inv section.tw-card{padding:10px 12px}
.tw-inv .tw-row{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:6px 0}
.tw-inv label{display:grid;gap:3px;font-size:12px;color:#cbd5e1}
.tw-inv input,.tw-inv select{min-width:0;padding:5px 7px;border-radius:6px;border:1px solid rgba(148,163,184,.55);background:rgba(15,23,42,.7);color:#e2e8f0}
.tw-inv button{padding:6px 10px;border-radius:6px;border:1px solid rgba(125,211,252,.5);background:rgba(14,116,144,.45);color:#f0f9ff;cursor:pointer}
.tw-inv button[disabled]{opacity:.45;cursor:not-allowed}
.tw-inv button.tw-warn{background:rgba(153,27,27,.5);border-color:rgba(252,165,165,.6)}
.tw-inv .tw-nature{background:rgba(120,53,15,.55);border:1px solid rgba(251,191,36,.6);padding:6px 9px;border-radius:6px;color:#fef3c7}
.tw-inv .tw-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}
.tw-inv .tw-counts div{border:1px solid rgba(148,163,184,.4);border-radius:6px;padding:5px 8px;background:rgba(15,23,42,.45)}
.tw-inv .tw-counts b{display:block;font-size:17px}
.tw-inv table{border-collapse:collapse;width:100%}
.tw-inv th,.tw-inv td{border:1px solid rgba(148,163,184,.5);padding:4px 6px;text-align:left;vertical-align:top}
.tw-inv thead th{background:rgba(30,64,98,.75)}
.tw-inv tr.tw-pick{cursor:pointer}.tw-inv tr.tw-pick:hover{background:rgba(56,189,248,.15)}
.tw-inv .tw-scroll{max-height:260px;overflow:auto}
.tw-inv .tw-tag{display:inline-block;padding:0 6px;border-radius:9px;font-size:11px;border:1px solid rgba(148,163,184,.6);margin:1px}
.tw-inv .tw-bad{color:#fca5a5}.tw-inv .tw-ok{color:#86efac}.tw-inv .tw-mid{color:#fde68a}
.tw-inv img.tw-aerial{max-width:100%;border:1px solid rgba(148,163,184,.6);border-radius:6px;background:#000}
.tw-inv .tw-photos{display:flex;flex-wrap:wrap;gap:6px}.tw-inv .tw-photos img{height:120px;border-radius:6px;border:1px solid rgba(148,163,184,.6)}
.tw-inv mark{background:rgba(250,204,21,.35);color:inherit;padding:0 1px}
.tw-inv details summary{cursor:pointer;font-weight:600}
.tw-inv button.tw-inv-notebtn{margin-left:6px;padding:1px 7px;font-size:11px;font-weight:600;border-radius:5px;background:rgba(127,29,29,.45);border-color:rgba(248,113,113,.75);color:#fee2e2;vertical-align:middle}
.tw-inv button.tw-inv-notebtn[aria-expanded="true"]{background:rgba(185,28,28,.65)}
.tw-inv td.tw-inv-datenote{background:rgba(127,29,29,.18);color:#e2e8f0;font-size:12px;line-height:1.6}
.tw-inv td.tw-inv-datenote ul{margin:4px 0 0;padding-left:18px}
`;

async function call(path, options) {
  const response = await fetch(`${API}${path}`, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
function download(name, blob) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
const fmt = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toLocaleString('zh-TW', { maximumFractionDigits: digits });
const pctText = value => value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;

export function createInventoryPanel({ floatingPanels, flyTo, toast = () => {} }) {
  if (!document.getElementById('tw-inventory-style')) { const style = document.createElement('style'); style.id = 'tw-inventory-style'; style.textContent = STYLE; document.head.append(style); }
  let meanings = [], panel = null, cardPanel = null, summary = null, towns = [], groups = [], cases = null, tab = 'groups', topChoice = '12', query = '', poll = null, busy = '', message = '', lastCard = null, exporting = false;

  const body = () => panel?.body;
  const ensurePanel = () => (panel ??= floatingPanels.create({ id: 'inventory-ai', title: 'AI 清冊與航照智慧勾稽', width: 820, height: 720, onClose: () => { clearInterval(poll); poll = null; } }));
  const ensureCard = () => (cardPanel ??= floatingPanels.create({ id: 'inventory-card', title: '查核卡', width: 640, height: 720 }));

  async function refresh({ keepTab = true } = {}) {
    try { summary = await call('/state'); } catch (error) { message = `無法連線本機服務：${error.message}`; summary = null; }
    if (summary?.counts.analysed) { try { groups = (await call('/groups?top=0')).groups; } catch { groups = []; } } else groups = [];
    if (summary?.imported) { try { cases = await call(`/cases?limit=60&q=${encodeURIComponent(query)}`); } catch { cases = null; } } else cases = null;
    render();
  }
  function startPolling() {
    clearInterval(poll);
    poll = setInterval(async () => {
      try {
        const progress = await call('/progress');
        if (summary) summary.progress = progress;
        if (progress.state !== 'running' && progress.state !== 'stopping') { clearInterval(poll); poll = null; await refresh(); return; }
        const box = body()?.querySelector('[data-inv-progress]'); if (box) box.innerHTML = progressHtml(progress);
      } catch { /* try again next tick */ }
    }, 1500);
  }

  function progressHtml(progress) {
    const c = progress?.counts;
    if (!c) return '<p class="tw-note">尚未執行分析。</p>';
    const running = progress.state === 'running' || progress.state === 'stopping';
    const stage = progress.stage === 'text' ? '文字規則＋地籍比對（本機）' : progress.stage === 'imagery' ? '取得航照與讀取查證照片' : '';
    return `<p class="tw-note">狀態：<b>${{ running: '執行中', stopping: '停止中', done: '已完成', stopped: '已停止', idle: '閒置' }[progress.state] || progress.state}</b>${stage ? `（${stage}）` : ''}${progress.error ? `　<span class="tw-bad">${esc(progress.error)}</span>` : ''}</p>
      <div class="tw-counts"><div><b>${fmt(c.processed, 0)} / ${fmt(c.total, 0)}</b>已處理（文字＋地籍）</div><div><b>${fmt(c.aerialOk, 0)}</b>成功取得航照</div><div><b>${fmt(c.aerialMissing, 0)}</b>缺圖／取圖失敗</div><div><b>${fmt(c.photoRead, 0)}</b>查證照片已讀取</div><div><b>${fmt(c.photoFailed, 0)}</b>照片失效</div><div><b>${fmt(c.notAssessable, 0)}</b>不可判讀（航照與照片皆不可評）</div><div><b>${fmt(c.historicalAerialPending, 0)}</b>歷年航照：待授權／未介接</div><div><b>${fmt(c.failed, 0)}</b>處理失敗</div></div>
      <p class="tw-note">「成功取得／已讀取」是實際取得影像並解碼的數量，不是送出請求數。${c.imageryTarget !== undefined ? `航照階段目標 ${fmt(c.imageryTarget, 0)} 筆。` : ''}</p>`;
  }

  function mappingHtml() {
    const parts = Object.entries(summary.headers || {}).map(([kind, info]) => {
      const mapping = summary.mapping[kind] || {}, headers = info.headers || [];
      const rows = Object.entries(FIELD_LABELS).map(([field, label]) => `<tr><td>${esc(label)}</td><td><select data-inv-map="${kind}:${field}"><option value="">（不對應）</option>${headers.map((h, i) => `<option value="${i}" ${mapping[field] === i ? 'selected' : ''}>${esc(h.slice(0, 40))}</option>`).join('')}</select></td></tr>`).join('');
      return `<details><summary>${esc(info.sheet)}（標題在第 ${info.headerRow} 列、${headers.length} 欄）</summary><table><thead><tr><th>欄位</th><th>對應到的來源欄</th></tr></thead><tbody>${rows}</tbody></table><div class="tw-row"><button data-inv="remap">套用欄位對應並重新解析</button></div></details>`;
    });
    return parts.join('') || '<p class="tw-note">匯入後會在此顯示欄位對應。欄位名稱以實際讀檔為準，不寫死欄位字母。</p>';
  }
  function errorsHtml() {
    if (!summary.parseErrorCount) return '<p class="tw-ok">解析錯誤：0 筆。</p>';
    return `<details><summary class="tw-mid">解析錯誤報告：${summary.parseErrorCount} 筆</summary><div class="tw-scroll"><table><thead><tr><th>工作表</th><th>列</th><th>編號</th><th>問題</th></tr></thead><tbody>${summary.parseErrors.map(e => `<tr><td>${esc(e.sheet)}</td><td>${e.row ?? ''}</td><td>${esc(e.id || '')}</td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  function groupsTable() {
    const show = topChoice === 'all' ? groups : groups.slice(0, Number(topChoice));
    if (!groups.length) return '<p class="tw-note">尚無候選地點。匯入清冊後按「開始 AI 智慧選案」。</p>';
    return `<p class="tw-note">共 ${groups.length} 個候選地點；顯示 ${show.length} 個。排序＝綜合現勘優先分數（可重現規則，見下方權重）。</p><div class="tw-scroll" style="max-height:340px"><table><thead><tr><th>排名</th><th>候選</th><th>地籍／行政區</th><th>筆數</th><th>優先分</th><th>法律待查</th><th>一致性</th><th>證據</th><th>規則</th></tr></thead><tbody>${show.map(g => `<tr class="tw-pick" data-inv-case="${esc(g.leadId)}" title="${esc(g.selectionReason || '')}"><td>${g.rank}</td><td>${g.id}</td><td>${esc(g.county)}<br>${esc(g.parcels.slice(0, 2).join('；'))}</td><td>${g.size}</td><td>${fmt(g.priority)}${g.priorityPartial ? '<span class="tw-tag">部分</span>' : ''}</td><td>${fmt(g.legalQueryRisk)}</td><td>${g.textImageConsistency ?? '—'}</td><td>${g.evidenceCompleteness}%</td><td>${g.rules.join('、') || '—'}</td></tr><tr><td></td><td colspan="8" style="font-size:11.5px;color:#a5b4fc">篩選理由：${esc(g.selectionReason || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function casesTable() {
    if (!cases) return '<p class="tw-note">尚無案件。</p>';
    return `<div class="tw-row"><label>搜尋（編號／地籍／文字）<input data-inv-q value="${esc(query)}"></label><button data-inv="search">搜尋</button></div><p class="tw-note">共 ${cases.total} 筆符合；顯示前 ${cases.rows.length} 筆（依優先分排序）。</p><div class="tw-scroll" style="max-height:340px"><table><thead><tr><th>變異點</th><th>來源</th><th>期別</th><th>參考地籍</th><th>原結果</th><th>優先分</th><th>規則</th><th>航照</th><th>覆核</th></tr></thead><tbody>${cases.rows.map(r => `<tr class="tw-pick" data-inv-case="${esc(r.id)}"><td>${esc(r.id)}</td><td>${esc(r.sheet)}·${r.excelRow}</td><td>${esc(r.period)}</td><td>${esc(r.cadastre)}</td><td>${esc(r.origResult)}</td><td>${r.priority === null ? '—' : fmt(r.priority) + (r.partial ? '*' : '')}</td><td>${esc(r.hits)}</td><td>${r.imagery ? IMAGERY_ZH[r.imagery] || r.imagery : '—'}</td><td>${esc(r.review || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function weightsHtml() {
    const w = summary.weights, meaning = Object.fromEntries(meanings);
    const zh = { R01: 'R01 未申請／違法字詞', R02: 'R02 超出核准範圍', R03: 'R03 棄置／不明土方', R04: 'R04 查證受限', R05: 'R05 疑似語句', R06: 'R06 人為設施', R07: 'R07 內容空泛', R08: 'R08 面積差異', R10: 'R10 跨期重複', parcelMismatch: '地號不符', overArea: '超面積', approvalHint: '許可線索' };
    const row = (group, key, label, step) => `<tr><td>${esc(label)}</td><td style="font-size:12px">${esc(meaning[group === 'priority' ? 'priority.' + key : key] || '')}</td><td><input type="number" min="0" step="${step}" data-inv-w="${group}.${key}" value="${w[group][key]}" style="width:72px"></td></tr>`;
    const pri = { legal: '法律／權源待查', inconsistency: '文字-影像不一致', recurrence: '跨期重複' };
    return `<details><summary>評分規則與權重（版本 ${esc(w.version)}）</summary><p class="tw-note">分數不是違規機率。缺資料不當作 0：缺文字-影像一致性時以其餘項目加權並標「部分」。</p><h4>① 法律／權源待查（命中就加分，合計上限 100）</h4><table><thead><tr><th>項目</th><th>代表意義</th><th>加分</th></tr></thead><tbody>${Object.keys(w.legal).map(k => row('legal', k, zh[k] || k, 1)).join('')}</tbody></table><h4>② 綜合現勘優先分數（三項加權平均）</h4><table><thead><tr><th>項目</th><th>代表意義</th><th>比重</th></tr></thead><tbody>${Object.keys(w.priority).map(k => row('priority', k, pri[k] || k, 0.05)).join('')}</tbody></table><p class="tw-note">公式：綜合 ＝（法律／權源待查 × ${w.priority.legal} ＋（100 − 文字-影像一致性）× ${w.priority.inconsistency} ＋ 跨期重複 × ${w.priority.recurrence}）÷ 實際使用的比重總和。最終篩選：依綜合分數由高到低排序候選地點（同地號或 50 m 內相鄰的案件聚成一地，取最高分），每筆的分數拆解寫在查核卡「篩選理由」與匯出 Excel。</p><div class="tw-row"><button data-inv="save-weights">套用權重並重算排序</button><button data-inv="reset-weights">還原預設</button></div></details>`;
  }

  function render() {
    const el = body(); if (!el) return;
    if (!summary) { el.innerHTML = `<div class="tw-inv"><p class="tw-bad">${esc(message || '讀取中…')}</p></div>`; return; }
    const running = ['running', 'stopping'].includes(summary.progress?.state);
    const c = summary.counts;
    el.innerHTML = `<div class="tw-inv">
      <div class="tw-nature">${NATURE}：本功能只依規則與影像統計產生選案候選，分數不是違規機率；影像判釋不等於法律結論，也不是主管機關認定。清冊、航照快取與結果只存本機。${summary.cadastre.available ? '' : '<br><b>尚未匯入地籍圖，地籍比對將略過。</b>'}</div>
      ${message ? `<p class="tw-note" data-inv-msg>${esc(message)}</p>` : ''}
      <section class="tw-card"><h4>A．單一宗地：自動取得航照並分析</h4>
        <div class="tw-row"><label>縣市<select disabled><option>宜蘭縣</option></select></label><label>鄉鎮市<select data-inv-town>${towns.map(t => `<option>${esc(t.town)}</option>`).join('')}</select></label><label>地段（例：存仁段）<input data-inv-section placeholder="存仁段" style="width:130px"></label><label>地號（例：166 或 268-1）<input data-inv-number placeholder="166" style="width:110px"></label><button data-inv="parcel" ${busy ? 'disabled' : ''}>自動取得航照並分析</button></div></section>
      <section class="tw-card"><h4>B．匯入清冊：AI 智慧選案</h4>
        <div class="tw-row"><label>清冊 Excel（.xlsx）<input type="file" accept=".xlsx" data-inv-file></label><button data-inv="import" ${busy ? 'disabled' : ''}>匯入清冊</button></div>
        ${summary.imported ? `<p class="tw-note">已匯入：${esc(summary.source.name)}（${fmt(summary.source.bytes / 1048576)} MB，SHA-256 ${esc(summary.source.sha256.slice(0, 16))}…，${new Date(summary.importedAt).toLocaleString('zh-TW')}）。共 ${fmt(c.total, 0)} 筆：高風險案件 ${fmt(c.high, 0)}、未命中清冊 ${fmt(c.miss, 0)}。</p>${errorsHtml()}<details><summary>欄位對應畫面</summary>${mappingHtml()}</details>
        <div class="tw-row"><label>範圍<select data-inv-scope><option value="high">高風險案件</option><option value="miss">未命中清冊</option><option value="all">全部</option></select></label><label>取圖分析筆數（依初步分數）<select data-inv-top><option value="12">前 12 筆</option><option value="30" selected>前 30 筆</option><option value="100">前 100 筆</option><option value="0">全部（耗時）</option></select></label>
          <button data-inv="run" ${running || busy ? 'disabled' : ''}>開始 AI 智慧選案</button><button class="tw-warn" data-inv="stop" ${running ? '' : 'disabled'}>停止</button><button data-inv="retry" ${running ? 'disabled' : ''}>重試失敗項</button><button data-inv="undo" ${running ? 'disabled' : ''}>復原航照結果</button></div>` : '<p class="tw-note">尚未匯入。選擇檔案後按「匯入清冊」；檔案只傳給本機服務。</p>'}
        <div data-inv-progress>${progressHtml(summary.progress)}</div></section>
      ${summary.imported ? `<section class="tw-card"><div class="tw-row"><button data-inv="tab-groups" ${tab === 'groups' ? 'disabled' : ''}>現勘地點排序</button><button data-inv="tab-cases" ${tab === 'cases' ? 'disabled' : ''}>逐筆案件</button><label>顯示<select data-inv-view><option value="12" ${topChoice === '12' ? 'selected' : ''}>Top 12</option><option value="30" ${topChoice === '30' ? 'selected' : ''}>Top 30</option><option value="all" ${topChoice === 'all' ? 'selected' : ''}>全部</option></select></label></div>${tab === 'groups' ? groupsTable() : casesTable()}</section>
        ${weightsHtml()}
        <section class="tw-card"><h4>匯出</h4><p class="tw-note">Excel 含「逐筆候選清冊／現勘地點彙整／來源與證據索引／分析方法與限制」，每列標示「${NATURE}」；另可匯出 GeoJSON 與 evidence_manifest.json（只含雜湊、狀態與統計，不含影像本身）。</p>
        <div class="tw-row"><button data-inv="export-xlsx" ${exporting || !groups.length ? 'disabled' : ''}>匯出 Excel（依上方 Top 選擇）</button><button data-inv="export-geojson" ${exporting || !groups.length ? 'disabled' : ''}>匯出 GeoJSON</button><button data-inv="export-manifest" ${exporting || !groups.length ? 'disabled' : ''}>匯出 evidence_manifest.json</button></div></section>` : ''}
    </div>`;
    const select = el.querySelector('[data-inv-scope]'); if (select && summary.progress?.scope) select.value = summary.progress.scope;
  }

  // ---------- card ----------
  const hl = (textValue, evidences) => {
    let out = esc(textValue);
    for (const ev of evidences) { const core = esc(String(ev || '')).trim(); if (core.length >= 2 && out.includes(core)) out = out.replace(core, `<mark>${core}</mark>`); }
    return out.replace(/\n/g, '<br>');
  };
  const ruleBadge = r => r ? (r.notApplicable ? '<span class="tw-note">不適用（原判非「非違規」）</span>' : r.hit ? '<span class="tw-bad">命中</span>' : '未命中') : '—';
  // 宗地界線（黃線）的圖資來源與日期：與航照分開標示，避免把航照日期當成地籍日期。
  const cadastreRows = cs => !cs?.available ? '<tr><th>地籍圖資</th><td>尚未匯入地籍圖</td></tr>' :
    `<tr><th>地籍圖資來源（黃線）</th><td>${esc(cs.source)}；本機匯入（${esc(cs.importedAt ? new Date(cs.importedAt).toLocaleString('zh-TW') : '時間未記錄')}）</td></tr><tr><th>地籍資料日期 <button type="button" class="tw-inv-notebtn" data-inv-datenote aria-expanded="false" title="說明各地號日期與「圖資版本」的關係">註記 ▸</button></th><td>圖資版本：${esc(cs.latestDataDate || '未記錄')}${cs.parcels.length ? '<br>' + cs.parcels.map(p => `${esc(p.landNumber)} 地號：${esc(p.dataDate || '未記錄')}`).join('<br>') : ''}${cs.pointParcel && !cs.parcels.some(p => p.landNumber === cs.pointParcel.landNumber) ? `<br>座標所在 ${esc(cs.pointParcel.landNumber)} 地號：${esc(cs.pointParcel.dataDate || '未記錄')}` : ''}</td></tr><tr data-inv-datenote-row hidden><td colspan="2" class="tw-inv-datenote"><b>「圖資版本」與各地號日期的關係</b><ul><li><b>圖資版本</b>（${esc(cs.latestDataDate || '未記錄')}）：本次匯入的地籍圖檔中，全部地號「資料日期」裡最新的一天，代表整份地籍圖的版本。</li><li><b>各地號日期</b>（如「紅柴林段5-2 地號：民國 112 年 7 月 1 日」）：該筆地號的資料在這份圖資中最後一次更新的日期。日期早於圖資版本，表示這筆地號在該版圖資中的資料停在那天，之後的異動未反映在這筆資料上。</li></ul></td></tr><tr><th>段名對照來源</th><td>${esc(cs.sectionTable)}</td></tr>`;
  function cardHtml(card) {
    const c = card.case, r = card.result, s = r?.score, img = r?.imagery, meta = img?.metadata, photo = r?.photo, review = card.review;
    if (!r) return `<div class="tw-inv"><p class="tw-note">此案件尚未分析。請先在清冊面板按「開始 AI 智慧選案」。</p></div>`;
    const evidences = [...Object.values(r.text.flags).filter(f => f.hit).map(f => f.evidence), ...r.text.entities.map(e => e.evidence), ...r.text.areas.map(a => a.evidence)].map(e => String(e).replace(/…/g, '')).flatMap(e => [e]);
    const ruleRows = Object.entries(card.ruleTitles).map(([code, title]) => {
      let status;
      if (code === 'R09') status = `R09-A：${STATUS_ZH[r.rule?.R09?.['R09-A']?.status] || '—'}${r.rule?.R09?.['R09-A']?.reason ? `（${esc(r.rule.R09['R09-A'].reason)}）` : ''}<br>R09-B：${STATUS_ZH[r.rule?.R09?.['R09-B']?.status] || '—'}${r.rule?.R09?.['R09-B']?.reason ? `（${esc(r.rule.R09['R09-B'].reason)}）` : ''}`;
      else if (code === 'R10') status = r.recurrence.count ? `<span class="tw-bad">命中</span>：50 m 內／同地籍跨期 ${r.recurrence.count} 筆${r.recurrence.neighbours.slice(0, 4).map(n => `<br>${esc(n.id)}（${esc(n.period)}，${n.distanceM} m）`).join('')}` : '未命中';
      else status = `${ruleBadge(r.text.rules[code])}${r.text.rules[code]?.hit ? `<br><small>${r.text.rules[code].evidence.map(esc).join('<br>')}</small>` : ''}`;
      return `<tr><td>${code}</td><td>${esc(title)}</td><td>${status}</td><td>${c.origFlags?.[code] ? '是' : '—'}</td></tr>`;
    }).join('');
    const photoHtml = photo?.items?.length ? `<div class="tw-photos">${photo.items.map(p => p.status === 'ok' ? `<a href="${esc(p.url)}" target="_blank" rel="noreferrer noopener"><img alt="查證照片" src="${API}/image?kind=photo&key=${encodeURIComponent(p.cacheKey)}"></a>` : `<span class="tw-tag tw-bad">${esc(p.reason || p.status)}</span>`).join('')}</div><p class="tw-note">${photo.items.map(p => `${p.status === 'ok' ? `${p.widthPx}×${p.heightPx}` : '未讀取'}；拍攝日：${esc(p.captureDate || '未知')}（${esc(p.captureDateNote || p.reason || '')}）；取得 ${new Date(p.fetchedAt).toLocaleString('zh-TW')}`).join('<br>')}<br>清冊共 ${photo.totalUrls} 張照片 URL，已嘗試 ${photo.items.length} 張。</p>` : `<p class="tw-note">尚未讀取照片（清冊 URL ${c.photoUrls.length + c.otherPhotoUrls.length} 張）。</p>`;
    return `<div class="tw-inv">
      <div class="tw-nature">${NATURE}</div>
      <section class="tw-card"><h4>${esc(c.id)}　${esc(c.county)}　${esc(c.cadastre || '（無參考地籍）')}</h4>
        <p class="tw-note">${esc(c.sheet === 'adhoc' ? '單一宗地查詢' : c.sheet === 'high' ? '高風險案件' : '未命中清冊')}${c.excelRow ? ` · 來源 Excel 第 ${c.excelRow} 列` : ''}　期別 ${esc(c.period || '—')}　原查證結果：${esc(c.origResult || '—')}　${card.group ? `候選 ${card.group.id}（排名 ${card.group.rank}，${card.group.size} 筆）` : ''}</p>
        <div class="tw-row"><button data-inv-fly="${c.lon ?? ''},${c.lat ?? ''}" ${Number.isFinite(c.lon) ? '' : 'disabled'}>在地圖定位</button><button data-inv-refetch="${esc(c.id)}">重新取圖／讀取全部照片</button></div></section>
      <section class="tw-card"><h4>航照實圖與宗地界線</h4>${img?.imageKey ? `<img class="tw-aerial" alt="航照" src="${API}/image?id=${encodeURIComponent(c.id)}&t=${encodeURIComponent(r.imageryAt || '')}"><p class="tw-note">黃線＝所引地號界線（本機地籍圖）；紅圈＝以變異面積換算的等面積半徑；紅十字＝清冊座標。</p>` : `<p class="tw-note">${img ? `未取得航照：${esc(img.metadata?.requestStatus || '')}` : '尚未取得航照（批次只對前幾名取圖，可按「重新取圖」）。'}</p>`}
        ${meta ? `<table class="tw-bordered tw-table"><tbody><tr><th>航照影像來源</th><td>${esc(meta.sourceName)}<br>${esc(meta.serviceLayer)}</td></tr><tr><th>航照拍攝日期</th><td>${esc(meta.captureDate || meta.captureDateNote)}</td></tr><tr><th>系統取圖時間</th><td>${new Date(meta.fetchedAt).toLocaleString('zh-TW')}（不是拍攝日）</td></tr><tr><th>解析度／縮放</th><td>${meta.resolutionMPerPx} m/px（z${meta.zoom}），${esc(meta.crs)}</td></tr><tr><th>請求狀態</th><td>${IMAGERY_ZH[meta.requestStatus] || meta.requestStatus}（${meta.usableTiles}/${meta.requestedTiles} 張圖磚可用）</td></tr><tr><th>授權</th><td>${esc(meta.licence)}</td></tr><tr><th>影像雜湊</th><td>${esc((meta.imageSha256 || '').slice(0, 24))}</td></tr>${cadastreRows(card.cadastre)}</tbody></table>` : (card.cadastre?.available ? `<table class="tw-bordered tw-table"><tbody>${cadastreRows(card.cadastre)}</tbody></table>` : '')}
        ${img?.stats?.disc ? `<p><b>異常量化（色彩粗分類）</b>：圓內植生 ${pctText(img.stats.disc.vegetation)}、裸露 ${pctText(img.stats.disc.bare)}、高亮屋頂／鋪面 ${pctText(img.stats.disc.bright)}、陰影 ${pctText(img.stats.disc.shadow)}、其他 ${pctText(img.stats.disc.other)}（半徑 ${img.stats.discRadiusM} m）${img.stats.parcel ? `；宗地內植生 ${pctText(img.stats.parcel.vegetation)}、裸露 ${pctText(img.stats.parcel.bare)}、高亮 ${pctText(img.stats.parcel.bright)}` : ''}</p><p class="tw-note">${esc(img.stats.algorithm)}</p>` : ''}
        ${img?.r09b?.checks ? `<table><thead><tr><th>R09-B 檢查</th><th>門檻</th><th>觀察</th><th>結果</th></tr></thead><tbody>${img.r09b.checks.map(k => `<tr><td>${esc(k.label)}</td><td>${esc(k.expected)}</td><td>${esc(k.observed)}</td><td>${k.consistent ? '<span class="tw-ok">一致</span>' : '<span class="tw-bad">疑不一致</span>'}</td></tr>`).join('')}</tbody></table>` : ''}
        ${img?.r09b?.temporalCaveat ? `<p class="tw-note tw-mid">${esc(img.r09b.temporalCaveat)}</p>` : ''}</section>
      <section class="tw-card"><h4>原查證照片</h4>${photoHtml}${photo?.r09a ? `<p class="tw-note">R09-A：<b>${STATUS_ZH[photo.r09a.status]}</b>${photo.r09a.reason ? `（${esc(photo.r09a.reason)}）` : ''}${photo.r09a.semantic ? `<br>${esc(photo.r09a.semantic)}` : ''}</p>` : ''}</section>
      <section class="tw-card"><h4>原文字（可見證據以底色標示）</h4><p>${hl(c.desc || '（無描述）', evidences)}</p>
        <p class="tw-note">規則抽取（${esc(r.text.ruleVersion)}，${esc(r.text.confidence)}）：${r.text.entities.map(e => `<span class="tw-tag">${esc(e.type)}${e.negated ? '（否定語境）' : ''}</span>`).join('') || '無地物'} ${r.text.actions.map(a => `<span class="tw-tag">${esc(a.type)}</span>`).join('')} ${r.text.areas.map(a => `<span class="tw-tag">${fmt(a.squareMetres)} m²（${{ cap: '上限', approved: '核准', satellite: '衛星', claimed: '文字面積' }[a.role]}）</span>`).join('')}${r.text.flags.suspicion.hit ? '<span class="tw-tag tw-mid">疑似語句</span>' : ''}${r.text.flags.accessLimited.hit ? '<span class="tw-tag tw-mid">查證受限</span>' : ''}${r.text.flags.approval.hit ? '<span class="tw-tag">含許可線索</span>' : ''}</p></section>
      <section class="tw-card"><h4>空間落點與地籍</h4><p>${esc(GEO_ZH[r.geo.status] || r.geo.status)}${r.geo.statusNote ? `：${esc(r.geo.statusNote)}` : ''}</p>${r.geo.refs.length ? `<table><thead><tr><th>清冊地號</th><th>本機地籍</th><th>面積(㎡)</th></tr></thead><tbody>${r.geo.refs.map(x => `<tr><td>${esc(x.ref)}</td><td>${x.found ? esc(x.sectionName + x.landNumber) : `<span class="tw-bad">查無</span>${x.hint?.length ? `（疑為重測前舊段名，現行：${esc(x.hint.join('、'))}）` : ''}`}</td><td>${fmt(x.areaM2)}</td></tr>`).join('')}</tbody></table>` : ''}${r.geo.pointParcel ? `<p class="tw-note">座標實際落在：${esc((r.geo.pointParcel.townName || '') + (r.geo.pointParcel.sectionName || '') + r.geo.pointParcel.landNumber)} 地號</p>` : ''}${Number.isFinite(r.geo.areaRatio) ? `<p class="tw-note">變異面積／所引地號面積 = ${r.geo.areaRatio}</p>` : ''}</section>
      <section class="tw-card"><h4>篩選理由（為什麼排在這裡）</h4><p>${(s.reason || '').split('；').map(esc).join('<br>')}</p>${card.group ? `<p class="tw-note">所屬候選地點 ${card.group.id}（排名 ${card.group.rank}）：${esc(card.group.reason)}</p>` : ''}</section>
      <section class="tw-card"><h4>R01～R10 與風險構成（算法 ${esc(s.version)}）</h4><table><thead><tr><th>代碼</th><th>規則</th><th>本引擎結果</th><th>清冊原碼</th></tr></thead><tbody>${ruleRows}</tbody></table>
        <table class="tw-bordered tw-table"><tbody><tr><th>綜合現勘優先分數</th><td>${fmt(s.priority)}${s.priorityPartial ? ' <span class="tw-tag tw-mid">部分</span>' : ''}</td></tr><tr><th>法律／權源待查風險</th><td>${fmt(s.legalQueryRisk)}</td></tr><tr><th>文字-影像一致性</th><td>${s.textImageConsistency ?? '無法計算（影像或照片不可評）'}</td></tr><tr><th>跨期重複（0–100）</th><td>${s.recurrence}</td></tr><tr><th>證據完整度</th><td>${s.evidenceCompleteness}%（${Object.entries(s.evidenceItems).map(([k, v]) => `${k}${v ? '✓' : '✗'}`).join(' ')}）</td></tr><tr><th>使用的權重</th><td>${esc(JSON.stringify(s.weightsUsed))}</td></tr></tbody></table>
        ${s.legalFlags.length ? `<p class="tw-note">風險構成：${s.legalFlags.map(f => `${esc(f.label)}（+${f.weight}）`).join('；')}</p>` : ''}${s.priorityMissing.length ? `<p class="tw-note tw-mid">資料缺口：${s.priorityMissing.map(esc).join('；')}</p>` : ''}<p class="tw-note">${esc(s.note)}</p></section>
      <section class="tw-card"><h4>待調文件、限制與人工覆核</h4>${card.needDocuments.length ? `<ul>${card.needDocuments.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : '<p class="tw-note">無特定待調文件。</p>'}<p class="tw-note">${card.legal.semantics.map(esc).join('　／　')}<br>${esc(card.legal.caveat)}</p>
        <div class="tw-row"><label>覆核備註<input data-inv-note value="${esc(review?.note || '')}" style="width:260px"></label>${['已覆核-建議現勘', '已覆核-待調證', '已覆核-不需現勘', '待覆核'].map(st => `<button data-inv-review="${st}" data-id="${esc(c.id)}" ${review?.status === st ? 'disabled' : ''}>${st}</button>`).join('')}</div><p class="tw-note">目前：${esc(review?.status || '待覆核')}${review?.at ? `（${new Date(review.at).toLocaleString('zh-TW')}）` : ''}</p></section>
    </div>`;
  }
  async function openCard(id) {
    const card = ensureCard(); card.body.innerHTML = '<div class="tw-inv"><p class="tw-note">讀取查核卡…</p></div>'; card.restore();
    try { lastCard = await call(`/case?id=${encodeURIComponent(id)}`); card.body.innerHTML = cardHtml(lastCard); }
    catch (error) { card.body.innerHTML = `<div class="tw-inv"><p class="tw-bad">${esc(error.message)}</p></div>`; }
  }

  // ---------- actions ----------
  async function action(button) {
    const act = button.dataset.inv, el = body();
    const guard = async (label, task) => { busy = label; message = `${label}…`; render(); try { await task(); message = ''; } catch (error) { message = `${label}失敗：${error.message}`; } busy = ''; await refresh(); };
    if (act === 'import') {
      const file = el.querySelector('[data-inv-file]').files[0];
      if (!file) { message = '請先選擇清冊 .xlsx'; return render(); }
      return guard('匯入清冊', async () => { const response = await fetch(`${API}/import?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file }); const data = await response.json(); if (!response.ok) throw new Error(data.error); toast(`已匯入 ${data.counts.total} 筆`); });
    }
    if (act === 'remap') {
      const mapping = {};
      for (const select of el.querySelectorAll('[data-inv-map]')) { const [kind, field] = select.dataset.invMap.split(':'); (mapping[kind] ??= {})[field] = select.value === '' ? undefined : Number(select.value); }
      for (const kind of Object.keys(mapping)) mapping[kind] = Object.fromEntries(Object.entries(mapping[kind]).filter(([, v]) => v !== undefined));
      return guard('重新解析', () => post('/remap', { mapping }));
    }
    if (act === 'run' || act === 'retry') {
      const scope = el.querySelector('[data-inv-scope]').value, top = Number(el.querySelector('[data-inv-top]').value);
      message = ''; await post('/run', { scope, top, retry: act === 'retry' }).catch(error => { message = error.message; });
      await refresh(); startPolling(); return;
    }
    if (act === 'stop') { await post('/stop'); message = '已要求停止，進行中的請求完成後結束。'; return render(); }
    if (act === 'undo') return guard('復原航照結果', async () => { const r = await post('/undo', {}); toast(`已復原 ${r.undone} 筆航照／照片結果`); });
    if (act === 'search') { query = el.querySelector('[data-inv-q]').value.trim(); return refresh(); }
    if (act === 'tab-groups') { tab = 'groups'; return render(); }
    if (act === 'tab-cases') { tab = 'cases'; return render(); }
    if (act === 'parcel') {
      const town = el.querySelector('[data-inv-town]').value, section = el.querySelector('[data-inv-section]').value.trim(), number = el.querySelector('[data-inv-number]').value.trim();
      return guard('取得航照並分析', async () => { const card = await post('/parcel', { town, section, number }); const panelCard = ensureCard(); lastCard = card; panelCard.body.innerHTML = cardHtml(card); panelCard.restore(); });
    }
    if (act === 'save-weights' || act === 'reset-weights') {
      const weights = { legal: {}, priority: {} };
      for (const input of el.querySelectorAll('[data-inv-w]')) { const [group, key] = input.dataset.invW.split('.'); weights[group][key] = Number(input.value); }
      return guard('更新權重', () => post('/weights', act === 'reset-weights' ? { reset: true } : weights));
    }
    if (act.startsWith('export-')) {
      exporting = true; render();
      try {
        const top = topChoice === 'all' ? 0 : Number(topChoice), data = await call(`/export?top=${top}`);
        if (act === 'export-xlsx') download(`${data.fileBase}.xlsx`, await buildXlsxFromMarkdown('', { extraTables: data.sheets.map(sheet => ({ title: sheet.title, header: sheet.header, rows: sheet.rows })), program: `上帝之眼・台灣版（${NATURE}）` }));
        if (act === 'export-geojson') download(`${data.fileBase}.geojson`, new Blob([JSON.stringify(data.geojson, null, 1)], { type: 'application/geo+json' }));
        if (act === 'export-manifest') download('evidence_manifest.json', new Blob([JSON.stringify(data.manifest, null, 1)], { type: 'application/json' }));
        toast('已匯出（只含候選、狀態與雜湊）');
      } catch (error) { message = `匯出失敗：${error.message}`; }
      exporting = false; render();
    }
  }

  function bind() {
    const el = body();
    if (el.dataset.invBound) return; el.dataset.invBound = '1';
    el.addEventListener('click', event => {
      const target = event.target.closest('[data-inv],[data-inv-case]'); if (!target || target.disabled) return;
      if (target.dataset.invCase) return void openCard(target.dataset.invCase);
      void action(target);
    });
    el.addEventListener('change', event => { if (event.target.matches('[data-inv-view]')) { topChoice = event.target.value; render(); } });
    el.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.matches('[data-inv-q]')) { query = event.target.value.trim(); void refresh(); } });
    // 查核卡的按鈕
    const card = ensureCard();
    card.body.addEventListener('click', async event => {
      const dateNote = event.target.closest('[data-inv-datenote]');
      if (dateNote) {
        const row = card.body.querySelector('[data-inv-datenote-row]'); if (!row) return;
        const open = row.hidden; row.hidden = !open;
        dateNote.setAttribute('aria-expanded', String(open)); dateNote.textContent = open ? '註記 ▾' : '註記 ▸';
        return;
      }
      const fly = event.target.closest('[data-inv-fly]'), refetch = event.target.closest('[data-inv-refetch]'), review = event.target.closest('[data-inv-review]');
      if (fly && !fly.disabled) { const [lon, lat] = fly.dataset.invFly.split(',').map(Number); flyTo?.(lon, lat); }
      if (refetch) { refetch.disabled = true; refetch.textContent = '取圖中…'; try { lastCard = await post('/imagery', { id: refetch.dataset.invRefetch, photos: 3 }); card.body.innerHTML = cardHtml(lastCard); void refresh(); } catch (error) { refetch.textContent = `失敗：${error.message}`; } }
      if (review) { const note = card.body.querySelector('[data-inv-note]')?.value || ''; try { await post('/review', { id: review.dataset.id, status: review.dataset.invReview, note }); await openCard(review.dataset.id); void refresh(); } catch (error) { toast(error.message); } }
    });
  }

  return {
    async open() {
      ensurePanel().restore(); bind();
      body().innerHTML = '<div class="tw-inv"><p class="tw-note">讀取本機清冊狀態…</p></div>';
      try { towns = (await (await fetch(CADASTRE, { cache: 'no-store' })).json()).towns || []; } catch { towns = []; }
      try { meanings = await call('/weight-meanings'); } catch { meanings = []; }
      await refresh();
      if (['running', 'stopping'].includes(summary?.progress?.state)) startPolling();
    },
  };
}
