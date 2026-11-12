import cds from '@sap/cds';
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';

if (!existsSync('db.sqlite')) throw new Error('Base absente : utiliser npm run db:init pour une nouvelle installation.');
const model = await cds.load('*');
const view = cds.compile.to.sql(model, {dialect:'sqlite'})
  .find(sql => /^CREATE VIEW CatalogService_Movements\s/.test(sql));
if (!view) throw new Error('Projection des mouvements introuvable.');
const db = new DatabaseSync('db.sqlite');
db.exec('PRAGMA busy_timeout=5000');
try {
  if (db.prepare('PRAGMA table_info(shop_StockMovements)').all().some(column => column.name === 'createdBy')) {
    console.log('Migration des auteurs déjà appliquée.');
  } else {
    const backup = 'before-movement-authors-' + Date.now() + '.sqlite';
    db.exec("VACUUM INTO '" + backup + "'");
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('ALTER TABLE shop_StockMovements ADD COLUMN createdBy NVARCHAR(255)');
      db.exec('DROP VIEW IF EXISTS CatalogService_Movements');
      db.exec(view);
      db.exec('COMMIT');
      console.log('Auteurs ajoutés ; données conservées. Sauvegarde : ' + backup);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
} finally { db.close(); }
