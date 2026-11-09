// Translate provider status into user-facing explanations, without raw JSON.
export function liveDescription(id,stats={},enabled=false){
  const info={
    'ais-live-vessels':['船舶位置與航行動態','艘船舶','可查看船名、位置、航向與船速。訊號涵蓋會受設備及來源影響，沒有資料不代表海面沒有船。'],
    'local-firms':['衛星偵測到的地表熱點','個熱點','熱點可能來自火災或工業熱源，需另行查證，不能直接當成火災範圍。'],
    earthquakes:['最近 24 小時的地震事件','筆地震','可查看時間、震央與規模。使用 USGS 規模 2.5 以上事件，並非中央氣象署完整的台灣地震清冊。'],
    flights:['來源當下回傳的飛機位置','架飛機','可查看位置、高度與移動方向。訊號涵蓋不同，部分航機可能未顯示，不能當成所有在空中的飛機。'],
    traffic:['道路目前的順暢與壅塞情形','段道路','綠色順暢、黃色車速下降、紅色嚴重壅塞、紫色封路。顏色依 TomTom 車速相對於一般順暢車速的比例呈現；同一道路有多筆回報時，顯示較壅塞的情形，不代表各方向都相同。這不是逐車定位或車輛數量。'],
  }[id] || ['即時資料','筆資料','資料涵蓋範圍由來源決定。'];
  const count=Number(stats.count),date=stats.lastUpdate ? new Date(stats.lastUpdate) : null,error=String(stats.error || '');
  const missing=/not set|未輸入|尚未設定|need.*key|missing.*key/i.test(error);
  const state=stats.loading ? '正在取得資料，請稍候。' : missing ? '未輸入金鑰。請到「服務與 API 金鑰設定」輸入並儲存後再載入。' : error ? `目前無法完整取得資料：${friendlyError(error)}` : enabled ? '資料已開啟。' : '尚未開啟；按「載入」才會取得資料。';
  return [info[0],state,Number.isFinite(count) ? `目前顯示 ${count.toLocaleString('zh-TW')} ${info[1]}。${count===0 ? '目前未收到可顯示資料，不代表實際沒有事件或活動。' : ''}` : '',id==='traffic' ? `移動點位 ${Number(stats.dotCount)||0} 個；依路況比例呈現快慢，為車流示意，並非逐車定位。` : '',date && Number.isFinite(date.getTime()) ? `最近取得資料：${date.toLocaleString('zh-TW')}。` : '尚無成功取得資料的時間。',stats.stale ? '目前保留較早資料，請留意更新時間。' : '',stats.partial ? '目前僅顯示部分可取得資料，無法當成完整清冊。' : '',info[2]].filter(Boolean);
}
function friendlyError(error){
  if(/401|403/.test(error))return '服務拒絕連線，請確認金鑰是否有效、是否啟用此服務及是否仍有額度。';
  if(/429/.test(error))return '服務請求過於頻繁或額度不足，請稍後重試。';
  if(/timeout|timed out|network|fetch failed/i.test(error))return '服務暫時沒有回應，請確認網路後重新載入。';
  return /[\u3400-\u9fff]/.test(error) ? error : '來源暫時無法提供資料，請稍後重試。';
}
