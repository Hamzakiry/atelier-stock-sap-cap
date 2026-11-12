import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const quote = name => '"' + name.replaceAll('"', '""') + '"';
const schema = (db, prefix='main') => db.prepare(`SELECT type,name,tbl_name,sql FROM ${prefix}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all();
function check(db, prefix='main') {
  const result = db.prepare(`PRAGMA ${prefix}.integrity_check`).all();
  if (result.length !== 1 || Object.values(result[0])[0] !== 'ok') throw new Error('Fichier SQLite invalide ou corrompu.');
  if (db.prepare(`PRAGMA ${prefix}.foreign_key_check`).all().length) throw new Error('Associations SQLite invalides.');
  const tables = schema(db,prefix).filter(item => item.type === 'table').map(item => item.name);
  for (const required of ['shop_Products','shop_Lots','shop_Suppliers','shop_StockMovements','shop_OutboundRequests']) {
    if (!tables.includes(required)) throw new Error('Ce fichier ne contient pas la base Atelier Stock attendue.');
  }
}
export function backupDatabase(databasePath, directory) {
  const source = resolve(databasePath);
  if (!existsSync(source)) throw new Error('Base introuvable : ' + source);
  mkdirSync(directory,{recursive:true});
  const output = join(resolve(directory),'stock-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'.sqlite');
  const db = new DatabaseSync(source,{readOnly:true});
  try {
    db.exec('PRAGMA busy_timeout=5000');
    check(db);
    // SQLite crée une photographie cohérente, y compris les données du journal WAL.
    db.prepare('VACUUM INTO ?').run(output);
  } finally { db.close(); }
  const snapshot = new DatabaseSync(output,{readOnly:true});
  try { check(snapshot); } finally { snapshot.close(); }
  return output;
}
export function restoreDatabase(databasePath, backupPath, directory) {
  const target = resolve(databasePath), source = resolve(backupPath);
  if (target === source) throw new Error('Choisir une sauvegarde distincte de la base actuelle.');
  if (!existsSync(target) || !existsSync(source)) throw new Error('Base ou sauvegarde introuvable.');
  const db = new DatabaseSync(target);
  let inTransaction = false;
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
    db.prepare('ATTACH DATABASE ? AS snapshot').run(source);
    check(db); check(db,'snapshot');
    if (JSON.stringify(schema(db)) !== JSON.stringify(schema(db,'snapshot'))) {
      throw new Error('Versions de schéma différentes : restauration refusée. Ne pas réinitialiser la base.');
    }
    const rescue = backupDatabase(target,directory);
    const tables = schema(db).filter(item => item.type === 'table');
    // Toutes les données reviennent ensemble ; une erreur annule toute la restauration.
    db.exec('BEGIN IMMEDIATE'); inTransaction = true;
    db.exec('PRAGMA defer_foreign_keys=ON');
    for (const table of tables) db.exec(`DELETE FROM main.${quote(table.name)}`);
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA main.table_info(${quote(table.name)})`).all().map(column => quote(column.name)).join(',');
      db.exec(`INSERT INTO main.${quote(table.name)} (${columns}) SELECT ${columns} FROM snapshot.${quote(table.name)}`);
    }
    check(db);
    db.exec('COMMIT'); inTransaction = false;
    return rescue;
  } catch (error) {
    if (inTransaction) db.exec('ROLLBACK');
    throw error;
  } finally { db.close(); }
}
