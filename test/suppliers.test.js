import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

test('Fournisseurs : création, doublons et provenance de deux lots du même produit', async()=>{
 const model=await cds.load(['db','srv']); cds.model=model;
 cds.compile.to.edmx(model,{service:'CatalogService'});
 await cds.deploy(model).to('sqlite::memory:'); await cds.serve('CatalogService');
 const srv=cds.services.CatalogService; const {SELECT}=cds.ql;
 try {
  const a=await srv.send('createSupplier',{code:'F001',name:'Fournisseur Démo A'});
  const b=await srv.send('createSupplier',{code:'F002',name:'Fournisseur Démo B'});
  await assert.rejects(srv.send('createSupplier',{code:'F001',name:'Doublon'}),/existe déjà/);
  await assert.rejects(srv.send('createSupplier',{code:'F003',name:' '}),/obligatoire/);
  const input={productID:'11111111-1111-4111-8111-111111111111',lotNumber:'SUP-A',receivedOn:'2026-10-01',quantity:'1.500',purchasePrice:'60.00'};
  await srv.send('receiveLot',{...input,supplierID:a.ID});
  await srv.send('receiveLot',{...input,lotNumber:'SUP-B',supplierID:b.ID});
  const lots=await srv.run(SELECT.from('CatalogService.Lots').columns('lotNumber',{ref:['supplier'],expand:[{ref:['name']}]}));
  assert.equal(lots.find(x=>x.lotNumber==='SUP-A').supplier.name,a.name);
  assert.equal(lots.find(x=>x.lotNumber==='SUP-B').supplier.name,b.name);
  assert.equal(lots.find(x=>x.lotNumber==='LOT-001').supplier,null);
  const updated=await srv.send('updateSupplier',{supplierID:a.ID,name:'Nouveau nom Démo A'});
  assert.equal(updated.ID,a.ID);assert.equal(updated.code,'F001');
  const reread=await srv.run(SELECT.one.from('CatalogService.Lots').columns('supplier_ID',
    {ref:['supplier'],expand:[{ref:['name']}]}).where({lotNumber:'SUP-A'}));
  assert.equal(reread.supplier_ID,a.ID);assert.equal(reread.supplier.name,'Nouveau nom Démo A');
  await assert.rejects(srv.send('updateSupplier',{supplierID:a.ID,name:' '}),/obligatoire/);
  await assert.rejects(srv.send('updateSupplier',{supplierID:'99999999-9999-4999-8999-999999999999',name:'Absent'}),/introuvable/);
  await assert.rejects(srv.send('updateSupplier',{supplierID:a.ID,name:'Nom',code:'NEW'}));
  await assert.rejects(srv.send('receiveLot',{...input,lotNumber:'BAD',supplierID:'99999999-9999-4999-8999-999999999999'}),/Fournisseur introuvable/);
  assert.equal((await cds.db.run(SELECT.from('shop.StockMovements'))).length,2);
 } finally {await cds.db.disconnect();}
});
