
import JSZip from 'jszip';
import { db } from './db.js';

export async function saveProject({ name='未命名專案', viewer, layers=[] }) {
  const now = new Date().toISOString();
  const camera = viewer ? {
    position: [viewer.camera.positionWC.x, viewer.camera.positionWC.y, viewer.camera.positionWC.z],
    heading: viewer.camera.heading,
    pitch: viewer.camera.pitch,
    roll: viewer.camera.roll,
  } : null;
  return db.projects.put({ name, updatedAt: now, camera, layerCount: layers.length });
}

export async function exportProject({ name='未命名專案', viewer, layers=[] }) {
  const zip = new JSZip();
  const manifest = {
    format: 'gevproj', version: 1, name, exportedAt: new Date().toISOString(),
    camera: viewer ? {
      position: [viewer.camera.positionWC.x, viewer.camera.positionWC.y, viewer.camera.positionWC.z],
      heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: viewer.camera.roll,
    } : null,
    layers: layers.map((l, i) => ({ id: l.id || `layer-${i+1}`, name: l.name, kind: l.kind }))
  };
  zip.file('project.json', JSON.stringify(manifest, null, 2));
  for (const [index, layer] of layers.entries()) {
    if (layer.geojson) zip.file(`layers/${String(index+1).padStart(3,'0')}-${safe(layer.name)}.geojson`, JSON.stringify(layer.geojson));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function importProject(file) {
  const zip = await JSZip.loadAsync(file);
  const manifest = JSON.parse(await zip.file('project.json').async('string'));
  const layers = [];
  for (const path of Object.keys(zip.files).filter(p => p.endsWith('.geojson'))) {
    layers.push({ path, geojson: JSON.parse(await zip.file(path).async('string')) });
  }
  return { manifest, layers };
}

function safe(value) { return String(value || 'layer').replace(/[\\/:*?"<>|]+/g, '-'); }
