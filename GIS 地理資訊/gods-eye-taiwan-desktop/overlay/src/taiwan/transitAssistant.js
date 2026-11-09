import {adoptsRecommendation} from './recommendationExecution.js';
/** Operational transit messages are handled by the workflow, never by a text-only model. */
export function transitMessageIntent(text,{hasRequest=false,active=false}={}){
 const value=String(text||'').trim();
 if(/Gemini|OpenRouter|語音/i.test(value)&&!/TDX|大眾運輸|運輸/i.test(value))return null;
 if(adoptsRecommendation(value)||/^(?:請)?(?:採用|確認|選擇|使用)?\s*(?:建議)?\s*([123一二三])[。！!\s]*$/.test(value))return hasRequest||active?'confirm':null;
 if((hasRequest||active)&&/原因|為什麼|怎麼(?:辦|解決)|解決方案|沒反應|卡住/.test(value))return 'diagnose';
 if((hasRequest||active)&&/爬蟲|爬取|擷取|抓取/.test(value)&&!/票價|公告|地形|圖資/.test(value))return 'fallback';
 if(/爬蟲|爬取|擷取|抓取|查(?:詢|核).*(?:官方|票價)|更新.*票價/.test(value))return /票價|交通|班次|TDX|運輸/.test(value)?'sources':null;
 if(/TDX|額度|配額|金鑰|串接|串聯|服務狀態/i.test(value)&&(/運輸|交通|票價|TDX/i.test(value)||(hasRequest||active)&&/額度|配額/i.test(value)))return 'service';
 if((hasRequest||active)&&(/^[？?]+$/.test(value)||/^(?:請問)?(?:好了嗎|完成了嗎|完成沒|好了沒|結果呢|有結果嗎|執行結果|規劃結論|規劃結果|目前進度|進度|怎麼沒(?:結果|回覆))[？?。\s]*$/.test(value)))return 'status';
 if((hasRequest||active)&&/(?:改成|不要搭|不搭|只搭|便宜|少走|走路少|少轉乘|晚\s*\d+|錯過|重新規劃|現在出發|自強|莒光|區間|不限|都可以)/.test(value))return 'modify';
 if((hasRequest||active)&&/班次|轉乘|抵達|車種|旅程.*規劃|交通.*規劃/.test(value))return 'modify';
 if((hasRequest||active)&&/票價|方案.*(?:分析|比較)|規劃.*(?:分析|結論|結果)/.test(value))return 'status';
 return null;
}
export function transitConfirmationIndex(text){
 const value=String(text||'').trim(),match=value.match(/(?:建議)?\s*([123一二三])[。！!\s]*$/);
 if(match)return {'1':0,'2':1,'3':2,'一':0,'二':1,'三':2}[match[1]];
 return transitMessageIntent(value,{hasRequest:true})==='confirm'?0:null;
}
export function rateLimitText(limit,now=Date.now()){
 if(!limit)return '';
 const end=limit.resetAt||limit.retryAt,seconds=end?Math.max(0,Math.ceil((Date.parse(end)-now)/1000)):null;
 const countdown=seconds===null?'':`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 const reason=limit.kind==='quota'?'TDX 用量額度已滿':limit.kind==='rate'?'TDX 查詢頻率超限':'TDX 查詢頻率或用量受到限制';
 return reason+'。'+(limit.resetAt?'官方額度恢復倒數：'+countdown:limit.retryAt?(limit.authoritative?'官方允許重試倒數：':'下次重試倒數（本機退避，非額度恢復時間）：')+countdown:'官方未提供額度恢復時間，無法顯示可信倒數。');
}
export function transitServiceText(status,fareStatus){
 const limits=status.limits||[];
 return `## 運輸資料服務狀態\nTDX：${status.configured?'已設定 Client ID／Secret':'尚未設定 Client ID／Secret'}；${status.authenticated?'已取得有效存取權杖':'目前沒有有效權杖，下一次查詢會自動驗證'}。\n${limits.length?limits.map(l=>(l.kind==='quota'?'TDX 用量額度已滿':l.kind==='rate'?'TDX 查詢頻率超限':'TDX 查詢頻率或用量受到限制')+'；'+(l.notice||'請依下方倒數等待。')).join('\n'):'目前沒有已記錄的有效限制；這不代表所有服務均有訂閱權限或用量充足。'}\n\n地圖圖層數量與 TDX 串接無關，查詢會直接由資料服務執行，不需要先手動載入交通圖層。\n票價服務支援已登錄官方公開網頁擷取與驗證快取；不能把未確認的數字當成正式報價。${fareStatus?'\n目前官方票價快取：'+Object.entries(fareStatus.modes||{}).map(([mode,s])=>mode+' '+(s.records??s.count??s.entries??'未提供')+' 筆').join('、'):''}\n\n${limits.some(l=>l.kind==='quota'&&!l.resetAt)?'官方未提供此帳號額度重置時刻；不以每日固定時間猜測。':''}`;
}
