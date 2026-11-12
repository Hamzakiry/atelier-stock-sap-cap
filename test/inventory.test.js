import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

test('Inventaire : écart signé, motif, zéro, stock obsolète et rollback',async()=>{
 const model=await cds.load(['db','srv']);cds.model=model;
 cds.compile.to.edmx(model,{service:'CatalogService'});
 await cds.deploy(model).to('sqlite::memory:');await cds.serve('CatalogService');
 const srv=cds.services.CatalogService;const {SELECT,UPDATE}=cds.ql;
 const almond='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
 const cream='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
 const correct=data=>srv.send('adjustInventory',{lotID:almond,expectedQuantity:'10.000',countedQuantity:'9.500',reason:'Écart constaté au comptage',...data});
 const stock=async ID=>Number((await cds.db.run(SELECT.one.from('shop.Lots').where({ID}))).remainingQuantity);
 const count=async()=> (await cds.db.run(SELECT.from('shop.StockMovements'))).length;
 try {
  const out=await correct({});assert.equal(out.kind,'OUT');assert.equal(Number(out.quantity),0.5);
  assert.match(out.note,/10\.000 → 9\.500/);assert.match(out.note,/comptage/);assert.equal(await stock(almond),9.5);
  // Répéter une correction basée sur l'ancien stock ne doit pas ajouter de mouvement.
  await assert.rejects(correct({}),/stock a changé/);assert.equal(await count(),1);
  const entry=await correct({expectedQuantity:'9.500',countedQuantity:'11.250'});
  assert.equal(entry.kind,'IN');assert.equal(Number(entry.quantity),1.75);
  for(const change of [{reason:' '},{reason:'abc'},{countedQuantity:'-1'},{countedQuantity:'1.0001'},
    {lotID:cream,expectedQuantity:'20',countedQuantity:'19.5'}]) await assert.rejects(correct(change));
  await assert.rejects(correct({expectedQuantity:'11.250',countedQuantity:'11.250'}),/Aucun écart/);
  await assert.rejects(correct({lotID:'99999999-9999-4999-8999-999999999999'}),/introuvable/);
  assert.equal(await count(),2);assert.equal(await stock(almond),11.25);
  await assert.rejects(cds.tx(async()=>{
    await correct({expectedQuantity:'11.250',countedQuantity:'8.000'});
    throw new Error('Simulated inventory failure');
  }),/Simulated inventory/);
  assert.equal(await stock(almond),11.25);assert.equal(await count(),2);
  await cds.db.run(UPDATE('shop.Lots').set({expiresOn:'2000-01-01'}).where({ID:almond}));
  await correct({expectedQuantity:'11.250',countedQuantity:'0',reason:'Retrait physique de produits périmés'});
  assert.equal(await stock(almond),0);assert.equal(await count(),3);
  const total=await srv.run(SELECT.one.from('CatalogService.Stock').where({reference:'P001'}));
  assert.equal(Number(total.totalStock),7);
 }finally{await cds.db.disconnect();}
});
