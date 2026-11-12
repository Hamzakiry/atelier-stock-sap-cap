import cds from '@sap/cds';
export function configureWebDatabase() {
 const connection=process.env.DATABASE_URL;
 if(!connection)throw new Error('DATABASE_URL obligatoire pour le déploiement web.');
 const url=new URL(connection);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('PostgreSQL attendu.');
 cds.env.requires.db={kind:'postgres',impl:'@cap-js/postgres',pool:{min:0,max:2},credentials:{
  host:url.hostname,port:Number(url.port||5432),database:decodeURIComponent(url.pathname.slice(1)),
  user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),ssl:['127.0.0.1','localhost'].includes(url.hostname)?false:{rejectUnauthorized:true}
 }};
 cds.env.requires.auth={kind:'basic',impl:'./srv/stock-basic-auth.cjs'};
 if(process.env.STOCK_DEMO_MODE!=='true' && (!process.env.STOCK_MANAGER_PASSWORD||process.env.STOCK_MANAGER_PASSWORD.length<16)) {
  throw new Error('STOCK_MANAGER_PASSWORD doit contenir au moins 16 caractères hors démonstration.');
 }
}
