import cds from '@sap/cds';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';

export async function migrateKiry(filename='db.sqlite') {
 if(!existsSync(filename))throw new Error('Base absente : exécuter db:init pour une nouvelle installation.');
 const ddl=cds.compile.to.sql(await cds.load(['db','srv']),{dialect:'sqlite'});
 const db=new DatabaseSync(filename);
 try {
  db.exec('PRAGMA busy_timeout=5000');
  const columns=new Set(db.prepare('PRAGMA table_info(shop_Products)').all().map(x=>x.name));
  const fields={priceBasis:'NVARCHAR(10)',tvaRate:'DECIMAL(5,2)',sourceSystem:'NVARCHAR(30)',sourceID:'NVARCHAR(40)'};
  const missing=Object.entries(fields).filter(([name])=>!columns.has(name));
  const clients=db.prepare("SELECT name FROM sqlite_master WHERE name='shop_Clients' AND type='table'").get();
  if(!missing.length&&clients)return null;
  const backup=filename+'.before-kiry-'+Date.now()+'.sqlite';
  db.prepare('VACUUM INTO ?').run(backup);
  const oldColumns=[...columns].map(x=>'"'+x+'"').join(',');
  const before=db.prepare('SELECT '+oldColumns+' FROM shop_Products ORDER BY ID').all();
  db.exec('BEGIN IMMEDIATE');
  try {
   for(const [name,type] of missing)db.exec('ALTER TABLE shop_Products ADD COLUMN '+name+' '+type);
   if(!clients) {
    const table=ddl.find(sql=>/^CREATE TABLE shop_Clients\s/.test(sql));
    assert.ok(table,'Table clients absente du modèle');db.exec(table);
   }
   for(const name of ['CatalogService_Products','CatalogService_Clients']) {
    const view=ddl.find(sql=>sql.startsWith('CREATE VIEW '+name+' '));assert.ok(view,'Vue absente : '+name);
    db.exec('DROP VIEW IF EXISTS '+name);db.exec(view);
   }
   assert.deepEqual(db.prepare('SELECT '+oldColumns+' FROM shop_Products ORDER BY ID').all(),before);
   db.exec('COMMIT');return backup;
  }catch(error){db.exec('ROLLBACK');throw error;}
 }finally{db.close();}
}
