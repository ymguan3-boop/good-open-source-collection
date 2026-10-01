
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect } from 'node:net';

const root = resolve(import.meta.dirname, '..');
const lock = Object.fromEntries(readFileSync(resolve(root, 'UPSTREAM.lock'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(line => line.split(/=(.*)/s).slice(0,2)));
const dest = resolve(root, '.work', 'upstream');
const serviceIsRunning = (await Promise.all([4173, 4175].map(port => new Promise(resolveReady => {
  const socket = connect({ host:'127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolveReady(true); });
  socket.once('error', () => resolveReady(false));
  socket.setTimeout(500, () => { socket.destroy(); resolveReady(false); });
})))).some(Boolean);
if (serviceIsRunning) {
  throw new Error('台灣版本機服務仍在執行。請先關閉服務，再重新準備上游；目前的 .work 資料不會被清除。');
}
if(existsSync(dest))throw new Error('上游工作區已存在；請在全新資料夾安裝，本腳本不刪除既有工作區或圖資。');
mkdirSync(resolve(root, '.work'), { recursive: true });
execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', lock.repository, dest], { stdio: 'inherit' });
execFileSync('git', ['-C', dest, 'checkout', lock.commit], { stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'scripts', 'apply-overlay.mjs'), dest], { stdio: 'inherit' });
console.log(`Prepared Taiwan edition against ${lock.commit}`);
