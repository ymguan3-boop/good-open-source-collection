
import Dexie from 'dexie';

export const db = new Dexie('GodsEyeTaiwan');
db.version(1).stores({
  projects: '++id,updatedAt,name',
  layers: '++id,projectId,name,type',
  settings: '&key',
  analyses: '++id,projectId,createdAt,title',
});
db.version(2).stores({ results:'++id,createdAt,name' });

db.version(3).stores({chatRecords:'++id,createdAt,filename'});

db.version(4).stores({recordIndex:'&id,createdAt,type,location,project,cameraId,hash,version'});
