// Explicit release preparation only. No background downloads or application keys.
import {mkdir,writeFile,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'.work','national-osm');
await mkdir(directory,{recursive:true});
const index=await fetch('https://download.geofabrik.de/asia/taiwan.html',{signal:AbortSignal.timeout(30000)});
if(!index.ok)throw new Error(`來源清單 HTTP ${index.status}`);
const files=[...(await index.text()).matchAll(/href="(taiwan-\d{6}\.osm\.pbf)"/g)].map(match=>match[1]).sort();
if(!files.length)throw new Error('來源清單未列出固定日期檔案');
const url=`https://download.geofabrik.de/asia/${files.at(-1)}`;
const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(600000)});
if(!response.ok)throw new Error(`全臺 OSM 下載 HTTP ${response.status}`);
let bytes=0,reported=0;
const measured=new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>700*1024*1024)throw new Error('來源檔案超過700MB，需重新確認資料格式');if(bytes-reported>32*1024*1024){console.log(JSON.stringify({downloadedMB:Math.round(bytes/1048576)}));reported=bytes;}controller.enqueue(chunk);}});
const pbf=resolve(directory,'taiwan.osm.pbf');
await pipeline(Readable.fromWeb(response.body.pipeThrough(measured)),createWriteStream(pbf));
const checksumResponse=await fetch(`${url}.md5`,{signal:AbortSignal.timeout(30000)});
if(!checksumResponse.ok)throw new Error('來源校驗碼無法取得');
const expected=(await checksumResponse.text()).match(/[0-9a-f]{32}/i)?.[0]?.toLowerCase();
const hash=createHash('md5');for await(const chunk of createReadStream(pbf))hash.update(chunk);
const verifiedMd5=hash.digest('hex');if(!expected||verifiedMd5!==expected)throw new Error('來源MD5校驗失敗，不建立內建圖資');
const metadata=resolve(directory,'download.json');
await writeFile(metadata,JSON.stringify({url,downloadedAt:new Date().toISOString(),lastModified:response.headers.get('last-modified'),bytes,verifiedMd5},null,2));
// libosmium's native Windows file API needs an ASCII input/index path.
const tempBase=resolve(tmpdir());
if(/[^\x00-\x7f]/.test(tempBase))throw new Error('請使用英文路徑執行 prepare-national-osm.py；目前 Windows 暫存路徑含非英文文字。');
const scratch=await mkdtemp(resolve(tempBase,'gev-osm-native-'));
try{
  const nativePbf=resolve(scratch,'taiwan.osm.pbf');await copyFile(pbf,nativePbf);
  execFileSync('python',['-X','utf8',resolve(root,'scripts','prepare-national-osm.py'),nativePbf,metadata],{cwd:root,stdio:'inherit'});
}finally{
  if(dirname(scratch)!==tempBase||!basename(scratch).startsWith('gev-osm-native-'))throw new Error('暫存清理路徑檢查失敗');
  await rm(scratch,{recursive:true,force:true});
}
