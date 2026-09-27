
import { installTraditionalChinese } from './i18n.js';
import { ResourceGovernor } from './resourceGovernor.js';
import { mountShell } from './ui.js';

export function installTaiwanEdition({ components }) {
  document.documentElement.lang = 'zh-Hant-TW';
  document.title = '上帝之眼・台灣版';
  const viewer = components?.scene?.viewer;
  if (!viewer) throw new Error('Taiwan edition requires upstream scene.viewer');
  const governor = new ResourceGovernor(viewer, components?.scene?.tileset || null);
  const disposeI18n = installTraditionalChinese();
  const disposeUi = mountShell({ viewer, governor });
  const legacyKey = document.getElementById('key-setup-chip');
  if (legacyKey) legacyKey.hidden = true;
  return () => { disposeUi?.(); disposeI18n?.(); };
}
