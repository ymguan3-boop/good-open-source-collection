// Copies the named OSM road segments of one county from the bundled national road snapshot
// (overlay/src/taiwan/data/osm-roads-national.geojson.gz, © OpenStreetMap contributors, ODbL)
// into the local real-price database, so a clicked building can be tied to the road it faces.
// No network access is needed.
//   node scripts/fetch-osm-roads.mjs --county 宜蘭縣 --db data/local/lvr-yilan.sqlite
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = Object.fromEntries(process.argv.slice(2).reduce((list, value, index, all) => value.startsWith('--') ? [...list, [value.slice(2), all[index + 1]]] : list, []));
if (!args.county || !args.db) throw new Error('用法：--county 宜蘭縣 --db <lvr sqlite>');
const source = resolve(import.meta.dirname, '..', 'overlay/src/taiwan/data/osm-roads-national.geojson.gz');
const collection = JSON.parse(gunzipSync(readFileSync(source)));
const db = new DatabaseSync(resolve(args.db));
db.exec(`CREATE TABLE IF NOT EXISTS osm_roads(way_id INTEGER, name TEXT, highway TEXT, county TEXT, minlon REAL, minlat REAL, maxlon REAL, maxlat REAL, coords TEXT);
CREATE INDEX IF NOT EXISTS osm_roads_box ON osm_roads(minlon, maxlon, minlat, maxlat);`);
db.prepare('DELETE FROM osm_roads WHERE county = ?').run(args.county);
const insert = db.prepare('INSERT INTO osm_roads VALUES (?,?,?,?,?,?,?,?,?)');
let n = 0;
db.exec('BEGIN');
for (const feature of collection.features) {
  const p = feature.properties || {};
  if (!p.name || !(p.snapshotCounties || []).includes(args.county)) continue;
  const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [];
  for (const line of lines) {
    if (line.length < 2) continue;
    const lons = line.map(c => c[0]), lats = line.map(c => c[1]);
    insert.run(p.osmId ?? null, p.name, p.highway ?? null, args.county, Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats), JSON.stringify(line.map(c => [Number(c[0].toFixed(7)), Number(c[1].toFixed(7))])));
    n++;
  }
}
db.exec('COMMIT');
db.prepare("INSERT OR REPLACE INTO lvr_meta VALUES ('osm_roads', ?)").run(`© OpenStreetMap contributors (ODbL)；內建全臺道路固定版；${args.county}；${new Date().toISOString()}；${n} 段具名道路`);
console.log(`${args.county}：已儲存 ${n} 段具名道路`);
