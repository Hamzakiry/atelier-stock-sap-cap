import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';

test('HTTP : auteur issu de CAP pour réception, mouvement, inventaire et FEFO', async () => {
  cds.env.requires.db.credentials = {url:':memory:'};
  const server = await cds.server({port:0, in_memory:true});
  const base = 'http://127.0.0.1:' + server.address().port + '/catalog/';
  const call = (path, body, user='manager') => fetch(base + path, {
    method:body === undefined ? 'GET' : 'POST',
    headers:{Authorization:'Basic '+Buffer.from(user+':'+user+'-demo').toString('base64'),
      ...(body === undefined ? {} : {'Content-Type':'application/json'})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})
  });
  const post = async (path, body) => {
    const response = await call(path,body);
    assert.equal(response.status,200,await response.clone().text());
    return response.json();
  };
  try {
    const product = await post('createProduct',{reference:'AUTHOR',name:'Produit test auteur',unit:'kg',salePrice:'1',minimumStock:'0'});
    const lot = await post('receiveLot',{productID:product.ID,lotNumber:'AUTHOR-1',receivedOn:new Date().toISOString().slice(0,10),quantity:'10',purchasePrice:'1'});
    const movement = await post('recordMovement',{lotID:lot.ID,kind:'OUT',quantity:'1'});
    assert.equal(movement.createdBy,'manager');
    const correction = await post('adjustInventory',{lotID:lot.ID,expectedQuantity:'9',countedQuantity:'8',reason:'Comptage de contrôle'});
    assert.equal(correction.createdBy,'manager');
    const response = await call(`proposeFefo(productID=${product.ID},quantity=2)`);
    assert.equal(response.status,200,await response.clone().text());
    const proposal = await response.json();
    const confirmation = {requestID:cds.utils.uuid(),productID:product.ID,quantity:'2',allocations:proposal.allocations,note:'Contrôle auteur FEFO'};
    const first = await post('confirmFefo',confirmation);
    assert.equal(first.value.length,1);
    assert.equal(first.value[0].createdBy,'manager');
    assert.deepEqual(await post('confirmFefo',confirmation),first);
    const forged = await call('recordMovement',{lotID:lot.ID,kind:'OUT',quantity:'1',createdBy:'autre-utilisateur'});
    assert.equal(forged.status,400,await forged.text());
    const history = await (await call(`Movements?$filter=lot_ID%20eq%20${lot.ID}`,undefined,'viewer')).json();
    assert.equal(history.value.length,4);
    assert.ok(history.value.every(item => item.createdBy === 'manager'));
    const stored = await (await call(`Lots(${lot.ID})`,undefined,'viewer')).json();
    assert.equal(Number(stored.remainingQuantity),6);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await cds.db.disconnect();
  }
});
