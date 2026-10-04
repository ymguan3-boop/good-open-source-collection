import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),work=resolve(root,'.work/upstream');
const version=process.versions.node.split('.').map(Number);
if(!((version[0]===24&&version[1]>=14)||version[0]===26))throw new Error('請安裝 Node.js 24.14以上的24.x，或26.x。');
execFileSync('git',['--version'],{stdio:'inherit'});
if(existsSync(work))throw new Error('已存在安裝工作區；本腳本只處理首次安裝，不清除既有設定。更新請依README操作。');
execFileSync(process.execPath,[resolve(root,'scripts/prepare-upstream.mjs')],{cwd:root,stdio:'inherit'});
const pkg=JSON.parse(readFileSync(resolve(work,'package.json'),'utf8'));
if(pkg.name!=='gods-eye-taiwan-desktop' || pkg.taiwanEdition?.runtime!=='browser')throw new Error('瀏覽器台灣版套用未完成，停止安裝。');
if(Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies}).some(name=>name.startsWith('@tauri-apps/')))throw new Error('瀏覽器版不應安裝桌面 Runtime，停止安裝。');
// npm is a batch launcher on Windows; use cmd's fixed argument list, without
// interpolating project paths into shell text. cwd safely handles Chinese paths.
if(process.platform==='win32'){
  execFileSync('cmd.exe',['/d','/s','/c','npm.cmd install'],{cwd:work,stdio:'inherit'});
  execFileSync('cmd.exe',['/d','/s','/c','npm.cmd run build'],{cwd:work,stdio:'inherit'});
}else{
  execFileSync('npm',['install'],{cwd:work,stdio:'inherit'});
  execFileSync('npm',['run','build'],{cwd:work,stdio:'inherit'});
}
console.log('瀏覽器版已完成安裝。Windows請雙擊「啟動上帝之眼-瀏覽器版.bat」。');
