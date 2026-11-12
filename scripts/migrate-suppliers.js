import cds from '@sap/cds';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

if (!existsSync('db.sqlite')) throw new Error('Initialiser la base avec npm run db:init.');
const model = await cds.load(['db','srv']);
const sql = cds.compile.to.sql(model, {dialect:'sqlite'});
const db = new DatabaseSync('db.sqlite');
db.exec('PRAGMA busy_timeout = 5000');
const snapshot = () => JSON.stringify({
  products:db.prepare('SELECT * FROM shop_Products ORDER BY ID').all(),
  lots:db.prepare('SELECT ID, remainingQuantity FROM shop_Lots ORDER BY ID').all(),
  movements:db.prepare('SELECT * FROM shop_StockMovements ORDER BY ID').all()
});
try {
  if (db.prepare('PRAGMA table_info(shop_Lots)').all().some(column=>column.name==='supplier_ID')) {
    console.log('Migration fournisseurs déjà appliquée : aucune modification.');
  } else {
    const backup = 'before-suppliers-' + Date.now() + '.sqlite';
    db.exec("VACUUM INTO '" + backup + "'");
    const before = snapshot();
    db.exec('BEGIN IMMEDIATE');
    try {
      const table = sql.find(statement => /^CREATE TABLE shop_Suppliers\s/.test(statement));
      const supplierView = sql.find(statement => /^CREATE VIEW CatalogService_Suppliers\s/.test(statement));
      const lotsView = sql.find(statement => /^CREATE VIEW CatalogService_Lots\s/.test(statement));
      assert.ok(table && supplierView && lotsView, 'DDL attendu manquant');
      db.exec(table);
      db.exec('ALTER TABLE shop_Lots ADD COLUMN supplier_ID NVARCHAR(36)');
      db.exec('DROP VIEW CatalogService_Lots');
      db.exec(lotsView);
      db.exec(supplierView);
      assert.equal(snapshot(),before,'La migration doit conserver produits, quantités et mouvements.');
      db.exec('COMMIT');
      console.log('Migration appliquée. Données conservées. Sauvegarde : ' + backup);
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
} finally {db.close();}
