import {readFileSync,existsSync} from 'node:fs';
import {migrateKiry} from './migrate-kiry.js';
import {prepareKiry,importKiry} from './kiry-import.js';
import {backupDatabase} from './database-backups.js';
const filename=process.argv[2]||'private-data/kiry-source.json';
try {
 if(!existsSync('db.sqlite'))throw new Error('Base absente : exécuter npm run db:init.');
 const snapshot=JSON.parse(readFileSync(filename,'utf8'));prepareKiry(snapshot);
 if(snapshot.clients.length!==5)throw new Error('Cet import attend les cinq clients convenus.');
 const backup=backupDatabase('db.sqlite','backups');
 const migration=await migrateKiry();
 console.log('Sauvegarde préalable : '+backup);
 if(migration)console.log('Schéma mis à jour sans réimporter les CSV.');
 console.log(JSON.stringify(importKiry('db.sqlite',snapshot)));
 console.log('Aucun lot, mouvement ou stock initial créé. Les données de facturation sont inchangées.');
}catch(error){console.error(error.message);process.exitCode=1;}
