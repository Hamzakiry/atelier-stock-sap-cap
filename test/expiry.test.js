import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

test('Péremption : limites de dates, disponible, sans date et seuil', async()=>{
 const model=await cds.load(['db','srv']);cds.model=model;
 cds.compile.to.edmx(model,{service:'CatalogService'});
 await cds.deploy(model).to('sqlite::memory:');await cds.serve('CatalogService');
 const srv=cds.services.CatalogService; const {SELECT,UPDATE}=cds.ql;
 const day=offset=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
 const report=()=>srv.send('expiryReport',{days:30});
 try {
  await cds.db.run(UPDATE('shop.Lots').set({expiresOn:day(-1)}).where({lotNumber:'LOT-001'}));
  await cds.db.run(UPDATE('shop.Lots').set({expiresOn:day(0)}).where({lotNumber:'LOT-002'}));
  await cds.db.run(UPDATE('shop.Lots').set({expiresOn:null}).where({lotNumber:'CREME-001'}));
  await cds.db.run(UPDATE('shop.Products').set({minimumStock:8}).where({reference:'P001'}));
  let rows=await report();let almond=rows.find(x=>x.name==='Amandes');
  assert.equal(Number(almond.physicalStock),17);assert.equal(Number(almond.availableStock),7);
  assert.equal(Number(almond.expiredStock),10);assert.equal(Number(almond.expiringStock),7);
  assert.equal(almond.lowAvailableStock,true);
  const cream=rows.find(x=>x.unit==='piece'&&x.name.includes('Crème'));
  assert.equal(Number(cream.undatedStock),20);assert.equal(Number(cream.availableStock),20);
  assert.equal(Number(rows.find(x=>x.name==='Moule à gâteau').physicalStock),0);
  await cds.db.run(UPDATE('shop.Lots').set({expiresOn:day(30)}).where({lotNumber:'LOT-002'}));
  assert.equal(Number((await report()).find(x=>x.name==='Amandes').expiringStock),7);
  await cds.db.run(UPDATE('shop.Lots').set({expiresOn:day(31)}).where({lotNumber:'LOT-002'}));
  assert.equal(Number((await report()).find(x=>x.name==='Amandes').expiringStock),0);
  for(const days of [-1,366,1.5]) await assert.rejects(srv.send('expiryReport',{days}));
  assert.equal((await cds.db.run(SELECT.from('shop.StockMovements'))).length,0);
 } finally {await cds.db.disconnect();}
});
