// ASR may return simplified Chinese even when the reply language is zh-TW.
const traditional={臺:'台',县:'縣',湾:'灣',兰:'蘭',线:'線',载:'載',显:'顯',隐:'隱',乡:'鄉',镇:'鎮',边:'邊',区:'區',图:'圖',层:'層',铁:'鐵',轨:'軌',动:'動',飞:'飛',机:'機',标:'標',参:'參',测:'測',绘:'繪',资:'資',请:'請',帮:'幫',开:'開',换:'換',义:'義',云:'雲',东:'東',连:'連',莲:'蓮',门:'門',议:'議',览:'覽',这:'這',变:'變',个:'個',选:'選',择:'擇',围:'圍',语:'語',国:'國',后:'後',对:'對',确:'確',认:'認',当:'當',叠:'疊',园:'園',气:'氣',划:'劃',询:'詢',绍:'紹',么:'麼',为:'為',吗:'嗎'};
export const normalizeVoiceText=value=>String(value || '').replace(/./gu,char=>traditional[char] || char).replace(/心北市|欣北市/g,'新北市').replace(/宜藍縣/g,'宜蘭縣');
const normalize=value=>normalizeVoiceText(value).replace(/\s/g,'');
export const VOICE_COUNTY_NAMES=['臺北市','新北市','桃園市','臺中市','臺南市','高雄市','基隆市','新竹市','嘉義市','新竹縣','苗栗縣','彰化縣','南投縣','雲林縣','嘉義縣','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
const names=VOICE_COUNTY_NAMES;
export function parseVoiceScope(value,current){
  const text=normalize(value);
  if(/^(全台灣|全台|台灣|全國)$/.test(text))return {mode:'taiwan',label:'全台灣'};
  if(/^(全球|全世界|世界)$/.test(text))return {mode:'global',label:'全球'};
  if(/^(目前範圍|當前範圍)$/.test(text) && current)return {...current,label:current.mode==='taiwan'?'全台灣':current.county};
  if(/^(原始資料範圍|原始範圍)$/.test(text))return {mode:'original',label:'原始資料範圍'};
  const county=names.find(name=>normalize(name)===text);
  return county ? {mode:'county',county,label:county} : null;
}
export function scopeInUtterance(scope,utterance,current){
  const text=normalize(utterance);
  if(!scope || !text)return false;
  const said=phrases=>phrases.some(phrase=>{
    let index=text.indexOf(phrase);
    while(index>=0){const before=text.slice(Math.max(0,index-14),index);if(!/(?:不要|不用|不選|不是|別|取消|不想|不需要)[^，。；!?？]{0,8}$/.test(before))return true;index=text.indexOf(phrase,index+phrase.length);}return false;
  });
  if(said(['目前範圍','當前範圍']) && scope.mode===current?.mode && (scope.mode!=='county' || scope.county===current.county))return true;
  if(scope.mode==='taiwan')return said(['全台灣','全台','全國','台灣']);
  if(scope.mode==='global')return said(['全球','全世界','世界']);
  if(scope.mode==='original')return said(['原始資料範圍','原始範圍']);
  return said([normalize(scope.county)]);
}
// Read only a unique, non-negated geographic choice from the user's transcript.
export function extractVoiceScope(utterance,current){
  const choices=[...names.map(county=>({mode:'county',county,label:county})),{mode:'taiwan',label:'全台灣'},{mode:'global',label:'全球'},{mode:'original',label:'原始資料範圍'}];
  const text=normalize(utterance);
  let matches=choices.filter(scope=>scopeInUtterance(scope,utterance,current) && (scope.mode!=='taiwan' || /全台|全國|台灣(?:的|範圍|地區)/.test(text) || /^(?:請|我要|我選|就用)?台灣[。，！!?？]*$/.test(text)));
  if(matches.some(scope=>scope.mode==='county') && /全球地形/.test(text) && !/全世界|世界範圍|全球範圍|全球的/.test(text))matches=matches.filter(scope=>scope.mode!=='global');
  if(/目前範圍|當前範圍/.test(text) && current){const scope=parseVoiceScope('目前範圍',current);if(scopeInUtterance(scope,utterance,current) && !matches.some(item=>item.mode===scope.mode && item.county===scope.county))matches.push(scope);}
  return matches.length===1 ? matches[0] : null;
}
export function scopeCapabilities(item){
  if(item.kind==='loaded')return {modes:['original'],coverage:'匯入檔案的原始資料範圍，無法補齊檔案以外的資料'};
  if(item.id==='earthquakes')return {modes:['global'],coverage:'全球 USGS 地震事件，目前不提供獨立縣市資料'};
  if(item.id==='world-terrain' || item.kind==='basemap' && !/^nlsc/.test(item.id))return {modes:['global'],coverage:'全球串流來源，可移動視野到指定地區；不是獨立縣市圖資'};
  if(item.id==='taiwan-relief' || item.kind==='basemap')return {modes:['taiwan'],coverage:'全臺圖磚／地形來源，可定位縣市觀看；不是獨立縣市向量'};
  if(item.id==='nlsc-buildings')return {modes:['county','taiwan'],coverage:'官方服務有列出的縣市；全臺模式只串流目前視野涵蓋的服務，非全臺完整建物'};
  return {modes:['county','taiwan'],coverage:'支援全臺或22縣市範圍；即時來源只顯示當下回傳資料'};
}
export function scopeQuestion(item,capability,requested){
  const options=capability.modes.flatMap(mode=>mode==='county'?['指定縣市']:mode==='taiwan'?['全台灣']:mode==='global'?['全球']:['原始資料範圍']);
  return {ok:false,needsScope:true,requestedScope:requested?.label || null,question:requested ? `「${item.name}」沒有 ${requested.label} 的獨立範圍。${capability.coverage}。建議改用 ${options.join('或')}，要採用哪個範圍？` : `要載入「${item.name}」的哪個範圍？可選 ${options.join('或')}。`,availableScopes:options,coverage:capability.coverage};
}
