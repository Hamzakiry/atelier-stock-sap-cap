import cds from '@sap/cds';
import {configureWebDatabase} from '../web/config.js';
import {readFileSync} from 'node:fs';
configureWebDatabase();
if(process.env.STOCK_DEMO_MODE!=='true')throw new Error('Ce script amorce uniquement une démonstration fictive.');
const model=await cds.load(['db','srv']);
const db=await cds.connect.to('db');
try{
 const tables=await db.run("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
 if(tables.length)throw new Error('Base non vide : aucune initialisation ni suppression effectuée.');
 await cds.deploy(model,{dialect:'postgres',kind:'postgres'},{}).to(db);
 // Sources de test publiques, jamais le fichier db.sqlite ni private-data/.
 for(const [entity,file] of [['shop.Products','shop-Products.csv'],['shop.Lots','shop-Lots.csv']]){
  const data=cds.parse.csv(readFileSync('test/data/'+file,'utf8'));
  const [columns,...values]=data;
  await db.run(cds.ql.INSERT.into(entity).columns(columns).rows(values));
 }
 console.log('Démonstration initialisée avec des produits et lots fictifs uniquement.');
}finally{await db.disconnect();}
