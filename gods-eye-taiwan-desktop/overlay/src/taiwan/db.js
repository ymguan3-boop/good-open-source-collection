
import Dexie from 'dexie';

export const db = new Dexie('GodsEyeTaiwan');
db.version(1).stores({
  projects: '++id,updatedAt,name',
  layers: '++id,projectId,name,type',
  settings: '&key',
  analyses: '++id,projectId,createdAt,title',
});
