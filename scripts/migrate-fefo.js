import cds from '@sap/cds';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
if(!existsSync('db.sqlite')) throw new Error('Initialiser la base avec npm run db:init.');
const model=await cds.load('*');
const ddl=cds.compile.to.sql(model,{dialect:'sqlite'});
const db=new DatabaseSync('db.sqlite');
db.exec('PRAGMA busy_timeout=5000');
try {
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shop_OutboundRequests'").get()) {
   console.log('Migration FEFO déjà appliquée.');
 } else {
   const backup='before-fefo-'+Date.now()+'.sqlite';
   db.exec("VACUUM INTO '"+backup+"'");
   const statement=ddl.find(s=>/^CREATE TABLE shop_OutboundRequests\s/.test(s));
   if(!statement)throw new Error('Définition FEFO introuvable.');
   db.exec(statement);
   console.log('Table FEFO ajoutée sans réimporter les données. Sauvegarde : '+backup);
 }
} finally {db.close();}
