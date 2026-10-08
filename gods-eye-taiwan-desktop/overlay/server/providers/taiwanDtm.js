import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import proj4 from 'proj4';
import * as turf from '@turf/turf';

// The official 2025 GeoTIFF is an uncompressed, little-endian Float32 raster
// with one 10035-pixel strip per row. The dimensions and byte count are checked
// before any request so a replacement file cannot silently use this layout.
function projectRoot(start){
  for(let folder=start;;folder=dirname(folder)){
    if(existsSync(resolve(folder,'UPSTREAM.lock'))&&existsSync(resolve(folder,'scripts/install-official-dtm.ps1')))return folder;
    if(dirname(folder)===folder)throw new Error('無法定位 DTM 專案根目錄，請保留 UPSTREAM.lock 與 scripts 安裝腳本。');
  }
}
const TIFF = resolve(projectRoot(import.meta.dirname), 'data/official/dtm-2025/DEM_tawiwan_V2025.tif');
const WIDTH = 10035;
const HEIGHT = 18852;
const BYTES = 756870860;
const X0 = 150980;
const Y0 = 2799160;
const CELL = 20;
const NODATA = -32767;
const TWD97 = '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
export function dtmStatus(){
  const fileBytes=existsSync(TIFF)?statSync(TIFF).size:0;
  return {installed:fileBytes===BYTES,fileBytes,expectedBytes:BYTES,source:'內政部地政司 2025 全臺 20 公尺 DTM',installCommand:'npm.cmd run install:dtm',readme:'README.md#官方-dtm-首次安裝與補裝',integrity:'安裝腳本驗證 SHA-256；服務檢查檔案大小'};
}
function requireDtm(){if(!dtmStatus().installed)throw new Error('官方 2025 DTM 尚未安裝或檔案不完整；請在專案目錄執行 npm.cmd run install:dtm 續傳／補裝，詳見 README「官方 DTM 首次安裝與補裝」。');}

function local(req) {
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || '');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    && /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)
    && (!origin || origin === `http://${host}`)
    && !['forwarded', 'x-forwarded-for', 'x-real-ip'].some(name => req.headers[name]);
}

function sample(bbox, maxSamples=8500) {
  requireDtm();
  const [west,south,east,north] = bbox;
  if (![west,south,east,north].every(Number.isFinite) || west < 117 || east > 123.5 || south < 20 || north > 27 || west >= east || south >= north) {
    throw new Error('DTM 請求範圍不正確');
  }
  const corners = [[west,south],[west,north],[east,south],[east,north]].map(point => proj4('EPSG:4326',TWD97,point));
  const xs = corners.map(point => point[0]);
  const ys = corners.map(point => point[1]);
  const c0 = Math.max(0,Math.floor((Math.min(...xs)-X0)/CELL));
  const c1 = Math.min(WIDTH-1,Math.ceil((Math.max(...xs)-X0)/CELL));
  const r0 = Math.max(0,Math.floor((Y0-Math.max(...ys))/CELL));
  const r1 = Math.min(HEIGHT-1,Math.ceil((Y0-Math.min(...ys))/CELL));
  if (c1 < c0 || r1 < r0) return { points:[], stride:1 };
  const stride = Math.max(1,Math.ceil(Math.sqrt(((c1-c0+1)*(r1-r0+1))/maxSamples)));
  const points = [];
  const fd = openSync(TIFF,'r');
  try {
    const row = Buffer.allocUnsafe((c1-c0+1)*4);
    for (let r=r0; r<=r1; r+=stride) {
      const offset = 8 + r*WIDTH*4 + c0*4;
      if (readSync(fd,row,0,row.length,offset) !== row.length) throw new Error('DTM 影像讀取不完整');
      for (let c=c0; c<=c1; c+=stride) {
        const height = row.readFloatLE((c-c0)*4);
        if (!Number.isFinite(height) || height === NODATA) continue;
        const e = X0 + c*CELL;
        const n = Y0 - r*CELL;
        const [lon,lat] = proj4(TWD97,'EPSG:4326',[e,n]);
        if (lon >= west && lon <= east && lat >= south && lat <= north) points.push([lon,lat,height]);
      }
    }
  } finally { closeSync(fd); }
  return { points, stride };
}

export function analyzeDtm(geometry) {
  if (!['LineString','Polygon','MultiPolygon'].includes(geometry?.type)) throw new Error('DTM 分析需使用路徑或多邊形');
  if (JSON.stringify(geometry).length > 180000) throw new Error('繪製節點過多');
  const feature = turf.feature(geometry);
  const bbox = turf.bbox(feature);
  if (!bbox.every(Number.isFinite) || bbox[0]<117 || bbox[2]>123.5 || bbox[1]<20 || bbox[3]>27) throw new Error('目前官方 DTM 僅涵蓋臺灣範圍');
  const source = '內政部地政司 2025 全臺 20 公尺 DTM（本機原始格網）';
  let heights = [];
  let spacing = CELL;
  let profile = {};
  if (geometry.type === 'LineString') {
    requireDtm();
    const length = turf.length(feature,{units:'meters'});
    if (!(length>0)) throw new Error('路徑長度不足');
    const segments = Math.min(2000,Math.max(1,Math.ceil(length/CELL)));
    spacing = length/segments;
    const fd = openSync(TIFF,'r');
    const buf = Buffer.allocUnsafe(4);
    let previous = null, terrainLength = 0, ascent = 0, descent = 0, maxSlope = 0;
    try {
      for (let i=0;i<=segments;i++) {
        const point = turf.along(feature,length*i/segments,{units:'meters'}).geometry.coordinates;
        const [e,n] = proj4('EPSG:4326',TWD97,point);
        const c=Math.round((e-X0)/CELL), r=Math.round((Y0-n)/CELL);
        let h=null;
        if (c>=0 && c<WIDTH && r>=0 && r<HEIGHT && readSync(fd,buf,0,4,8+(r*WIDTH+c)*4)===4) {
          const value=buf.readFloatLE(0);
          if (Number.isFinite(value) && value!==NODATA) h=value;
        }
        if (h!==null) heights.push(h);
        if (h!==null && previous!==null) {
          const dh=h-previous;
          terrainLength+=Math.hypot(spacing,dh);
          ascent+=Math.max(0,dh); descent+=Math.max(0,-dh);
          maxSlope=Math.max(maxSlope,Math.abs(dh)/spacing*100);
        }
        previous=h;
      }
    } finally { closeSync(fd); }
    const complete = heights.length===segments+1;
    profile = { expectedSamples:segments+1, coverageRatio:heights.length/(segments+1),
      terrainLengthMeters:complete ? terrainLength : null, ascentMeters:complete ? ascent : null,
      descentMeters:complete ? descent : null, maxSlopePercent:complete ? maxSlope : null };
  } else {
    const result = sample(bbox,50000);
    spacing = CELL*result.stride;
    heights = result.points.filter(([lon,lat])=>turf.booleanPointInPolygon([lon,lat],feature)).map(point=>point[2]);
  }
  return { dtmSamples:heights.length, minHeightMeters:heights.length?Math.min(...heights):null,
    maxHeightMeters:heights.length?Math.max(...heights):null,
    meanHeightMeters:heights.length?heights.reduce((sum,h)=>sum+h,0)/heights.length:null,
    sampledSpacingMeters:spacing, heightSource:source, sourceCrs:'EPSG:3826', sourceCellMeters:CELL,
    ...profile, limitations:'20 公尺格網取樣估計；非工程測量。高程基準以原始資料說明為準。' };
}

export function taiwanDtmProxy() {
  return {
    name:'taiwan-official-dtm',
    configureServer(server) {
      server.middlewares.use('/api/taiwan/dtm-2025', async (req,res) => {
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        if (!['GET','POST'].includes(req.method) || !local(req)) { res.statusCode=403; res.end(JSON.stringify({error:'僅允許本機同來源瀏覽器'})); return; }
        try {
          if(req.method==='GET'&&req.url.split('?')[0]==='/status'){res.end(JSON.stringify(dtmStatus()));return;}
          if (req.method==='POST' && req.url.split('?')[0]==='/analysis') {
            const chunks=[]; let bytes=0;
            for await (const chunk of req) { bytes+=chunk.length; if (bytes>200000) throw new Error('分析範圍資料過大'); chunks.push(chunk); }
            const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
            res.end(JSON.stringify(analyzeDtm(data.geometry)));
            return;
          }
          if (req.method!=='GET') throw new Error('不支援的 DTM 操作');
          const query = new URL(req.url,'http://localhost').searchParams;
          const bbox = ['west','south','east','north'].map(key => Number(query.get(key)));
          const { points, stride } = sample(bbox);
          res.end(JSON.stringify({ source:'內政部地政司 2025 全台 20 公尺 DTM', crs:'EPSG:4326', sourceCrs:'EPSG:3826',
            cellMeters:20, sampledSpacingMeters:20*stride, coverage:'臺灣本島；原始檔各圖號產製年度可能不同', points }));
        } catch (error) { res.statusCode=422; res.end(JSON.stringify({error:error.message})); }
      });
    },
  };
}
