
const TEXT = new Map([
  ['DATA LAYERS', '圖資管理'],
  ['CCTV', '即時影像'],
  ['SCENES', '場景'],
  ['ACTIVE STYLE', '目前顯示'],
  ['NORMAL', '一般'],
  ['NEW', '新增'],
  ['DEL', '刪除'],
  ['START', '開始'],
  ['STOP', '停止'],
  ['NEXT', '下一個'],
  ['PREV', '上一個'],
  ['FOCUS', '定位'],
  ['READY', '就緒'],
]);

function translateNode(root = document) {
  for (const node of root.querySelectorAll?.('*') || []) {
    if (node.children.length !== 0) continue;
    const value = node.textContent?.trim();
    if (TEXT.has(value)) node.textContent = TEXT.get(value);
  }
  for (const el of root.querySelectorAll?.('[title]') || []) {
    const title = el.getAttribute('title');
    if (title === 'Collapse panel') el.setAttribute('title', '收合面板');
  }
}

export function installTraditionalChinese() {
  translateNode();
  const observer = new MutationObserver((entries) => {
    for (const entry of entries) {
      for (const n of entry.addedNodes) if (n.nodeType === 1) translateNode(n);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
