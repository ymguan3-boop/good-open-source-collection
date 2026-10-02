const BASE = '/api/taiwan/ai';

export async function browserAi(path, { method='GET', data, signal } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,signal,
    headers:data === undefined ? {} : { 'Content-Type':'application/json' },
    body:data === undefined ? undefined : JSON.stringify(data),
    cache:'no-store',
    credentials:'same-origin',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `本機 AI 服務 ${response.status}`);
  return result;
}

export async function streamBrowserChat(data,{signal,onDelta=()=>{},onStatus=()=>{}}={}) {
  const response = await fetch(`${BASE}/chat-stream`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal,cache:'no-store',credentials:'same-origin'});
  if (!response.ok) { const value = await response.json(); throw new Error(value.error || `本機 AI 服務 ${response.status}`); }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let content = ''; let answer;
  try {
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value || new Uint8Array(),{stream:!chunk.done}).replace(/\r/g,'');
      let split;
      while ((split=pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0,split); pending = pending.slice(split+2);
        const event = frame.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
        const raw = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!raw) continue;
        const value = JSON.parse(raw);
        if (event === 'status') onStatus(value.message);
        if (event === 'reset') {content='';answer=undefined;onDelta('');}
        if (event === 'delta') { content += value.text; onDelta(content); }
        if (event === 'error') throw new Error(value.message);
        if (event === 'done') answer = {content,model:value.model};
      }
      if (chunk.done) break;
    }
    if (!answer) throw new Error('AI 連線中斷，請重新傳送');
    return answer;
  } finally { await reader.cancel().catch(() => {}); }
}
