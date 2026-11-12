import { existsSync } from 'node:fs';
import cds from '@sap/cds';

// Initialiser une seule fois : ne jamais réimporter les données sur une base existante.
if (existsSync('db.sqlite')) {
  console.log('db.sqlite existe déjà : données conservées, aucune initialisation.');
} else {
  const model = await cds.load('*');
  try {
    await cds.deploy(model).to('sqlite:db.sqlite');
    console.log('Base locale créée avec les produits et lots fictifs.');
  } finally {
    if (cds.db) await cds.db.disconnect();
  }
}
