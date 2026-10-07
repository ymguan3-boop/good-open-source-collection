import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
let databasePromise;
async function database(){
  if(!databasePromise)databasePromise=(async()=>{
    const {DatabaseSync}=await import('node:sqlite');
    const directory=join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'GodsEyeTaiwan','records');await mkdir(directory,{recursive:true});
    const db=new DatabaseSync(join(directory,'index.sqlite'));db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS records(namespace TEXT NOT NULL,id TEXT NOT NULL,createdAt TEXT,type TEXT,location TEXT,project TEXT,cameraId TEXT,hash TEXT,summary TEXT,metadata TEXT,PRIMARY KEY(namespace,id));
      CREATE INDEX IF NOT EXISTS record_filter ON records(namespace,type,createdAt);
      CREATE VIRTUAL TABLE IF NOT EXISTS record_fts USING fts5(namespace UNINDEXED,id UNINDEXED,summary,tokenize='trigram');
      CREATE TABLE IF NOT EXISTS cctv_events(namespace TEXT,recordId TEXT,eventKey TEXT,cameraId TEXT,capturedAt TEXT,eventType TEXT,metadata TEXT,PRIMARY KEY(namespace,recordId,eventKey));
      CREATE INDEX IF NOT EXISTS camera_event_time ON cctv_events(namespace,cameraId,eventType,capturedAt);
      PRAGMA user_version=1;`);return db;
  })().catch(error=>{databasePromise=null;throw error;});return databasePromise;
}
const clean=(x,n)=>String(x??'').slice(0,n);
export async function recordIndexAction(input){
  const namespace=clean(input.namespace,80);if(!/^[a-zA-Z0-9-]{16,80}$/.test(namespace))throw Error('紀錄索引識別不正確');
  const db=await database();
  if(input.action==='upsert'){
    const records=input.records;if(!Array.isArray(records)||records.length>100)throw Error('紀錄索引每批最多100筆');
    const write=db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,?,?,?,?,?)'),remove=db.prepare('DELETE FROM record_fts WHERE namespace=? AND id=?'),fts=db.prepare('INSERT INTO record_fts(namespace,id,summary) VALUES(?,?,?)');
    db.exec('BEGIN');try{for(const r of records){const id=clean(r.id,80),summary=clean(r.summary,2400),metadata=JSON.stringify({...r,summary,markdown:undefined,frames:undefined,media:undefined,attachments:undefined});if(metadata.length>24000)throw Error('紀錄摘要過大');write.run(namespace,id,clean(r.createdAt,40),clean(r.type,40),clean(r.location,160),clean(r.project,160),clean(r.cameraId,160),clean(r.hash,80),summary,metadata);remove.run(namespace,id);fts.run(namespace,id,summary);db.prepare('DELETE FROM cctv_events WHERE namespace=? AND recordId=?').run(namespace,id);const events=new Map();for(const e of (r.eventMetadata||[]).slice(0,50)){const key=clean(e.cameraId,160)+':'+clean(e.eventType,80)+':'+Math.floor((Date.parse(e.capturedAt)||Date.parse(r.createdAt))/60000);if(!events.has(key))events.set(key,e);}for(const [key,e] of events)db.prepare('INSERT OR REPLACE INTO cctv_events VALUES(?,?,?,?,?,?,?)').run(namespace,id,key,clean(e.cameraId,160),clean(e.capturedAt,40),clean(e.eventType,80),JSON.stringify(e).slice(0,2000));}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return {indexed:records.length,engine:'SQLite / FTS5 trigram'};
  }
  if(input.action==='delete'){const id=clean(input.id,80);db.prepare('DELETE FROM records WHERE namespace=? AND id=?').run(namespace,id);db.prepare('DELETE FROM record_fts WHERE namespace=? AND id=?').run(namespace,id);db.prepare('DELETE FROM cctv_events WHERE namespace=? AND recordId=?').run(namespace,id);return {deleted:true};}
  if(!['search','list'].includes(input.action))throw Error('未知紀錄索引動作');
  const ids=Array.isArray(input.ids)?input.ids.map(x=>clean(x,80)):null;
  // A JSON parameter avoids SQL variable limits for thousands of selected records.
  const where=['r.namespace=?'],args=[namespace];if(ids){where.push('r.id IN (SELECT CAST(value AS TEXT) FROM json_each(?))');args.push(JSON.stringify(ids));}
  for(const field of ['type','location','project','cameraId'])if(input[field]){where.push(`r.${field} LIKE ?`);args.push('%'+clean(input[field],160)+'%');}
  if(input.from){where.push('r.createdAt>=?');args.push(clean(input.from,40));}if(input.to){where.push('r.createdAt<=?');args.push(clean(input.to,40));}
  if(input.event){where.push('EXISTS (SELECT 1 FROM cctv_events e WHERE e.namespace=r.namespace AND e.recordId=r.id AND e.eventType LIKE ?)');args.push('%'+clean(input.event,80)+'%');}
  if(input.action==='list'){
    const query=clean(input.query,300);if(query){where.push('(r.summary LIKE ? OR r.metadata LIKE ?)');args.push('%'+query+'%','%'+query+'%');}
    const total=db.prepare(`SELECT count(*) AS n FROM records r WHERE ${where.join(' AND ')}`).get(...args).n,limit=Math.max(1,Math.min(50,Number(input.limit)||50)),offset=Math.max(0,Number(input.offset)||0);
    return {records:db.prepare(`SELECT r.metadata FROM records r WHERE ${where.join(' AND ')} ORDER BY r.createdAt DESC LIMIT ? OFFSET ?`).all(...args,limit,offset).map(r=>JSON.parse(r.metadata)),total,engine:'SQLite metadata / paged'};
  }
  const limit=Math.max(1,Math.min(10,Number(input.limit)||10)),query=clean(input.query,300),terms=query.split(/[\s，。；：、?!！？]+/).filter(t=>t.length>=3).slice(0,8),match=terms.map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR ');
  let rows=[];
  if(match)rows=db.prepare(`SELECT r.metadata FROM records r JOIN record_fts f ON r.namespace=f.namespace AND r.id=f.id WHERE ${where.join(' AND ')} AND record_fts MATCH ? ORDER BY bm25(record_fts),r.createdAt DESC LIMIT ?`).all(...args,match,limit);
  if(rows.length<limit){const recent=db.prepare(`SELECT r.metadata FROM records r WHERE ${where.join(' AND ')} ORDER BY r.createdAt DESC LIMIT ?`).all(...args,limit);const seen=new Set(rows.map(x=>JSON.parse(x.metadata).id));for(const row of recent)if(!seen.has(JSON.parse(row.metadata).id)&&rows.length<limit)rows.push(row);}
  const total=db.prepare(`SELECT count(*) AS n FROM records r WHERE ${where.join(' AND ')}`).get(...args).n;
  return {records:rows.map(r=>JSON.parse(r.metadata)),total,engine:'SQLite / FTS5 trigram',limit};
}
