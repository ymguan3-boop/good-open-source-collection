/** Keep upstream throttling evidence; never invent an account quota reset. */
export function tdxLimit(response,body='',now=Date.now()){
 const h=response.headers,raw=h?.get('retry-after');let retryAt=null,resetAt=null;
 if(raw){const n=Number(raw),date=Date.parse(raw);if(Number.isFinite(n)&&n>=0)retryAt=now+n*1000;else if(Number.isFinite(date))retryAt=Math.max(now,date);}
 const epoch=h?.get('x-ratelimit-reset'),delta=h?.get('ratelimit-reset');
 if(epoch&&Number.isFinite(Number(epoch))){const n=Number(epoch);resetAt=n>1e12?n:n>1e9?n*1000:null;}
 if(!resetAt&&delta&&Number.isFinite(Number(delta))&&Number(delta)>=0)resetAt=now+Number(delta)*1000;
 const quota=/quota|monthly[^\n]{0,50}(?:limit|exceed)|daily[^\n]{0,50}(?:limit|exceed)|配額|額度|點數不足|用量上限/i.test(String(body).slice(0,12000));
 const authoritative=!!(retryAt||resetAt);
 return {kind:quota?'quota':/rate|too many requests|頻率/i.test(body)?'rate':'usage-or-rate',httpStatus:response.status,retryAt:new Date(retryAt||resetAt||now+60000).toISOString(),resetAt:quota&&resetAt?new Date(resetAt).toISOString():null,authoritative,observedAt:new Date(now).toISOString(),notice:quota&&!resetAt?'官方確認用量限制，但未提供額度恢復時刻。':authoritative?'依官方回應等待；允許重試不保證額度已恢復。':'官方未提供重試時間，採本機 60 秒退避；非額度恢復倒數。'};
}
