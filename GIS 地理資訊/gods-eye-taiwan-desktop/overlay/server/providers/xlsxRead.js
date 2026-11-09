// Minimal .xlsx reader (no external service): sheets → arrays of rows keeping the real Excel row number.
// Works in the browser and in Node (pass the JSZip class). Formulas are read as their cached values.
const decode = text => String(text ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const columnIndex = ref => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const textOf = xml => [...xml.matchAll(/<(?:x:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:x:)?t>/g)].map(m => decode(m[1])).join('');

export async function readWorkbook(JSZip, data) {
  const zip = await JSZip.loadAsync(data);
  const read = async name => { const file = zip.file(name); return file ? file.async('string') : ''; };
  const workbook = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels');
  const shared = [...(await read('xl/sharedStrings.xml')).matchAll(/<(?:x:)?si>([\s\S]*?)<\/(?:x:)?si>/g)].map(m => textOf(m[1]));
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));
  const sheets = [];
  for (const m of workbook.matchAll(/<(?:x:)?sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])?.[1] || ''), id = /r:id="([^"]+)"/.exec(m[0])?.[1];
    let target = targets.get(id) || ''; target = target.replace(/^\/?(?:xl\/)?/, 'xl/');
    const xml = await read(target), rows = [];
    for (const rowMatch of xml.matchAll(/<(?:x:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:x:)?row>)/g)) {
      const number = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1]), cells = [];
      for (const cell of (rowMatch[2] || '').matchAll(/<(?:x:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:x:)?c>)/g)) {
        const attrs = cell[1], body = cell[2] || '', type = /\bt="([^"]+)"/.exec(attrs)?.[1], ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const raw = /<(?:x:)?v>([\s\S]*?)<\/(?:x:)?v>/.exec(body)?.[1];
        let value = null;
        if (type === 'inlineStr') value = textOf(body);
        else if (raw !== undefined) value = type === 's' ? shared[Number(raw)] : type === 'str' || type === 'e' ? decode(raw) : type === 'b' ? raw === '1' : Number.isFinite(Number(raw)) ? Number(raw) : decode(raw);
        if (ref) cells[columnIndex(ref)] = value;
      }
      rows.push({ row: number, cells });
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
