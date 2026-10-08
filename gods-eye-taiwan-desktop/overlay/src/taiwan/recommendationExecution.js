/** Explicit adoption ends the recommendation discussion; only registered work may run. */
export function adoptsRecommendation(text){
  return /^(?:請|麻煩)?(?:按|照|依)(?:照)?\s*(?:你(?:的)?|AI(?:的)?|目前(?:的)?)?\s*建議(?:方案)?(?:執行|做|辦|規劃)?[。！!\s]*$/i.test(String(text||'').trim());
}
/** Preserve evidence/results while removing subsequent advice sections from confirmed output. */
export function executionResultsOnly(markdown){
  const out=[];let skipLevel=null,code=false;
  for(const line of String(markdown||'').split('\n')){
    if(/^\s*```/.test(line)){code=!code;if(!skipLevel)out.push(line);continue;}
    const heading=!code&&line.match(/^\s*(#{1,6})\s+(.+)$/);
    if(heading){
      const level=heading[1].length,title=heading[2].replace(/\*\*/g,'').trim();
      if(skipLevel&&level<=skipLevel)skipLevel=null;
      if(!skipLevel&&/^(?:三點|三項|後續|下一步|可執行的)?(?:查核|修正|改善|執行)?建議(?:事項|方案)?$|^下一步$/.test(title)){skipLevel=level;continue;}
    }
    if(!skipLevel)out.push(line);
  }
  return out.join('\n').trim();
}
