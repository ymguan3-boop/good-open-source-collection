import { readFileSync } from 'node:fs';
import tls from 'node:tls';

// NLSC 3D Tiles hosts send only their leaf certificate. Chrome completes the
// chain itself, but Node fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE, so every
// official building count returned "unknown". Add the official TWCA
// intermediate (issued by the already trusted TWCA Global Root CA, valid to
// 2030-10-16, SHA-256 1A:2C:75:FD:…:8B:7D:0E) to the default CA list.
export const nlscTlsStatus = { patched:false, reason:'' };
try {
  const pem = readFileSync(new URL('./certs/twca-secure-ssl-2023g3.pem', import.meta.url), 'utf8').trim();
  if (typeof tls.setDefaultCACertificates !== 'function') nlscTlsStatus.reason = '此 Node.js 版本不支援補充中繼憑證';
  else {
    const current = tls.getCACertificates('default');
    if (!current.some(cert => cert.trim() === pem)) tls.setDefaultCACertificates([...current, pem]);
    nlscTlsStatus.patched = true;
  }
} catch (error) {
  nlscTlsStatus.reason = error.message;
}
