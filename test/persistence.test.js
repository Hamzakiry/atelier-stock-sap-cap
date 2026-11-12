import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};

test('FEFO : sortie persistante et répétition après nouveau processus sans doublon', async () => {
  const filename = `test/persistence-${randomUUID()}.sqlite`;
  try {
    const model = await cds.load(['db', 'srv']);
    cds.model = model;
    await cds.deploy(model).to(`sqlite:${filename}`);
    await cds.serve('CatalogService');
    const proposal=await cds.services.CatalogService.send('proposeFefo',{productID:'11111111-1111-4111-8111-111111111111',quantity:'2.000'});
    const confirmation={requestID:cds.utils.uuid(),productID:proposal.productID,quantity:proposal.quantity,allocations:proposal.allocations,note:'Test persistance FEFO'};
    await cds.services.CatalogService.send('confirmFefo',confirmation);
    await cds.db.disconnect();
    // Un autre processus se connecte sans redéployer ni recharger le CSV.
    const reader = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import cds from '@sap/cds';
// Les scénarios métier s’exécutent comme un gestionnaire explicite.
cds.context={user:new cds.User({id:'test-manager',roles:['Manager']})};
      import assert from 'node:assert/strict';
      const db = await cds.connect.to({kind:'sqlite', credentials:{url:${JSON.stringify(filename)}}});
      const stocks = await db.run('SELECT totalStock FROM CatalogService_Stock WHERE reference = ?', ['P001']);
      const history = await db.run('SELECT quantity, kind FROM shop_StockMovements');
      assert.equal(Number(stocks[0].totalStock),15);
      assert.equal(history.length,1);
      assert.equal(history[0].kind,'OUT');
      assert.equal(Number(history[0].quantity),2);
      cds.model=await cds.load(['db','srv']);cds.db=db;
      await cds.serve('CatalogService');
      await cds.services.CatalogService.send('confirmFefo',${JSON.stringify(confirmation)});
      const after=await db.run('SELECT quantity FROM shop_StockMovements');
      assert.equal(after.length,1,'Le même identifiant ne doit pas créer une deuxième sortie');
      const remaining=await db.run('SELECT totalStock FROM CatalogService_Stock WHERE reference = ?', ['P001']);
      assert.equal(Number(remaining[0].totalStock),15);
      await db.disconnect();
    `], {encoding:'utf8', timeout:30000});
    assert.equal(reader.status, 0, reader.stderr || reader.error?.message);
  } finally {
    if (cds.db) await cds.db.disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(filename + suffix)) unlinkSync(filename + suffix);
    }
  }
});
