const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>value?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'來源未提供';
export const hasCctvScreenshot=result=>/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(result?.screenshot||'');
export function cctvResultMessage(result){
  const labels={person:'行人',bicycle:'自行車',car:'汽車',motorcycle:'機車',bus:'公車',truck:'卡車'};
  const counts=Object.entries(labels).map(([key,label])=>`- ${label}：${Number.isFinite(result.counts?.[key])?result.counts[key]:'無法判定'}`).join('\n');
  return {role:'assistant',cctvResult:result,content:`## CCTV 辨識結果\n攝影機：${result.cameraName||result.cameraId}\n來源：${result.source||'來源未提供'}\n位置：${result.camera?.lat??'未知'}, ${result.camera?.lon??'未知'}\n截圖取得時間：${time(result.capturedAt)}\n本機接收時間：${time(result.receivedAt)}\n辨識完成時間：${time(result.completedAt)}\n攝影機時間：${time(result.sourceObservedAt)}\n請求：${result.requestId}\n辨識方式：${result.method||'本機 AI'}\n模型：${result.modelName||result.model||'來源未提供'} · 執行環境：${result.backend||'來源未提供'}\n\n${counts}\n\n壅塞程度：${result.congestion?.label||'無法判定'}\n\n${result.content||''}\n\nAI 視覺估計，不代表官方交通統計。`};
}
export function cctvContext(messages){return messages.filter(m=>m.cctvResult).slice(-4).map(m=>{const {screenshot,boxes,...metadata}=m.cctvResult;return {requestId:metadata.requestId,cameraId:metadata.cameraId,cameraName:metadata.cameraName,capturedAt:metadata.capturedAt,sourceObservedAt:metadata.sourceObservedAt,source:metadata.source,counts:metadata.counts,congestion:metadata.congestion,method:metadata.method,interpretation:metadata.content};});}
export function cctvFrameHtml(result,{preview=false}={}){
  if(!hasCctvScreenshot(result))return '';
  const width=Number(result.imageWidth)||640,height=Number(result.imageHeight)||480;
  const boxes=(result.boxes||[]).filter(box=>[box.x,box.y,box.width,box.height].every(Number.isFinite)).map(box=>`<g><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/><text x="${box.x}" y="${Math.max(14,box.y-3)}">${escape(box.className)} ${Math.round((box.score||0)*100)}%</text></g>`).join('');
  return `<figure class="tw-cctv-analysis-frame tw-cctv-fixed-frame" data-cctv-frame="${escape(result.requestId)}"><div class="tw-cctv-frame-image"><img ${preview?'':`data-act="cctv-image" data-request="${escape(result.requestId)}" role="button" tabindex="0"`} src="${escape(result.screenshot)}" alt="${escape(result.cameraName)} 本次實際辨識的固定 CCTV 截圖"><svg class="tw-cctv-boxes" viewBox="0 0 ${width} ${height}" aria-hidden="true">${boxes}</svg></div><figcaption>${escape(result.cameraName)} · 取得時間 ${escape(time(result.capturedAt))} · ${escape(result.method)}</figcaption>${boxes?`<button data-act="cctv-boxes" data-request="${escape(result.requestId)}">顯示／隱藏辨識框</button>`:''}</figure>`;
}
