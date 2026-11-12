import { backupDatabase, restoreDatabase } from './database-backups.js';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const database = join(root,'db.sqlite');
const directory = join(root,'backups');
async function serverIsRunning() {
  // Le serveur local habituel ; les autres instances doivent également être arrêtées.
  return new Promise(resolve => {
    const socket = createConnection({host:'127.0.0.1',port:4004});
    socket.setTimeout(1000);
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',()=>{socket.destroy();resolve(false);});
    socket.once('timeout',()=>{socket.destroy();resolve(true);});
  });
}
try {
  const [command, filename, confirmation, ...extra] = process.argv.slice(2);
  if (command === 'backup' && !filename) {
    console.log('Sauvegarde vérifiée : '+backupDatabase(database,directory));
  } else if (command === 'restore' && filename && confirmation === '--confirm' && !extra.length) {
    if (await serverIsRunning()) throw new Error('Arrêter l’application sur le port 4004 avec Ctrl+C avant de restaurer.');
    const rescue = restoreDatabase(database,filename,directory);
    console.log('Restauration terminée. Sauvegarde de secours : '+rescue);
    console.log('Redémarrer avec npm run dev.');
  } else throw new Error('Usage : npm run db:backup OU npm run db:restore -- chemin/sauvegarde.sqlite --confirm');
} catch (error) { console.error(error.message); process.exitCode=1; }
