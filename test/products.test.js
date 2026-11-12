import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

test('Modification produit : prix, nom, seuil et conservation du stock',async()=>{
 const model=await cds.load(['db','srv']);cds.model=model;
 cds.compile.to.edmx(model,{service:'CatalogService'});
 await cds.deploy(model).to('sqlite::memory:');await cds.serve('CatalogService');
 const srv=cds.services.CatalogService;const {SELECT}=cds.ql;
 const productID='11111111-1111-4111-8111-111111111111';
 const snapshot=async()=>({lots:await cds.db.run(SELECT.from('shop.Lots').orderBy('ID')),movements:await cds.db.run(SELECT.from('shop.StockMovements').orderBy('ID'))});
 const update=data=>srv.send('updateProduct',{productID,name:'Amandes sélectionnées',salePrice:'95.50',minimumStock:'20.000',...data});
 try {
  const before=await snapshot();const result=await update({});
  assert.equal(result.reference,'P001');assert.equal(result.unit,'kg');assert.equal(result.name,'Amandes sélectionnées');
  const stored=await cds.db.run(SELECT.one.from('shop.Products').where({ID:productID}));
  assert.equal(Number(stored.salePrice),95.5);assert.equal(Number(stored.minimumStock),20);
  const stock=await srv.run(SELECT.one.from('CatalogService.Stock').where({ID:productID}));
  assert.equal(Number(stock.totalStock),17);assert.equal(stock.isLowStock,true);
  assert.deepEqual(await snapshot(),before);
  for(const change of [{name:' '},{salePrice:'-1'},{salePrice:'1.234'},{minimumStock:'-1'},
    {productID:'22222222-2222-4222-8222-222222222222',minimumStock:'0.5'}]) await assert.rejects(update(change));
  await assert.rejects(update({productID:'99999999-9999-4999-8999-999999999999'}),/introuvable/);
  await assert.rejects(update({unit:'piece'}));
  assert.equal(Number((await cds.db.run(SELECT.one.from('shop.Products').where({ID:productID}))).salePrice),95.5);
  assert.deepEqual(await snapshot(),before);
 }finally{await cds.db.disconnect();}
});
