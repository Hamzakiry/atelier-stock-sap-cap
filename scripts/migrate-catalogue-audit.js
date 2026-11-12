import cds from '@sap/cds';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {backupDatabase} from './database-backups.js';

if (!existsSync('db.sqlite')) throw new Error('Base absente : utiliser db:init pour une nouvelle installation.');
const ddl=cds.compile.to.sql(await cds.load(['db','srv']),{dialect:'sqlite'});
const db=new DatabaseSync('db.sqlite');
try {
 db.exec('PRAGMA busy_timeout=5000');
 if(db.prepare("SELECT name FROM sqlite_master WHERE name='shop_CatalogueChanges' AND type='table'").get()) {
  console.log('Journal du catalogue déjà installé.');
 } else {
  const backup=backupDatabase('db.sqlite','backups');
  const table=ddl.find(sql=>/^CREATE TABLE shop_CatalogueChanges\s/.test(sql));
  const view=ddl.find(sql=>/^CREATE VIEW CatalogService_CatalogueChanges\s/.test(sql));
  if(!table||!view)throw new Error('Modèle du journal introuvable.');
  db.exec('BEGIN IMMEDIATE');
  try {db.exec(table);db.exec(view);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
  console.log('Journal ajouté sans modifier les données. Sauvegarde : '+backup);
 }
}finally{db.close();}
