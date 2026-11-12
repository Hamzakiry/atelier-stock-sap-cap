import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';

test('HTTP : authentification, lecture Viewer et écritures réservées au Manager',async()=>{
 // Ce serveur utilise exclusivement une base de test en mémoire et un port libre.
 cds.env.requires.db.credentials={url:':memory:'};
 cds.env.requires.auth.users.outsider={password:'outsider-demo',roles:[]};
 const server=await cds.server({port:0,in_memory:true});
 const base='http://127.0.0.1:'+server.address().port+'/catalog/';
 const credentials=(user,password)=>'Basic '+Buffer.from(user+':'+password).toString('base64');
 const call=(path,user,password,body)=>fetch(base+path,{
   method:body===undefined?'GET':'POST',
   headers:{...(user?{Authorization:credentials(user,password)}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 try {
   assert.equal((await call('Products')).status,401);
   assert.equal((await call('Products','viewer','incorrect')).status,401);
   assert.equal((await call('Products','unknown','unknown')).status,401);
   assert.equal((await call('Products','outsider','outsider-demo')).status,403);
   for(const path of ['Products','Lots?$expand=product,supplier','Stock','Movements','Suppliers','Clients','expiryReport(days=30)','sessionInfo()']) {
     const result=await call(path,'viewer','viewer-demo');
     assert.equal(result.status,200,path+' '+await result.text());
   }
   assert.equal((await call('CatalogueChanges')).status,401);
   assert.equal((await call('CatalogueChanges','viewer','viewer-demo')).status,403);
   const viewerInfo=await (await call('sessionInfo()','viewer','viewer-demo')).json();assert.equal(viewerInfo.canManage,false);
   const managerInfo=await (await call('sessionInfo()','manager','manager-demo')).json();assert.equal(managerInfo.canManage,true);
   const actions=Object.entries(cds.model.definitions.CatalogService.actions).filter(([,action])=>action.kind==='action').map(([name])=>name);
   assert.ok(actions.length>=8);
   for(const action of actions) {
     const response=await call(action,'viewer','viewer-demo',{});
     assert.equal(response.status,403,action+' '+await response.text());
   }
   const created=await call('createProduct','manager','manager-demo',{reference:'AUTH-TEST',name:'Produit autorisé',unit:'kg',salePrice:'2.00',minimumStock:'0'});
   assert.equal(created.status,200,await created.clone().text());
   const product=await created.json();
   const updated=await call('updateProduct','manager','manager-demo',{productID:product.ID,name:'Produit modifié',salePrice:'3.00',minimumStock:'1.000'});
   assert.equal(updated.status,200,await updated.text());
   const audit=await call('CatalogueChanges','manager','manager-demo');
   assert.equal(audit.status,200);const log=(await audit.json()).value;
   assert.equal(log.length,3);assert.ok(log.every(item=>item.createdBy==='manager'));
   const forged=await call('CatalogueChanges','manager','manager-demo',{createdBy:'fake'});
   assert.equal(forged.status,405);
   const check=await (await call("Products?$filter=reference%20eq%20'AUTH-TEST'",'viewer','viewer-demo')).json();
   assert.equal(check.value.length,1);assert.equal(check.value[0].name,'Produit modifié');
   const movements=await (await call('Movements','viewer','viewer-demo')).json();assert.equal(movements.value.length,0);
 }finally{
   server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await cds.db.disconnect();
 }
});
