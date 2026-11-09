import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
let cachedGpu = { gpuName:null, gpuTotal:0, gpuUsed:0, gpuUtilization:null, gpuMemoryKind:null, swapTotal:0, swapUsed:0 };
let gpuExpires = 0;
let gpuPromise = null;
let lastGoodGpuAt = 0;

async function readGpu() {
  if (Date.now() < gpuExpires) return cachedGpu;
  if (gpuPromise) return gpuPromise;
  gpuPromise = (async () => {
    const result = { gpuName:null, gpuTotal:0, gpuUsed:0, gpuUtilization:null, gpuMemoryKind:null, swapTotal:0, swapUsed:0 };
    if (process.platform !== 'win32') return result;
    try {
      const { stdout } = await execFileAsync('nvidia-smi.exe', [
        '--query-gpu=name,memory.total,memory.used,utilization.gpu',
        '--format=csv,noheader,nounits',
      ], { windowsHide:true, timeout:4000, maxBuffer:4096 });
      const row = stdout.trim().split(/\r?\n/)[0]?.split(',').map(value => value.trim());
      if (row?.length >= 4) {
        result.gpuName = row[0];
        result.gpuTotal = Number(row[1]) * 1024 * 1024;
        result.gpuUsed = Number(row[2]) * 1024 * 1024;
        result.gpuUtilization = Number(row[3]);
        result.gpuMemoryKind = 'dedicated';
        return result;
      }
    } catch { /* Non-NVIDIA machines use Windows counters below. */ }
    const [nameProbe, performanceProbe] = await Promise.allSettled([
      execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `$gpu=Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Remote|Basic Display' } | Select-Object -First 1; $pages=Get-CimInstance Win32_PageFileUsage; @{name=$gpu.Name;swapTotal=(($pages | Measure-Object -Property AllocatedBaseSize -Sum).Sum * 1MB);swapUsed=(($pages | Measure-Object -Property CurrentUsage -Sum).Sum * 1MB)} | ConvertTo-Json -Compress`,
      ], { windowsHide:true, timeout:6000, maxBuffer:8192 }),
      execFileAsync('typeperf.exe', [
        '\\GPU Engine(*)\\Utilization Percentage',
        '\\GPU Adapter Memory(*)\\Shared Usage',
        '-si', '1', '-sc', '2',
      ], { windowsHide:true, timeout:15000, maxBuffer:2*1024*1024 }),
    ]);
    if (nameProbe.status === 'fulfilled') {
      try {
        const system = JSON.parse(nameProbe.value.stdout.trim());
        result.gpuName = system.name || null;
        result.swapTotal = Number(system.swapTotal) || 0;
        result.swapUsed = Number(system.swapUsed) || 0;
      } catch { /* Leave these metrics unknown if Windows did not answer. */ }
    }
    if (performanceProbe.status === 'fulfilled') {
      const rows = performanceProbe.value.stdout.split(/\r?\n/).filter(line => line.startsWith('"'));
      if (rows.length >= 2) {
        const fields = line => [...line.matchAll(/"([^"]*)"/g)].map(match => match[1]);
        const headers = fields(rows[0]);
        const values = fields(rows.at(-1));
        const engines = new Map();
        let sharedMemory = 0;
        for (let i = 1; i < Math.min(headers.length,values.length); i++) {
          const value = Number(values[i]);
          if (!Number.isFinite(value) || value < 0) continue;
          const engine = headers[i].match(/engtype_([^)]*)\)\\Utilization Percentage/i)?.[1];
          if (engine) engines.set(engine, (engines.get(engine) || 0) + value);
          if (/\\GPU Adapter Memory\([^)]*\)\\Shared Usage/i.test(headers[i])) sharedMemory = Math.max(sharedMemory,value);
        }
        if (engines.size) result.gpuUtilization = Math.round(Math.min(100,Math.max(...engines.values())) * 10) / 10;
        if (sharedMemory > 0) { result.gpuUsed = sharedMemory; result.gpuMemoryKind = 'shared'; }
      }
    }
    if (Number.isFinite(result.gpuUtilization)) lastGoodGpuAt = Date.now();
    else if (Date.now() - lastGoodGpuAt < 60000 && Number.isFinite(cachedGpu.gpuUtilization)) {
      result.gpuUtilization = cachedGpu.gpuUtilization;
      result.gpuUsed = result.gpuUsed || cachedGpu.gpuUsed;
      result.gpuMemoryKind = result.gpuMemoryKind || cachedGpu.gpuMemoryKind;
    }
    result.gpuName ||= cachedGpu.gpuName;
    result.swapTotal ||= cachedGpu.swapTotal;
    result.swapUsed ||= cachedGpu.swapUsed;
    return result;
  })();
  try { cachedGpu = await gpuPromise; gpuExpires = Date.now() + 10000; return cachedGpu; }
  finally { gpuPromise = null; }
}

function localRequest(req) {
  const host = String(req.headers.host || '');
  const origin = String(req.headers.origin || '');
  const address = req.socket.remoteAddress;
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)
    && /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)
    && (!origin || origin === `http://${host}`)
    && !['forwarded','x-forwarded-for','x-real-ip'].some(name => req.headers[name]);
}

export function taiwanResourcesProxy() {
  return {
    name:'taiwan-local-resources',
    configureServer(server) {
      server.middlewares.use('/api/taiwan/resources', async (req,res) => {
        if (req.method !== 'GET' || !localRequest(req)) {
          res.statusCode = 403; res.end(); return;
        }
        const gpu = await readGpu();
        const memory = process.memoryUsage();
        const total = os.totalmem();
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({
          systemMemoryTotal:total,
          systemMemoryUsed:total - os.freemem(),
          processMemory:memory.rss,
          processVirtualMemory:0,
          processLabel:'本機圖資服務',
          ...gpu,
          processGpuUsed:0,
          gpuProcessIsExact:false,
          source:'local-provider',
          sampledAt:new Date().toISOString(),
        }));
      });
    },
  };
}
