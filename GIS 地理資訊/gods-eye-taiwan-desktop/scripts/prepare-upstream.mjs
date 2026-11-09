
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const lock = Object.fromEntries(readFileSync(resolve(root, 'UPSTREAM.lock'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(line => line.split(/=(.*)/s).slice(0,2)));
const dest = resolve(root, '.work', 'upstream');
if (!lock.repository || !/^[a-f0-9]{40}$/i.test(lock.commit || '')) throw new Error('UPSTREAM.lock 缺少有效 repository／commit。');
// A new installation never touches another checkout or its running service.
// The destination guard also prevents the non-idempotent overlay being reapplied.
if(existsSync(dest))throw new Error('上游工作區已存在；請在全新資料夾安裝，本腳本不刪除既有工作區或圖資。');
mkdirSync(resolve(root, '.work'), { recursive: true });
execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', lock.repository, dest], { stdio: 'inherit' });
execFileSync('git', ['-C', dest, 'checkout', lock.commit], { stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'scripts', 'apply-overlay.mjs'), dest], { stdio: 'inherit' });
console.log(`瀏覽器版上游已準備完成（${lock.commit}）；接著安裝 npm 套件及建置網頁。`);
