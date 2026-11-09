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
if(!process.argv.includes('--skip-dtm')){
  if(process.platform==='win32'){
    console.log('正在安裝官方 2025 全臺 20 公尺 DTM（下載約269 MB，含解壓需約1.1 GB空間）...');
    try{execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve(root,'scripts/install-official-dtm.ps1')],{cwd:root,stdio:'inherit'});}
    catch{console.warn('瀏覽器程式已安裝，但 DTM 尚未就緒。請在專案目錄執行 npm.cmd run install:dtm 續傳／補裝；詳見 README。');}
  }else console.warn('DTM 尚未安裝；此下載腳本適用 Windows，其他系統請依 README 官方來源與雜湊部署資料。');
}else console.log('已依 --skip-dtm 略過 DTM；日後可執行 npm.cmd run install:dtm 補裝。');
console.log('瀏覽器版已完成安裝。Windows請雙擊「啟動上帝之眼-瀏覽器版.bat」。');
