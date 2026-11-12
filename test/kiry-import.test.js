import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import cds from '@sap/cds';
import {prepareKiry,importKiry} from '../scripts/kiry-import.js';
import {migrateKiry} from '../scripts/migrate-kiry.js';

test('Import Kiry : unités, prix HT, clients, conservation, répétition et rollback',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'kiry-import-'));const filename=join(directory,'test.sqlite');let db;
 try {
  const model=await cds.load(['db','srv']);await cds.deploy(model).to('sqlite:'+filename);await cds.db.disconnect();
  db=new DatabaseSync(filename);
  const source={products:[{id:101,designation:'Article fictif import',unit:'Pc',default_price_ht:'18.50',tva_rate:'20'},{id:102,designation:'Poudre fictive',unit:'Kg',default_price_ht:'14',tva_rate:'20'}],clients:[{id:1,name:'Client fictif import',ice:'123456789012345',address:'Adresse fictive',phone:'',email:''}]};
  const initialProducts=db.prepare('SELECT * FROM shop_Products ORDER BY ID').all();
  const before=()=>['shop_Lots','shop_StockMovements','shop_OutboundRequests'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY ID').all());
  const state=before();
  assert.equal(await migrateKiry(filename),null,'Une base actuelle ne nécessite aucune migration');
  assert.deepEqual(importKiry(filename,source),{productsAdded:2,clientsAdded:1,productsSkipped:0,clientsSkipped:0});
  const products=db.prepare("SELECT * FROM shop_Products WHERE sourceSystem='KIRY_FACTURATION' ORDER BY reference").all();
  assert.equal(products[0].unit,'piece');assert.equal(products[1].unit,'kg');assert.equal(Number(products[0].salePrice),18.5);assert.equal(products[0].priceBasis,'HT');assert.equal(Number(products[0].tvaRate),20);
  assert.equal(db.prepare('SELECT count(*) AS n FROM CatalogService_Clients').get().n,1);
  for(const old of initialProducts)assert.deepEqual(db.prepare('SELECT * FROM shop_Products WHERE ID=?').get(old.ID),old);
  assert.deepEqual(before(),state,'Aucune quantité, historique ou déduplication modifiée');
  db.prepare('UPDATE shop_Products SET name=? WHERE ID=?').run('Modification locale',products[0].ID);
  assert.deepEqual(importKiry(filename,source),{productsAdded:0,clientsAdded:0,productsSkipped:2,clientsSkipped:1});
  assert.equal(db.prepare('SELECT name FROM shop_Products WHERE ID=?').get(products[0].ID).name,'Modification locale');
  assert.throws(()=>prepareKiry({...source,products:[{...source.products[0],unit:'Carton'}]}),/Unité/);
  assert.throws(()=>prepareKiry({...source,products:[source.products[0],source.products[0]]}),/plusieurs/);
  assert.throws(()=>prepareKiry({...source,products:[{...source.products[0],default_price_ht:'-1'}]}),/Prix/);
  // La seconde ligne entre en conflit après la première insertion : tout doit être annulé.
  const conflicting={...source,products:[{...source.products[0],id:103},{...source.products[0],id:104}]};
  db.prepare('INSERT INTO shop_Products (ID,reference,name,unit,salePrice,minimumStock) VALUES (?,?,?,?,?,?)').run(cds.utils.uuid(),'KIRY-104','Conflit fictif','piece',1,0);
  assert.throws(()=>importKiry(filename,conflicting),/Conflit/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM shop_Products WHERE reference='KIRY-103'").get().n,0);
 }finally{db?.close();if(cds.db)await cds.db.disconnect();rmSync(directory,{recursive:true,force:true});}
});
