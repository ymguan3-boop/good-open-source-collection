// 清冊「內容描述（原文）」的中文語意規則抽取：地物、行為、面積、否定／疑似／核准語句與 R01～R08 初篩。
// 全部是可重現的規則（非 LLM）：每個抽取值都附原文證據片段，信心一律標「規則抽取，待人工確認」。
export const TEXT_RULE_VERSION = 'text-rules-2026.10.27';

const OBJECTS = [
  ['鐵皮建物', /鐵皮(?:屋|建物|造|棚|廠|搭建)?|鋼構|鋼骨|彩鋼/, 'structure'],
  ['農舍', /農舍/, 'structure'],
  ['農機具室／資材室', /農機具室|農具室|資材室|倉庫/, 'structure'],
  ['工寮', /工寮|工作寮|工作棚/, 'structure'],
  ['貨櫃', /貨櫃/, 'structure'],
  ['建物（一般）', /建築物|建物|房屋|廠房|住宅|透天|新建|興建|營建|蓋(?:房|建)/, 'structure'],
  ['圍牆／圍籬', /圍牆|圍籬|籬笆|擋土牆/, 'fence'],
  ['鋪面', /鋪面|水泥地|鋪設|混凝土|瀝青|碎石|PC|級配/, 'paving'],
  ['停車場', /停車場|停車/, 'paving'],
  ['填土／整地', /填土|回填|墊高|堆土|土方|整地|剷平|開挖|挖掘/, 'bare'],
  ['裸露地', /裸露|光禿|無植被/, 'bare'],
  ['材料／廢棄物堆置', /堆置|堆放|堆積|棄置|傾倒|廢棄物|廢土|砂石|建材|資材堆/, 'bare'],
  ['植生／雜草／農作', /雜草|草生|植生|農作|種植|耕作|作物|水稻|稻田|果樹|綠化|休耕|草地/, 'vegetation'],
  ['魚塭／水池', /魚塭|池塘|水池|養殖/, 'water'],
  ['太陽能設施', /太陽能|光電/, 'structure'],
  ['施工告示牌', /告示牌|施工牌/, 'sign'],
];
const HUMAN_FACILITY = new Set(['鐵皮建物', '農機具室／資材室', '工寮', '貨櫃', '圍牆／圍籬', '太陽能設施']);
const NEGATION = /(?:無|未|沒有|並無|不見|未見|非|不是|不含|不得|尚無|查無)\s*[^，。；、,.;\n]{0,5}$/;
const ACTIONS = [['新增／興建', /新增|新建|興建|新設|增建|搭建|蓋/], ['施作／施工', /施作|施工|工程/], ['整地／開挖', /整地|開挖|挖掘|剷平|填土|回填/], ['拆除', /拆除|拆照|拆毀|已拆/], ['堆置', /堆置|堆放|堆積|棄置|傾倒/], ['鋪設', /鋪設|鋪面|舖設/], ['種植／耕作', /種植|耕作|栽種|墾植|耕種/], ['使用／變更', /使用|變更|營業|經營/]];
const SUSPICION = /疑似|可能|疑為|疑有|研判|似為|似乎|應為|推測|待確認|待查/;
const ACCESS = /無法(?:進入|勘查|查證|確認|目視|到達)|未能(?:進入|確認)|查證受限|不得其門而入|大門深鎖|圍籬(?:遮蔽|阻擋)|遭阻擋|無人應門/;
const APPROVAL = /核准|核定|許可|同意|備查|核發|建照|使照|執照|容許使用|雜項|免辦|合法/;
const ILLEGAL_HINT = /未經(?:申請|核准|許可|同意)|未(?:申請|取得|辦理|經)|無(?:建築執照|使用執照|建照|使照|許可|核准|農業用地作農業使用證明|農業設施容許)|(?<![非無未不])違法|(?<![非無未不])違規(?!案)|違反|行政處分|裁罰|罰鍰|限期(?:改善|拆除|恢復)|擅自|非法|無照/;
const OVERRUN = /超出|逾越|超過(?:核准|核定|許可)|未依(?:核定|核准|計畫|圖說)|不符(?:核准|核定)|範圍外/;
const DUMPING = /(?:不明|來源不明)(?:土方|土石)|傾倒|棄置|非法(?:堆|棄)|廢棄物|廢土/;
const VAGUE = /^[\s\S]{0,18}$/;
const VAGUE_PHRASES = /^(?:整地|新增建物|無明顯變異|施工告示牌|正常施工|施工中|整地中|農作|農地|自然變異)[。.\s]*$/;

const clauseOf = (text, index) => {
  const start = Math.max(text.lastIndexOf('\n', index), text.lastIndexOf('。', index), text.lastIndexOf('；', index), text.lastIndexOf(';', index)) + 1;
  const endCandidates = ['\n', '。', '；', ';'].map(mark => text.indexOf(mark, index)).filter(i => i >= 0);
  return { start, end: endCandidates.length ? Math.min(...endCandidates) : text.length };
};
const snippet = (text, index, length = 0, around = 14) => text.slice(Math.max(0, index - around), Math.min(text.length, index + length + around)).replace(/\s+/g, ' ');

const UNIT_FACTOR = { 平方公尺: 1, 平方米: 1, '㎡': 1, m2: 1, 公頃: 10000, 坪: 3.305785, 甲: 9699.17 };
const AREA_PATTERN = /(\d+(?:[,，]\d{3})*(?:\.\d+)?)\s*(平方公尺|平方米|㎡|m2|m²|公頃|坪|甲)/gi;

/** Areas written in the description, each with the role its surrounding words suggest. */
export function extractAreas(text) {
  const areas = [];
  for (const match of text.matchAll(AREA_PATTERN)) {
    const value = Number(match[1].replace(/[,，]/g, '')), unit = match[2].replace('m²', 'm2');
    if (!Number.isFinite(value)) continue;
    const before = text.slice(Math.max(0, match.index - 18), match.index), after = text.slice(match.index + match[0].length, match.index + match[0].length + 6);
    const around = before + after;
    const role = /未逾|未超過|不超過|以下|以內/.test(before + after) ? 'cap' : /核准|核定|許可|同意|核發/.test(around) ? 'approved' : /衛星|變異/.test(around) ? 'satellite' : 'claimed';
    areas.push({ value, unit, squareMetres: Math.round(value * (UNIT_FACTOR[unit] ?? 1) * 100) / 100, role, evidence: snippet(text, match.index, match[0].length) });
  }
  return areas;
}

/** Objects/actions/flags/areas from one description; every item carries its evidence snippet. */
export function analyzeDescription(description, { result = '', satelliteArea = null } = {}) {
  const text = String(description ?? '').replace(/\r/g, '');
  const entities = [], actions = [];
  for (const [label, pattern, group] of OBJECTS) {
    const regex = new RegExp(pattern.source, 'g');
    for (const match of text.matchAll(regex)) {
      const { start } = clauseOf(text, match.index), lead = text.slice(start, match.index), negated = NEGATION.test(lead.slice(-9));
      entities.push({ type: label, group, term: match[0], negated, evidence: snippet(text, match.index, match[0].length) });
      break;
    }
    // A term can be both asserted and negated in different clauses: look at every hit for the negation state.
    const all = [...text.matchAll(regex)];
    if (all.length > 1) {
      const states = all.map(match => NEGATION.test(text.slice(clauseOf(text, match.index).start, match.index).slice(-9)));
      const last = entities.findLast(entity => entity.type === label);
      if (last && states.some(Boolean) && states.some(state => !state)) last.mixed = true;
    }
  }
  for (const [label, pattern] of ACTIONS) { const m = pattern.exec(text); if (m) actions.push({ type: label, term: m[0], evidence: snippet(text, m.index, m[0].length) }); }
  // 「並無涉及違反…」這類否定語境不算命中：逐一檢查每個符合處前面同一子句是否有否定詞。
  const find = pattern => {
    for (const m of text.matchAll(new RegExp(pattern.source, 'g'))) {
      if (NEGATION.test(text.slice(clauseOf(text, m.index).start, m.index).slice(-9))) continue;
      return { hit: true, term: m[0], evidence: snippet(text, m.index, m[0].length) };
    }
    return { hit: false };
  };
  const flags = { suspicion: find(SUSPICION), accessLimited: find(ACCESS), approval: find(APPROVAL), illegalHint: find(ILLEGAL_HINT), overrun: find(OVERRUN), dumping: find(DUMPING) };
  const dumpingHit = flags.dumping.hit;
  const areas = extractAreas(text);
  const present = group => entities.some(entity => entity.group === group && !entity.negated);
  const absent = group => entities.some(entity => entity.group === group && entity.negated);
  const claims = {
    structure: present('structure') ? true : absent('structure') ? false : null,
    vegetation: present('vegetation') ? true : null,
    bare: present('bare') ? true : null,
    paving: present('paving') ? true : null,
    fence: present('fence') ? true : null,
    structureDenied: absent('structure') && !present('structure'),
  };
  const conclusion = /(?:非違規|無違規|未違規|符合規定|合法)/.test(text) ? '文字含「非違規／合法」語句' : /違規|違法|處分|裁罰/.test(text) ? '文字含違規／處分字詞（須辨別句意）' : null;

  const rules = {};
  // R01～R08 的語意是「原判非違規卻有疑點」，只對原查證結果為非違規（或未填）的案件計算；其他結果標「不適用」。
  const applies = !result || /非違規/.test(result);
  const hit = (code, ok, reasons) => { rules[code] = applies ? { hit: Boolean(ok), evidence: ok ? reasons.filter(Boolean).slice(0, 4) : [] } : { hit: false, notApplicable: true, evidence: [] }; };
  hit('R01', flags.illegalHint.hit, [flags.illegalHint.evidence]);
  hit('R02', flags.overrun.hit, [flags.overrun.evidence]);
  hit('R03', dumpingHit, [flags.dumping.evidence]);
  hit('R04', flags.accessLimited.hit, [flags.accessLimited.evidence]);
  hit('R05', flags.suspicion.hit, [flags.suspicion.evidence]);
  const facilities = entities.filter(entity => HUMAN_FACILITY.has(entity.type) && !entity.negated);
  hit('R06', facilities.length > 0, facilities.map(entity => `${entity.term}${entity.negated ? '（否定語境）' : ''}：${entity.evidence}`));
  const trimmed = text.trim();
  hit('R07', !trimmed || VAGUE_PHRASES.test(trimmed) || (VAGUE.test(trimmed) && !entities.length), [trimmed ? `原文僅「${trimmed.slice(0, 20)}」` : '原文空白']);
  // R08: area figures that differ clearly from the satellite change area (value difference only, not necessarily the same extent).
  const sat = Number.isFinite(satelliteArea) ? satelliteArea : null, r08 = [];
  if (sat !== null) {
    for (const area of areas) {
      const diff = Math.abs(sat - area.squareMetres), ratio = Math.max(sat, area.squareMetres) / Math.max(1e-6, Math.min(sat, area.squareMetres));
      if (area.role === 'cap') { if (sat > area.squareMetres + 100) r08.push(`文字稱未逾 ${area.squareMetres} m²，衛星變異面積 ${sat} m²：${area.evidence}`); }
      else if (diff >= 200 && ratio >= 2) r08.push(`文字 ${area.squareMetres} m²（${area.role}）與衛星變異 ${sat} m² 相差 ${diff.toFixed(0)} m²：${area.evidence}`);
    }
  }
  hit('R08', r08.length > 0, r08);
  return { entities, actions, areas, flags, claims, conclusion, rules, textLength: text.length, ruleVersion: TEXT_RULE_VERSION, confidence: '規則抽取，待人工確認' };
}

export const RULE_TITLES = {
  R01: '內容涉及未申請、未取得許可或具體違法疑義，仍判非違規', R02: '內容涉及超出核准範圍或未依核定計畫施作，仍判非違規', R03: '內容涉及疑似非法棄置廢棄物或不明來源土方，仍判非違規',
  R04: '內容記載無法進入、查證受限或無法確認現況，仍判非違規', R05: '內容使用「疑似」「可能」等未確定語句，仍判非違規', R06: '內容敘及鐵皮屋、圍籬、工寮或機具等常見人為設施，仍判非違規',
  R07: '查證內容過於空泛，尚難確認判斷依據，仍判非違規', R08: '查報所載面積與衛星變異面積明顯不同（量值初篩）', R09: '查報內容與照片／航照未據一致（R09-A 原查證照片、R09-B 同期航照）', R10: '同一地號或 50 公尺環域跨期重複變異',
};
