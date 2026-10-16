import JSZip from 'jszip';

// Turns the tables of an assistant reply (Markdown) into a real .xlsx workbook, locally in the browser.
// One sheet per table, numbers stored as numbers, a frozen header row, plus a "說明" sheet with the
// remaining text (sources, calculation basis, data gaps). Nothing is sent anywhere.
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = value => String(value ?? '').replace(XML_ILLEGAL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text of a Markdown inline fragment. */
export function plainText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/, '• ').trim();
}
const splitRow = line => {
  const text = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return text.split(/(?<!\\)\|/).map(cell => plainText(cell.replace(/\\\|/g, '|')));
};
const isSeparator = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

/** Tables found in the Markdown, each with the closest preceding heading/line as its title. */
export function extractMarkdown(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/), tables = [], notes = [];
  let lastLabel = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('|') && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const header = splitRow(line), rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      i--;
      tables.push({ title: lastLabel || `表格${tables.length + 1}`, header, rows });
      lastLabel = '';
      continue;
    }
    const text = plainText(line.replace(/^#{1,6}\s*/, ''));
    if (!text) continue;
    notes.push({ text, heading: /^#{1,6}\s/.test(line) });
    if (!/^[-*•]\s|^\d+[.、)]\s/.test(text)) lastLabel = text.replace(/[：:]$/, '').slice(0, 60);
  }
  return { tables, notes };
}
export const hasMarkdownTable = markdown => extractMarkdown(markdown).tables.length > 0;

const NUMBER = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
function cellValue(raw) {
  const text = String(raw ?? '').trim();
  if (NUMBER.test(text) && !/^-?0\d/.test(text)) {
    const number = Number(text.replace(/,/g, ''));
    if (Number.isFinite(number) && Math.abs(number) < 1e15) return { number, decimals: /\.\d+$/.test(text) };
  }
  return { text };
}
const columnName = index => { let name = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name; return name; };
const textWidth = text => [...String(text)].reduce((width, ch) => width + (/[⺀-鿿＀-￯]/.test(ch) ? 2 : 1), 0);

function sheetName(title, used) {
  const base = String(title || '工作表').replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || '工作表';
  let name = base, n = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 27 - String(n).length)}-${n++}`;
  used.add(name.toLowerCase());
  return name;
}

function tableSheet({ header, rows }) {
  const width = Math.max(header.length, ...rows.map(row => row.length), 1), data = [header, ...rows.map(row => Array.from({ length: width }, (_, i) => row[i] ?? ''))];
  const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(8, ...data.map(row => Math.max(...String(row[c] ?? '').split('\n').map(textWidth), 0))) + 2));
  const body = data.map((row, r) => `<row r="${r + 1}"${r === 0 ? ' ht="24" customHeight="1"' : ''}>${Array.from({ length: width }, (_, c) => {
    const ref = `${columnName(c)}${r + 1}`, value = r === 0 ? { text: row[c] ?? '' } : cellValue(row[c]);
    if (r === 0) return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${esc(value.text)}</t></is></c>`;
    if (value.number !== undefined) return `<c r="${ref}" s="${value.decimals ? 4 : 3}"><v>${value.number}</v></c>`;
    return `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${esc(String(value.text).slice(0, 32000))}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${columnName(width - 1)}${data.length}"/></worksheet>`;
}
function notesSheet(lines) {
  const body = lines.map((line, i) => `<row r="${i + 1}"><c r="A${i + 1}" s="${line.heading ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${esc(String(line.text).slice(0, 32000))}</t></is></c></row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="110" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft JhengHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf></cellXfs></styleSheet>`;

/** Builds the workbook Blob from an assistant reply; throws when there is no table. */
export async function buildXlsxFromMarkdown(markdown, { program = '上帝之眼・台灣版', exportedAt = new Date() } = {}) {
  const { tables, notes } = extractMarkdown(markdown);
  if (!tables.length) throw new Error('這則回覆沒有表格可匯出。');
  const used = new Set(['說明']), sheets = tables.map(table => ({ name: sheetName(table.title, used), xml: tableSheet(table) }));
  const info = [
    { text: '匯出說明', heading: true },
    { text: `匯出時間：${exportedAt.toLocaleString('zh-TW')}` },
    { text: `來源程式：${program}（本機匯出，未經外部服務）` },
    { text: '表格數值為程式依已載入圖資在本機計算的結果；模型文字只是解讀，請以表格與下列來源、限制為準。' },
    ...(notes.length ? [{ text: '' }, { text: '回覆內容（來源、計算依據、資料缺口）', heading: true }, ...notes] : []),
  ];
  sheets.push({ name: '說明', xml: notesSheet(info) });
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheet.xml));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}

export function exportFileName(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `上帝之眼_分析結果_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.xlsx`;
}
