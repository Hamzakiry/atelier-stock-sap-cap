import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';

test('Web : authentification configurée, rôles et distinction démonstration/installation privée',async()=>{
 process.env.STOCK_DEMO_MODE='true';
 cds.env.requires.db.credentials={url:':memory:'};
 cds.env.requires.auth={kind:'basic',impl:'./srv/stock-basic-auth.cjs'};
 const server=await cds.server({port:0,in_memory:true});
 const base='http://127.0.0.1:'+server.address().port+'/catalog/';
 const get=(path,user,password)=>fetch(base+path,{headers:user?{Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')}: {}});
 try{
  assert.equal((await get('Products')).status,401);
  assert.equal((await get('Products','manager','incorrect')).status,401);
  assert.equal((await get('Products','unknown','viewer-demo')).status,401);
  const info=await(await get('sessionInfo()','manager','manager-demo')).json();assert.equal(info.isDemo,true);assert.equal(info.canManage,true);
  assert.equal((await get('CatalogueChanges','viewer','viewer-demo')).status,403);
  process.env.STOCK_DEMO_MODE='false';delete process.env.STOCK_MANAGER_PASSWORD;
  assert.equal((await get('Products','manager','manager-demo')).status,401,'Aucun mot de passe de démonstration implicite hors mode démo');
  process.env.STOCK_MANAGER_PASSWORD='test-only-password-123456';
  assert.equal((await get('Products','manager',process.env.STOCK_MANAGER_PASSWORD)).status,200);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await cds.db.disconnect();delete process.env.STOCK_DEMO_MODE;delete process.env.STOCK_MANAGER_PASSWORD;}
});
