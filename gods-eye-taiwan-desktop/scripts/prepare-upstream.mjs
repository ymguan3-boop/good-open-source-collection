
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const lock = Object.fromEntries(readFileSync(resolve(root, 'UPSTREAM.lock'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(line => line.split(/=(.*)/s).slice(0,2)));
const dest = resolve(root, '.work', 'upstream');
rmSync(resolve(root, '.work'), { recursive: true, force: true });
mkdirSync(resolve(root, '.work'), { recursive: true });
execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', lock.repository, dest], { stdio: 'inherit' });
execFileSync('git', ['-C', dest, 'checkout', lock.commit], { stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'scripts', 'apply-overlay.mjs'), dest], { stdio: 'inherit' });
console.log(`Prepared Taiwan edition against ${lock.commit}`);
