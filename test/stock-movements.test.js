import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

 test('Mouvements : quantités, historique, refus et rollback', async () => {
  const model = await cds.load(['db', 'srv']);
  cds.compile.to.edmx(model, { service: 'CatalogService' });
  cds.model = model;
  await cds.deploy(model).to('sqlite::memory:');
  await cds.serve('CatalogService');
  const srv = cds.services.CatalogService;
  const { SELECT, UPDATE } = cds.ql;
  const almond = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const cream = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  const move = (kind, quantity, lotID = almond) => srv.send('recordMovement', { lotID, kind, quantity });
  const stock = async () => Number((await cds.db.run(SELECT.one.from('shop.Lots').where({ ID: almond }))).remainingQuantity);
  const count = async () => (await cds.db.run(SELECT.from('shop.StockMovements'))).length;
  try {
    await move('OUT', '2.250');
    assert.equal(await stock(), 7.75);
    await move('IN', '1.500');
    assert.equal(await stock(), 9.25);
    assert.equal(await count(), 2);
    for (const [kind, quantity, id, code] of [
      ['OUT', '100', almond, 409], ['IN', '0', almond, 400],
      ['IN', '-1', almond, 400], ['IN', '0.0001', almond, 400],
      ['BAD', '1', almond, 400], ['OUT', '0.5', cream, 400],
      ['IN', '1', '99999999-9999-4999-8999-999999999999', 404]
    ]) {
      await assert.rejects(move(kind, quantity, id), e => Number(e.code) === code || e.status === code);
    }
    assert.equal(await stock(), 9.25);
    assert.equal(await count(), 2);
    await cds.db.run(UPDATE('shop.Lots').set({ expiresOn: '2000-01-01' }).where({ ID: cream }));
    await assert.rejects(move('OUT', '1', cream), /périmé/);
    await assert.rejects(cds.tx(async () => {
      await move('IN', '1');
      throw new Error('Simulated failure');
    }), /Simulated failure/);
    assert.equal(await stock(), 9.25);
    assert.equal(await count(), 2);
    await move('OUT', '9.250');
    assert.equal(await stock(), 0);
    assert.equal(await count(), 3);
  } finally {
    await cds.db.disconnect();
  }
});
