import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
cds.context={user:new cds.User({id:'audit-manager',roles:['Manager']})};

test('Journal catalogue : avant/après, auteur, absence de bruit et rollback CAP',async()=>{
 const model=await cds.load(['db','srv']);cds.model=model;
 await cds.deploy(model).to('sqlite::memory:');await cds.serve('CatalogService');
 const srv=cds.services.CatalogService,{SELECT}=cds.ql;
 const productID='11111111-1111-4111-8111-111111111111';
 const read=()=>cds.db.run(SELECT.one.from('shop.Products').where({ID:productID}));
 const journal=()=>cds.db.run(SELECT.from('shop.CatalogueChanges').orderBy('field'));
 const update=data=>srv.send('updateProduct',{productID,name:'Article fictif audit',salePrice:'95.50',minimumStock:'7.000',...data});
 try {
  const before=await read();
  const lots=await cds.db.run(SELECT.from('shop.Lots').orderBy('ID'));
  await update({});
  const changes=await journal();assert.equal(changes.length,3);
  assert.equal(new Set(changes.map(row=>row.changeID)).size,1);
  assert.ok(changes.every(row=>row.createdBy==='audit-manager'&&row.entityID===productID&&row.reference===before.reference&&row.entityType==='Products'&&!Number.isNaN(Date.parse(row.recordedAt))));
  const price=changes.find(row=>row.field==='salePrice');assert.equal(price.oldValue,Number(before.salePrice).toFixed(2));assert.equal(price.newValue,'95.50');
  await update({salePrice:95.5,minimumStock:7});assert.equal((await journal()).length,3,'Pas de faux changement dû au format décimal');
  await assert.rejects(update({salePrice:'-1'}));assert.equal((await journal()).length,3);
  const stored=await read();
  await assert.rejects(cds.tx(async()=>{await update({name:'Échec simulé'});throw new Error('Rollback simulé');}),/Rollback simulé/);
  assert.deepEqual(await read(),stored);assert.equal((await journal()).length,3);
  const supplier=await srv.send('createSupplier',{code:'AUDIT-TEST',name:'Fournisseur fictif avant'});
  await srv.send('updateSupplier',{supplierID:supplier.ID,name:'Fournisseur fictif après'});
  const supplierLog=(await journal()).find(row=>row.entityType==='Suppliers');
  assert.equal(supplierLog.reference,'AUDIT-TEST');assert.equal(supplierLog.oldValue,'Fournisseur fictif avant');assert.equal(supplierLog.newValue,'Fournisseur fictif après');
  await srv.send('updateSupplier',{supplierID:supplier.ID,name:'Fournisseur fictif après'});assert.equal((await journal()).length,4);
  assert.deepEqual(await cds.db.run(SELECT.from('shop.Lots').orderBy('ID')),lots);
  assert.equal((await cds.db.run(SELECT.from('shop.StockMovements'))).length,0);
 }finally{await cds.db.disconnect();}
});
