
const TEXT = new Map([
  ['DATA LAYERS', '圖資管理'],
  ['CCTV', '即時影像'],
  ['SCENES', '場景'],
  ['ACTIVE STYLE', '目前顯示'],
  ['NORMAL', '一般'],
  ['NEW', '新增'],
  ['DEL', '刪除'],
  ['START', '開始'],
  ['STOP', '停止'],
  ['NEXT', '下一個'],
  ['PREV', '上一個'],
  ['FOCUS', '定位'],
  ['READY', '就緒'],
  ['MISSION CONTROL · FIRST LAUNCH', '任務中心 · 首次啟動'],
  ['ENVIRONMENTAL', '環境資訊'],
  ['Choose your first view', '選擇你的第一個視角'],
  ['LIVE CONTACTS', '即時動態'],
  ['SPACE MISSIONS', '太空任務'],
  ['ENVIRONMENTAL', '環境資訊'],
  ['EXPLORE MANUALLY', '自行探索'],
  ['Aircraft, vessels and nearby intelligence', '查看飛機、船舶與周邊資訊'],
  ['Launches, spacecraft and orbital context', '火箭發射、太空船與軌道資訊'],
  ['Begin with a clean globe', '從乾淨的地球視圖開始'],
  ["Don't show this again", '下次不再顯示'],
  ['ESC to dismiss', '按 Esc 關閉'],
  ['Layers', '圖層'],
  ['Settings', '設定'],
  ['Display', '顯示'],
  ['Location', '位置'],
  ['Presets', '預設'],
  ['Apply', '套用'],
  ['Cancel', '取消'],
  ['Search', '搜尋'],
  ['Refresh', '重新整理'],
  ['Close', '關閉'],
  ['Collapse panel', '收合面板'],
  ['Expand panel', '展開面板'],
  ['Clear selected data layers', '清除所有已選圖層'],
  ['Copy share link', '複製分享連結'],
  ['Tilt map to oblique view', '切換俯視／傾斜視角'],
  ['Return map to straight-down view', '切換為垂直俯視'],
  ['Reset to full globe view', '重設為完整地球視角'],
  ['Reset map to north up', '重設地圖方向為正北'],
  ['Toggle straight-down and tilted map views', '切換垂直俯視與傾斜視角'],
  ['Reset map bearing to north', '將地圖方向重設為正北'],
  ['Reset camera and return to full globe view', '重設相機並返回完整地球視角'],
  ['Aircraft, vessels and nearby intelligence', '查看飛機、船舶與周邊資訊'],
  ['Launches, spacecraft and orbital context', '火箭發射、太空船與軌道資訊'],
  ['Live earthquakes and active fires, from USGS and NASA', '美國地質調查局與 NASA 的地震、野火資訊'],
  ['Begin with a clean globe', '從乾淨的地球視圖開始'],
  ['Working…', '作業中…'],
  ['Loading live data', '正在載入即時資料'],
  ['Display', '顯示'],
  ['Context', '情境資訊'],
  ['Earthquakes', '地震'],
  ['Fires', '野火'],
  ['GROUND STATION · PROVIDER SETTINGS', '服務與 API 金鑰設定'],
  ['Power up the globe', '設定地圖與資料服務'],
  ["The globe already flies keyless. Every key below switches on another real feed — paste one and it's saved into this app's local configuration, then the server restarts itself. Server-side keys stay on this machine; Google Maps and Cesium ion run in the browser and must be provider-restricted. Keys you configured elsewhere are shown but never touched.", '未設定金鑰也能使用基本地圖。輸入金鑰後會儲存在本機設定並重新啟動服務；Google Maps 與 Cesium ion 金鑰會供瀏覽器使用，請在服務商端限制用途。'],
  ['GET KEY ↗', '申請金鑰 ↗'],
  ['MANAGE ↗', '管理金鑰 ↗'],
  ['BROWSER-SIDE', '瀏覽器使用'],
  ['SAVE KEYS', '儲存金鑰'],
  ['ESC TO CLOSE', '按 Esc 關閉'],
  ["The Google Maps key buys the photorealistic planet — everything else stacks on top.", 'Google Maps 金鑰可啟用擬真 3D 地球，其餘服務可按需求設定。'],
  ['The photorealistic 3D planet + place search', '擬真 3D 地球與地點搜尋'],
  ['Voice control — talk to the planet', '語音控制地圖'],
  ['Live ships, worldwide', '全球即時船舶資料'],
  ['Live active-fire detections', '即時野火偵測'],
  ['Real live traffic (keyless runs a simulation)', '即時交通資訊（無金鑰時為模擬）'],
  ['Bing imagery map stacks + world terrain', 'Bing 影像圖層與全球地形'],
  ['More flight-polling credits (anonymous works without)', '提高航班資料查詢額度'],
  ['Higher space-missions request allowance', '提高太空任務資料查詢額度'],
  ['Close key setup', '關閉金鑰設定'],
]);

function translateNode(root = document) {
  for (const node of root.querySelectorAll?.('*') || []) {
    if (node.children.length !== 0) continue;
    const value = node.textContent?.trim();
    if (TEXT.has(value)) node.textContent = TEXT.get(value);
  }
  for (const el of root.querySelectorAll?.('[title]') || []) {
    const title = el.getAttribute('title');
    if (TEXT.has(title)) el.setAttribute('title', TEXT.get(title));
    else if (title === 'Collapse panel') el.setAttribute('title', '收合面板');
    else if (title === 'Expand panel') el.setAttribute('title', '展開面板');
  }
  for (const el of root.querySelectorAll?.('[aria-label]') || []) {
    const value = el.getAttribute('aria-label');
    if (TEXT.has(value)) el.setAttribute('aria-label', TEXT.get(value));
  }
  for (const el of root.querySelectorAll?.('[placeholder]') || []) {
    const value = el.getAttribute('placeholder');
    if (TEXT.has(value)) el.setAttribute('placeholder', TEXT.get(value));
  }
}

export function installTraditionalChinese() {
  translateNode();
  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      if (entry.type === 'characterData') {
        const value = entry.target.textContent?.trim();
        if (TEXT.has(value)) entry.target.textContent = TEXT.get(value);
      }
      for (const n of entry.addedNodes) {
        if (n.nodeType === 1) translateNode(n);
        else if (n.nodeType === 3 && TEXT.has(n.textContent?.trim())) n.textContent = TEXT.get(n.textContent.trim());
      }
    }
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
}
