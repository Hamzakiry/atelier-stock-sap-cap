import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

test('FEFO : ordre, lots périmés, confirmation, doublon et rollback',async()=>{
 const model=await cds.load(['db','srv']);cds.model=model;
 cds.compile.to.edmx(model,{service:'CatalogService'});
 await cds.deploy(model).to('sqlite::memory:');await cds.serve('CatalogService');
 const srv=cds.services.CatalogService;const {SELECT,UPDATE,INSERT}=cds.ql;
 const productID='11111111-1111-4111-8111-111111111111';
 const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',b='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
 const day=offset=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
 const plan=(quantity='5')=>srv.send('proposeFefo',{productID,quantity});
 const count=async()=> (await cds.db.run(SELECT.from('shop.StockMovements'))).length;
 const lot=async ID=>Number((await cds.db.run(SELECT.one.from('shop.Lots').where({ID}))).remainingQuantity);
 const confirm=(proposal,id=cds.utils.uuid())=>srv.send('confirmFefo',{productID:proposal.productID,quantity:proposal.quantity,allocations:proposal.allocations,requestID:id,note:'Test FEFO'});
 try {
  await cds.db.run(UPDATE('shop.Lots').set({remainingQuantity:3,expiresOn:day(1)}).where({ID:a}));
  await cds.db.run(UPDATE('shop.Lots').set({remainingQuantity:8,expiresOn:day(30)}).where({ID:b}));
  await cds.db.run(INSERT.into('shop.Lots').entries([
   {ID:'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',product_ID:productID,lotNumber:'EXPIRED',receivedOn:day(-10),expiresOn:day(-1),remainingQuantity:100,purchasePrice:1},
   {ID:'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',product_ID:productID,lotNumber:'UNDATED',receivedOn:day(-10),expiresOn:null,remainingQuantity:2,purchasePrice:1}
  ]));
  const proposal=await plan();
  assert.deepEqual(proposal.allocations.map(x=>[x.lotID,x.quantity]),[[a,'3.000'],[b,'2.000']]);
  assert.equal(await count(),0);assert.equal(await lot(a),3);
  const requestID=cds.utils.uuid();const movements=await confirm(proposal,requestID);
  assert.equal(movements.length,2);assert.equal(await lot(a),0);assert.equal(await lot(b),6);
  assert.deepEqual(await confirm(proposal,requestID),movements);assert.equal(await count(),2);
  await assert.rejects(confirm({...proposal,quantity:'4'},requestID));
  await assert.rejects(srv.send('confirmFefo',{productID:proposal.productID,quantity:proposal.quantity,allocations:proposal.allocations,requestID,note:'changed'}),/autre demande/);
  await assert.rejects(plan('100'),/insuffisant/);
  await assert.rejects(plan('0'));await assert.rejects(plan('-1'));
  const next=await plan('7');assert.equal(next.allocations.at(-1).lotNumber,'UNDATED');
  // La proposition devient obsolète avant confirmation : aucune sortie partielle.
  await cds.db.run(UPDATE('shop.Lots').set({remainingQuantity:5}).where({ID:b}));
  await assert.rejects(confirm(next),/changé/);
  assert.equal(await lot(b),5);assert.equal(await count(),2);
  // Une défaillance après les sorties annule quantités, historique et identifiant.
  const fresh=await plan('1');const rollbackID=cds.utils.uuid();
  await assert.rejects(cds.tx(async()=>{await confirm(fresh,rollbackID);throw new Error('Simulated FEFO failure');}),/Simulated FEFO/);
  assert.equal(await lot(b),5);assert.equal(await count(),2);
  assert.equal(await cds.db.run(SELECT.one.from('shop.OutboundRequests').where({ID:rollbackID})),undefined);
  const foreign={...fresh,allocations:[{...fresh.allocations[0],lotID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'}]};
  await assert.rejects(confirm(foreign),/changé/);
  await assert.rejects(srv.send('proposeFefo',{productID:'22222222-2222-4222-8222-222222222222',quantity:'0.5'}),/entière/);
 } finally {await cds.db.disconnect();}
});
