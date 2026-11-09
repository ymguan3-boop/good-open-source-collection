import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { KEY_SETUP_KEYS } from '../../src/keySetupCore.mjs';

const aliases = { openrouter:'OPENROUTER_API_KEY', gemini:'GEMINI_API_KEY', tdxClientId:'TDX_CLIENT_ID', tdxClientSecret:'TDX_CLIENT_SECRET' };
export const credentialNames = [...KEY_SETUP_KEYS.flatMap(item => item.envVars), ...Object.values(aliases)];
const folder = join(process.env.LOCALAPPDATA || '', 'GodsEyeTaiwan');
const filename = join(folder, 'credentials.dpapi');
let values = {};
let storageWarning = null;
let queue = Promise.resolve();
export function credentialName(name) {
  const mapped = aliases[name] || name;
  if (!credentialNames.includes(mapped)) throw new Error('不支援的服務欄位');
  return mapped;
}
async function protect(bytes, mode) {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) throw new Error('此金鑰儲存功能需要 Windows 使用者加密服務');
  const script = await readFile(new URL('./taiwan-dpapi.ps1',import.meta.url),'utf8');
  if (!['encrypt','decrypt'].includes(mode)) throw new Error('不支援的金鑰處理方式');
  return new Promise((resolve,reject) => {
    const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(exe, ['-NoLogo','-NoProfile','-NonInteractive','-Command',`& { ${script} } -Mode ${mode}`], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let output = ''; let completed = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Windows 金鑰加密服務逾時')); },15000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('無法啟動 Windows 金鑰加密服務')); });
    child.on('close', code => { clearTimeout(timer); completed = true; code === 0 ? resolve(Buffer.from(output.trim(),'base64')) : reject(new Error('無法解密或儲存金鑰，請確認使用相同 Windows 帳號')); });
    child.stdin.on('error', () => { if (!completed) reject(new Error('金鑰加密服務中斷')); });
    child.stdin.end(bytes.toString('base64'));
  });
}
let diskVersion=null;
async function currentVersion(){try{const info=await stat(filename);return `${info.mtimeMs}:${info.size}`;}catch(error){if(error.code==='ENOENT')return 'missing';throw error;}}
function applyValues(next){for(const name of Object.keys(values))delete process.env[name];values=next;Object.assign(process.env,values);}
async function reloadCredentials(){
  const version=await currentVersion();if(version===diskVersion)return;
  if(version==='missing'){applyValues({});diskVersion=version;storageWarning=null;return;}
  const decoded=JSON.parse((await protect(await readFile(filename),'decrypt')).toString('utf8'));
  const next={};for(const name of credentialNames)if(typeof decoded[name]==='string' && /^[\x21-\x7e]{1,512}$/.test(decoded[name]))next[name]=decoded[name];
  applyValues(next);diskVersion=version;storageWarning=null;
}
export const credentialsReady=reloadCredentials().catch(()=>{storageWarning='已保存的金鑰無法讀取；請重新儲存金鑰或使用原本的 Windows 帳號';});
// Another local app instance can save keys while this provider keeps running.
// Refresh only when the encrypted file changes; never return AI keys to the UI.
export function refreshCredentials(){
  const operation=queue.then(async()=>{await credentialsReady;await reloadCredentials();});
  queue=operation.catch(()=>{});return operation;
}
export function getCredential(name) { return values[credentialName(name)] || process.env[credentialName(name)] || ''; }
export function credentialPresence() {
  return { openrouter:!!getCredential('openrouter'), gemini:!!getCredential('gemini'), env:Object.fromEntries(credentialNames.map(name => [name,!!getCredential(name)])), storage:'windows-dpapi',warning:storageWarning };
}
export function saveCredential(name, value) {
  const mapped = credentialName(name);
  if (value !== null && (typeof value !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(value))) throw new Error('API 金鑰只能包含 1–512 個半形英數字與符號，請勿貼入中文說明或空白');
  const operation = queue.then(async () => {
    await credentialsReady;await reloadCredentials();
    const next = { ...values, [mapped]:value };
    if (value === null) delete next[mapped];
    const encrypted = await protect(Buffer.from(JSON.stringify(next),'utf8'),'encrypt');
    await mkdir(folder,{recursive:true});
    await writeFile(`${filename}.tmp`,encrypted);
    await rename(`${filename}.tmp`,filename);
    applyValues(next);diskVersion=await currentVersion();storageWarning = null;
    if (value === null) delete process.env[mapped]; else process.env[mapped] = value;
  });
  queue = operation.catch(() => {});
  return operation;
}
