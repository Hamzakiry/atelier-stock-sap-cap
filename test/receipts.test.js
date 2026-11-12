import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

test('Création produit et réception : validations, historique et transaction', async () => {
  const model = await cds.load(['db', 'srv']);
  cds.compile.to.edmx(model, {service:'CatalogService'});
  cds.model = model;
  await cds.deploy(model).to('sqlite::memory:');
  await cds.serve('CatalogService');
  const srv = cds.services.CatalogService;
  const {SELECT} = cds.ql;
  const productData = { reference:'TEST-SUGAR', name:'Sucre glace test', unit:'kg', salePrice:'25.50', minimumStock:'2.000' };
  const create = data => srv.send('createProduct', {...productData, ...data});
  const rejects = (promise, code) => assert.rejects(promise, e => Number(e.code) === code || e.status === code);
  try {
    const p = await create({});
    assert.equal(p.salePrice,'25.50');
    let stock = await srv.run(SELECT.one.from('CatalogService.Stock').where({ID:p.ID}));
    assert.equal(Number(stock.totalStock),0);
    await rejects(create({}),409);
    for (const change of [{reference:' ',name:'X'}, {reference:'B',salePrice:'-1'}, {reference:'B',salePrice:'1.234'}, {reference:'B',unit:'litre'}, {reference:'B',unit:'piece',minimumStock:'0.5'}]) {
      await rejects(create(change),400);
    }
    const receiptData = {productID:p.ID,lotNumber:'TEST-001',receivedOn:'2026-10-01',expiresOn:'2027-12-31',quantity:'12.500',purchasePrice:'16.00'};
    const receive = data => srv.send('receiveLot',{...receiptData,...data});
    const lot = await receive({});
    stock = await srv.run(SELECT.one.from('CatalogService.Stock').where({ID:p.ID}));
    assert.equal(Number(stock.totalStock),12.5);
    const movements = await cds.db.run(SELECT.from('shop.StockMovements').where({lot_ID:lot.ID}));
    assert.equal(movements.length,1); assert.equal(movements[0].kind,'IN');
    assert.equal(Number(movements[0].quantity),12.5);
    await rejects(receive({}),409);
    for (const change of [{lotNumber:'BAD',quantity:'0'}, {lotNumber:'BAD',purchasePrice:'-1'}, {lotNumber:'BAD',expiresOn:'2026-09-01'}, {lotNumber:'BAD',receivedOn:'2026-02-30'}, {lotNumber:'BAD',receivedOn:'2999-01-01',expiresOn:null}]) await rejects(receive(change),400);
    await rejects(receive({productID:'99999999-9999-4999-8999-999999999999'}),404);
    const piece = await create({reference:'TEST-PIECE',unit:'piece',minimumStock:'1'});
    await rejects(receive({productID:piece.ID,quantity:'0.5'}),400);
    await assert.rejects(cds.tx(async () => { await receive({lotNumber:'ROLLBACK'}); throw new Error('Rollback test'); }), /Rollback test/);
    assert.equal((await cds.db.run(SELECT.from('shop.Lots').where({product_ID:p.ID}))).length,1);
    assert.equal((await cds.db.run(SELECT.from('shop.StockMovements'))).length,1);
  } finally {await cds.db.disconnect();}
});
