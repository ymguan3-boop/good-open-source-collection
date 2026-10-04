const unescape=value=>String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
export async function searchVoiceNews(query){
 query=String(query||'').trim();if(!query||query.length>180)throw Error('新聞搜尋主題需為 1 至 180 字');
 const url=new URL('https://news.google.com/rss/search');url.search=new URLSearchParams({q:query,hl:'zh-TW',gl:'TW',ceid:'TW:zh-Hant'});
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`新聞來源 HTTP ${response.status}`);
 const xml=await response.text();if(xml.length>2000000)throw Error('新聞來源內容過大');
 const field=(item,name)=>unescape(item.match(new RegExp('<'+name+'(?: [^>]*)?>([\\s\\S]*?)</'+name+'>'))?.[1]);
 const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,8).map(m=>({title:field(m[1],'title'),url:field(m[1],'link'),publishedAt:field(m[1],'pubDate'),source:field(m[1],'source')})).filter(i=>i.title&&/^https:\/\//.test(i.url));
 return {ok:true,query,observedAt:new Date().toISOString(),provider:'Google News 公開 RSS',items,limitation:'公開新聞索引，非全體民意統計；發布時間與內容請回查原報導。沒有結果不代表沒有事件。'};
}
