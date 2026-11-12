import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import cds from '@sap/cds';
import {backupDatabase,restoreDatabase} from '../scripts/database-backups.js';

test('Sauvegarde/restauration : WAL, historique, auteurs, déduplication et refus sans modification',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'atelier-stock-backup-'));
 const filename=join(directory,'stock.sqlite');
 let db;
 try {
  const model=await cds.load(['db','srv']);
  await cds.deploy(model).to('sqlite:'+filename);
  await cds.db.disconnect();
  db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL');
  const lotID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  db.prepare('UPDATE shop_Lots SET remainingQuantity=6.5 WHERE ID=?').run(lotID);
  const movementID=cds.utils.uuid(),requestID=cds.utils.uuid();
  db.prepare('INSERT INTO shop_StockMovements (ID,lot_ID,kind,quantity,recordedAt,createdBy,note) VALUES (?,?,?,?,?,?,?)').run(movementID,lotID,'OUT',1.5,new Date().toISOString(),'manager','Test sauvegarde');
  db.prepare('INSERT INTO shop_OutboundRequests (ID,signature,result) VALUES (?,?,?)').run(requestID,'test-signature',JSON.stringify([{ID:movementID,createdBy:'manager'}]));
  db.prepare('INSERT INTO shop_Clients (ID,sourceSystem,sourceID,name) VALUES (?,?,?,?)').run(cds.utils.uuid(),'KIRY_FACTURATION','TEST','Client fictif sauvegarde');
  db.prepare('INSERT INTO shop_CatalogueChanges (ID,changeID,entityType,entityID,reference,field,oldValue,newValue,recordedAt,createdBy) VALUES (?,?,?,?,?,?,?,?,?,?)').run(cds.utils.uuid(),cds.utils.uuid(),'Products','11111111-1111-4111-8111-111111111111','P001','name','Avant fictif','Après fictif',new Date().toISOString(),'manager');
  const tables=['shop_Products','shop_Lots','shop_Suppliers','shop_StockMovements','shop_OutboundRequests','shop_Clients','shop_CatalogueChanges'];
  const state=()=>tables.map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY ID').all());
  const before=state();
  // La connexion WAL reste ouverte pendant la sauvegarde.
  const snapshot=backupDatabase(filename,join(directory,'backups'));
  assert.ok(existsSync(snapshot));
  assert.deepEqual(state(),before,'Une sauvegarde ne modifie pas le stock');
  db.prepare('UPDATE shop_Lots SET remainingQuantity=1 WHERE ID=?').run(lotID);
  db.exec('DELETE FROM shop_StockMovements; DELETE FROM shop_OutboundRequests');
  const changed=state();
  const rescue=restoreDatabase(filename,snapshot,join(directory,'backups'));
  assert.deepEqual(state(),before,'Toutes les données sont restaurées ensemble');
  const rescueDb=new DatabaseSync(rescue,{readOnly:true});
  try {assert.deepEqual(tables.map(table=>rescueDb.prepare('SELECT * FROM '+table+' ORDER BY ID').all()),changed);}finally{rescueDb.close();}
  assert.throws(()=>restoreDatabase(filename,filename,directory),/distincte/);
  assert.throws(()=>restoreDatabase(filename,join(directory,'absent.sqlite'),directory),/introuvable/);
  const corrupt=join(directory,'corrupt.sqlite');writeFileSync(corrupt,'pas une base SQLite');
  assert.throws(()=>restoreDatabase(filename,corrupt,directory));
  const incompatible=backupDatabase(filename,directory);
  const other=new DatabaseSync(incompatible);other.exec('ALTER TABLE shop_Products ADD COLUMN incompatible TEXT');other.close();
  assert.throws(()=>restoreDatabase(filename,incompatible,directory),/schéma/);
  assert.deepEqual(state(),before,'Les fichiers refusés ne changent aucune donnée');
  // Un verrou concurrent refuse la restauration au lieu de remplacer partiellement les données.
  db.exec('BEGIN IMMEDIATE');
  try {assert.throws(()=>restoreDatabase(filename,snapshot,directory),/locked|busy/i);}finally{db.exec('ROLLBACK');}
  assert.deepEqual(state(),before);
 }finally{
  db?.close();if(cds.db)await cds.db.disconnect();
  rmSync(directory,{recursive:true,force:true});
 }
});
