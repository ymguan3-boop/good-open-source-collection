import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const work = join(root, '.work', 'upstream');
const vite = join(work, 'node_modules', 'vite', 'bin', 'vite.js');
const dist = join(work, 'dist', 'index.html');
const logDir = join(root, 'logs');
const url = 'http://127.0.0.1:4175/';
const noBrowser = process.argv.includes('--no-browser');
mkdirSync(logDir, { recursive: true });

function findChrome() {
  const candidates = [
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find(path => existsSync(path));
}

function log(message) {
  appendFileSync(join(logDir, 'browser-launch.log'), `${new Date().toISOString()} ${message}\n`);
}

async function ready() {
  try {
    const page = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!page.ok || !(await page.text()).includes('<title>上帝之眼・台灣版</title>')) return false;
    const asset = await fetch(`${url}branding/quick-menu-logo-user.png`, {
      method: 'HEAD', signal: AbortSignal.timeout(1500),
    });
    return asset.ok && (asset.headers.get('content-type') || '').includes('image/png');
  } catch {
    return false;
  }
}

async function main() {
  if (!existsSync(dist)) throw new Error('找不到已建置的網頁介面（dist）。');
  if (!existsSync(vite)) throw new Error('找不到本機網頁服務套件。');
  if (!(await ready())) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const stdout = openSync(join(logDir, `browser-service-${stamp}.stdout.log`), 'a');
    const stderr = openSync(join(logDir, `browser-service-${stamp}.stderr.log`), 'a');
    let service;
    try {
      service = spawn(process.execPath, ['--use-system-ca', vite, 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
        cwd: work, detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr],
      });
      service.unref();
    } finally {
      closeSync(stdout);
      closeSync(stderr);
    }
    log(`啟動本機網頁與圖資服務 PID=${service.pid}`);
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline && !(await ready())) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!(await ready())) throw new Error('本機網頁服務未能在 45 秒內就緒；請查看 logs/browser-service-*.stderr.log。');
  } else {
    log('沿用已就緒的本機網頁服務。');
  }
  if (!noBrowser) {
    const chrome = findChrome();
    if (!chrome) throw new Error('找不到 Google Chrome，請確認已安裝 Chrome。');
    const chromeProfile = join(logDir, 'chrome-profile');
    mkdirSync(chromeProfile, { recursive: true });
    const opener = spawn(chrome, [`--user-data-dir=${chromeProfile}`, '--no-first-run', '--new-window', url], {
      detached: true, windowsHide: false, stdio: 'ignore',
    });
    const result = await new Promise((resolve, reject) => {
      opener.once('error', reject);
      opener.once('spawn', () => {
        const timer = setTimeout(() => resolve({ running: true }), 1500);
        opener.once('exit', (code, signal) => {
          clearTimeout(timer);
          resolve({ running: false, code, signal });
        });
      });
    });
    if (!result.running && result.code !== 0) {
      throw new Error(`Chrome 無法開啟頁面（結束代碼 ${result.code ?? result.signal}）。`);
    }
    opener.unref();
    log(`已直接呼叫 Chrome，PID=${opener.pid}，狀態=${result.running ? '持續執行' : '已交由現有 Chrome 視窗處理'}，網址=${url}，獨立設定檔=${chromeProfile}`);
  }
  process.stdout.write(`${url}\n`);
}

main().catch(error => {
  log(`啟動失敗：${error.message}`);
  process.stderr.write(`上帝之眼・台灣版瀏覽器模式無法開啟：${error.message}\n`);
  process.exitCode = 1;
});
