// Model text never enters HTML without escaping. Only known presentation tags are emitted.
const escape = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function imageUrl(value) {
  try { const url=new URL(value,location.origin);return url.protocol==='https:' || (url.origin===location.origin && url.protocol==='http:') ? url.href : null; } catch {return null;}
}
function inline(value) {
  const images=[];
  const links=[];
  const text=String(value).replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g,(_,alt,url)=>{
    const safe=imageUrl(url);if(!safe)return alt || '圖片網址無效';
    const index=images.length;images.push(`<figure class="tw-chat-figure"><button data-act="chat-image" data-image-url="${escape(safe)}" data-image-alt="${escape(alt)}">顯示圖片：${escape(alt || 'AI 提供的圖片')}</button><figcaption>圖片由回覆提供；點擊後連線至圖片來源。</figcaption></figure>`);return `\u0000IMAGE${index}\u0000`;
  }).replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g,(_,label,url)=>{
    const safe=imageUrl(url);if(!safe)return label;
    const index=links.length;links.push(`<a href="${escape(safe)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`);return `\u0000LINK${index}\u0000`;
  });
  return escape(text).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/\u0000IMAGE(\d+)\u0000/g,(_,index)=>images[Number(index)] || '').replace(/\u0000LINK(\d+)\u0000/g,(_,index)=>links[Number(index)] || '');
}
const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(s=>s.trim().replace(/\\\|/g,'|'));
const separator=line=>cells(line).every(cell=>/^:?-{3,}:?$/.test(cell));
function table(header,rows) {
  const charts=[];
  for(let col=1;col<header.length;col++) {
    const values=rows.map(row=>{const raw=String(row[col] || '').replace(/\*\*/g,'').trim();const m=raw.match(/^(?:約\s*)?(-?\d[\d,]*(?:\.\d+)?)\s*([^\d]*)$/);return m ? {label:row[0],value:Number(m[1].replace(/,/g,'')),unit:m[2].trim(),raw} : null;});
    if(values.length<2 || values.some(v=>!v || !Number.isFinite(v.value)) || new Set(values.map(v=>v.unit)).size!==1)continue;
    const max=Math.max(...values.map(v=>Math.abs(v.value)),1);
    charts.push(`<details class="tw-chat-chart"><summary>${inline(header[col])} · 數值圖表</summary><p class="tw-note">依表格數值繪製；各列使用相同單位${values[0].unit ? '（'+escape(values[0].unit)+'）' : ''}。</p>${values.map(v=>`<div class="tw-chart-row"><span>${inline(v.label)}</span><div class="tw-chart-track"><i style="width:${Math.abs(v.value)/max*100}%" class="${v.value<0 ? 'negative' : ''}"></i></div><b>${escape(v.raw)}</b></div>`).join('')}</details>`);
  }
  return `<div class="tw-chat-table"><table><thead><tr>${header.map(cell=>`<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${Array.from({length:header.length},(_,i)=>`<td>${inline(row[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${charts.join('')}`;
}
export function renderChatMarkdown(value,{compact=false}={}) {
  const text=String(value || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi,'').replace(/<analysis>[\s\S]*?(?:<\/analysis>|$)/gi,'');
  const source=text.split('\n');let code=false;const lines=[];
  for(let i=0;i<source.length;i++) {
    const line=source[i];
    if(/^\s*```/.test(line)){lines.push(code ? '</code></pre>' : '<pre><code>');code=!code;continue;}
    if(code){lines.push(escape(line)+'\n');continue;}
    if(line.includes('|') && i+1<source.length && separator(source[i+1]) && cells(line).length===cells(source[i+1]).length) {
      const header=cells(line).slice(0,32),rows=[];i+=2;
      while(i<source.length && source[i].includes('|') && source[i].trim() && rows.length<200){rows.push(cells(source[i]).slice(0,32));i++;}i--;lines.push(table(header,rows));continue;
    }
    const heading=line.match(/^\s*#{1,6}\s+(.+)$/);
    if(heading){lines.push(`<h4>${inline(heading[1])}</h4>`);continue;}
    const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
    if(compact && !line.trim())continue;
    lines.push(bullet ? `<div class="tw-md-item">• ${inline(bullet[1])}</div>` : line.trim() ? `<div>${inline(line)}</div>` : '<br>');
  }
  if(code)lines.push('</code></pre>');
  return lines.join('');
}
