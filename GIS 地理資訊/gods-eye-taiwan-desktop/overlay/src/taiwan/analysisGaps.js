/** Presentation only: repeated query warnings must never become added building counts. */
export function categorizeAnalysisGaps(warnings=[]){
  const groups=new Map();
  for(const value of warnings){
    const text=String(value||'').trim();if(!text)continue;
    const category=/建物.*(?:索引|處理|完整|圖磚)|(?:索引|處理).*不完整/.test(text)?'建物資料完整性'
      :/429|額度|用量|限流|rate.limit/i.test(text)?'服務額度'
      :/401|403|權限|授權|認證/.test(text)?'服務權限'
      :/逾時|timeout|fetch|網路|連線|服務.*不可用/i.test(text)?'連線與服務'
      :/幾何|座標|geometry|invalid|無效/i.test(text)?'幾何與座標'
      :/摘要|原文|檢索|省略|媒體|影片|影像/.test(text)?'紀錄涵蓋與媒體'
      :/來源|版本|日期/.test(text)?'來源與版本':'分析涵蓋與限制';
    let group=groups.get(category);if(!group)groups.set(category,group={category,count:0,details:new Map(),tileRanges:[]});
    group.count++;
    const tiles=text.match(/已讀\s*(\d+)\s*\/\s*(\d+)\s*個圖磚/);
    if(tiles){group.tileRanges.push([Number(tiles[1]),Number(tiles[2])]);continue;}
    const key=text.replace(/https?:\/\/\S+/g,'[來源網址]').replace(/\d+(?:\.\d+)?/g,'#');
    if(!group.details.has(key))group.details.set(key,text.slice(0,240));
  }
  return [...groups.values()].map(g=>{
    const details=[...g.details.values()];
    if(g.tileRanges.length){const read=g.tileRanges.map(t=>t[0]),total=g.tileRanges.map(t=>t[1]);details.unshift(`索引／處理未完整：${g.tileRanges.length} 筆相似訊息；已讀圖磚範圍 ${Math.min(...read)}–${Math.max(...read)}，索引總量範圍 ${Math.min(...total)}–${Math.max(...total)}。查詢網格可能重疊，圖磚數不可加總為建物棟數。`);}
    return {category:g.category,messageCount:g.count,distinctIssues:details.length,details:details.slice(0,3),omittedIssueTypes:Math.max(0,details.length-3)};
  });
}
export function analysisGapsMarkdown(groups){
  if(!groups?.length)return '';
  return '### 資料缺口\n\n'+groups.map(g=>`- **${g.category}**：${g.details.join('；')}${g.omittedIssueTypes?`；另有 ${g.omittedIssueTypes} 類限制，保留於本次診斷索引。`:''}`).join('\n');
}
/** Compact repeated diagnostics in historical excerpts without changing the archived original. */
export function compactHistoricalGaps(text){
  const lines=String(text||'').split(/\r?\n/),diagnostics=lines.filter(line=>/建物.*(?:索引|處理).*不完整.*已讀\s*\d+\s*\/\s*\d+\s*個圖磚/.test(line));
  if(diagnostics.length<2)return String(text||'');
  const summary=analysisGapsMarkdown(categorizeAnalysisGaps(diagnostics)).replace(/^### 資料缺口\n\n/,'[歷史紀錄缺口彙整]\n');
  const matched=new Set(diagnostics);let inserted=false;
  return lines.flatMap(line=>{if(!matched.has(line))return [line];if(inserted)return [];inserted=true;return [summary];}).join('\n');
}
