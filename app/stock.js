const $ = id => document.getElementById(id);
let lots = [];
let products = [];
let catalogueItems = [];
let stockItems = [];
let availabilityItems = [];
let editingProductID = null;
let editingSupplierID = null;
let busy = false;
let authHeader = '';
let canManage = false;
window.stockLoggedIn = false;
const format = value => Number(value).toLocaleString('fr-MA', { maximumFractionDigits: 3 });
const unitLabel = unit => unit === 'kg' ? 'kg' : 'pièce(s)';
function message(text, error = false) {
  $('message').textContent = text;
  $('message').className = error ? 'error' : 'success';
}
async function request(path, options) {
  const response = await fetch('/catalog/' + path, {credentials:'omit',...options,
    headers:{...options?.headers,...(authHeader ? {Authorization:authHeader} : {})}});
  const data = await response.json().catch(() => null);
  if (!response.ok) {const error=new Error(data?.error?.message || `Erreur HTTP ${response.status}`);error.status=response.status;throw error;}
  if (!data) throw new Error('Réponse inattendue du serveur.');
  return data;
}
function row(target, values) {
  const tr = document.createElement('tr');
  for (const [column, value] of values.entries()) {
    const td = document.createElement('td');
    td.dataset.i18nRaw='';
    const uiColumns={'history-body':[2,3],'expiry-body':[1,2,3,4,5,6],'audit-body':[1,3],'stock-body':[1],'products-body':[2,3],'fefo-body':[2],'lots-body':[3]};
    if (value instanceof Node) {value.dataset.i18nUi='';td.append(value);}
    else {
      const isEmpty=column===0 && ['Aucun mouvement enregistré.','Aucun fournisseur enregistré.','Aucun client importé.','Aucun produit correspondant.','Aucun produit trouvé.'].includes(value);
      if(uiColumns[target.id]?.includes(column) || isEmpty || (target.id==='fefo-body' && column===1 && value==='Non renseignée') || (target.id==='supplier-body' && column===1 && value==='Aucun fournisseur enregistré.')){const label=document.createElement('span');label.dataset.i18nUi='';label.textContent=value;td.append(label);}
      else td.textContent=value;
    }
    tr.append(td);
  }
  target.append(tr);
}
function updateLotInfo() {
  const lot = lots.find(item => item.ID === $('lot').value);
  if (!lot) { $('lot-info').textContent = 'Aucun lot disponible.'; return; }
  const unit = lot.product.unit;
  $('quantity-unit').textContent = `(${unitLabel(unit)})`;
  $('quantity').step = unit === 'kg' ? '0.001' : '1';
  $('quantity').min = unit === 'kg' ? '0.001' : '1';
  $('lot-info').textContent = `Disponible : ${format(lot.remainingQuantity)} ${unitLabel(unit)} · Péremption : ${lot.expiresOn || 'non renseignée'}`;
}
async function load() {
  // Suivre les pages OData pour ne pas masquer une partie du stock.
  async function all(path) {
    const first = await request(path);
    const values = [...first.value];
    let next = first['@odata.nextLink'];
    while (next) {
      const url = new URL(next, new URL('/catalog/' + path, location.origin));
      if (url.origin !== location.origin || !url.pathname.startsWith('/catalog/')) throw new Error('Pagination inattendue.');
      const page = await request(url.pathname.slice('/catalog/'.length) + url.search);
      values.push(...page.value); next = page['@odata.nextLink'];
    }
    return values;
  }
  const [stocks, loadedLots, history, suppliers, expiry, catalogue, clients, audit] = await Promise.all([
    all('Stock?$orderby=name'), all('Lots?$expand=product,supplier&$orderby=lotNumber'),
    request('Movements?$expand=lot($expand=product)&$orderby=recordedAt%20desc&$top=20'), all('Suppliers?$orderby=name'), request(`expiryReport(days=${$('expiry-days').value})`), all('Products?$orderby=name'), all('Clients?$orderby=name'), canManage ? request('CatalogueChanges?$orderby=recordedAt%20desc,changeID,field&$top=50') : Promise.resolve({value:[]})
  ]);
  $('audit-body').replaceChildren();
  const fieldLabels={name:'Nom',salePrice:'Prix par unité',minimumStock:'Seuil minimum'};
  for(const change of audit.value) row($('audit-body'), [new Date(change.recordedAt).toLocaleString('fr-MA'),
    change.entityType==='Products'?'Produit':'Fournisseur',change.reference,fieldLabels[change.field]||change.field,
    change.oldValue,change.newValue,change.createdBy]);
  $('audit-status').textContent=!canManage ? 'Accès réservé au gestionnaire.' : audit.value.length ? '' : 'Aucune modification enregistrée depuis l’activation du journal.';
  $('clients-body').replaceChildren();
  for (const client of clients) row($('clients-body'), [client.name, client.ice || '—', client.address || '—', client.phone || '—', client.email || '—']);
  if (!clients.length) row($('clients-body'), ['Aucun client importé.', '', '', '', '']);
  catalogueItems = catalogue;
  renderCatalogue();
  availabilityItems=expiry.value;
  $('expiry-body').replaceChildren();
  for (const item of expiry.value) {
    const quantity = value => format(value) + ' ' + unitLabel(item.unit);
    row($('expiry-body'), [item.name, quantity(item.physicalStock), quantity(item.availableStock),
      quantity(item.expiredStock), quantity(item.expiringStock), quantity(item.undatedStock),
      item.lowAvailableStock ? 'Stock faible' : 'Seuil respecté']);
  }
  const selectedSupplier = $('receipt-supplier').value;
  $('receipt-supplier').replaceChildren();
  const emptySupplier = document.createElement('option');emptySupplier.dataset.i18nUi='';
  emptySupplier.value = ''; emptySupplier.textContent = 'Non renseigné';
  $('receipt-supplier').append(emptySupplier);
  $('supplier-body').replaceChildren();
  for (const supplier of suppliers) {
    const option = document.createElement('option'); option.dataset.i18nRaw=''; option.value = supplier.ID;
    option.textContent = supplier.code + ' — ' + supplier.name;
    $('receipt-supplier').append(option);
    const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Modifier';
    edit.hidden=!canManage;
    edit.setAttribute('aria-label','Modifier le fournisseur '+supplier.name);
    edit.addEventListener('click',()=>{
      if(busy)return;
      editingSupplierID=supplier.ID;$('edit-supplier-form').hidden=false;
      $('edit-supplier-identity').textContent='Code : '+supplier.code+' (conservé)';
      $('edit-supplier-name').value=supplier.name;$('supplier-edit-status').textContent='';$('edit-supplier-name').focus();
    });
    row($('supplier-body'), [supplier.code, supplier.name, edit]);
  }
  if (suppliers.some(item => item.ID === selectedSupplier)) $('receipt-supplier').value = selectedSupplier;
  if (!suppliers.length) row($('supplier-body'), ['—', 'Aucun fournisseur enregistré.', '']);
  $('lots-body').replaceChildren();
  for (const lot of loadedLots) row($('lots-body'), [lot.product.name, lot.lotNumber,
    lot.supplier?.name || 'Non renseigné', format(lot.remainingQuantity) + ' ' + unitLabel(lot.product.unit), lot.expiresOn || '—']);
  lots = loadedLots;
  const inventorySelected=$('inventory-lot').value;
  $('inventory-lot').replaceChildren();
  for(const lot of lots) {
    const option=document.createElement('option');option.dataset.i18nRaw='';option.value=lot.ID;
    option.textContent=lot.product.name+' — '+lot.lotNumber;$('inventory-lot').append(option);
  }
  if(lots.some(lot=>lot.ID===inventorySelected)) $('inventory-lot').value=inventorySelected;
  updateInventoryInfo();
  products = stocks;
  const selectedFefo = fefoState?.plan.productID || $('fefo-product').value;
  $('fefo-product').replaceChildren();
  for (const product of stocks) {
    const option = document.createElement('option'); option.dataset.i18nRaw=''; option.value=product.ID;option.textContent=product.name;
    $('fefo-product').append(option);
  }
  $('fefo-product').value=stocks.some(product=>product.ID===selectedFefo)?selectedFefo:'';
  updateFefoControls();
  const selectedProduct = $('receipt-product').value;
  $('receipt-product').replaceChildren();
  for (const product of products) {
    const option = document.createElement('option'); option.dataset.i18nRaw='';
    option.value = product.ID; option.textContent = `${product.reference} — ${product.name}`;
    $('receipt-product').append(option);
  }
  $('receipt-product').value=products.some(item=>item.ID===selectedProduct)?selectedProduct:'';
  updateReceiptUnit();
  $('receipt-submit').disabled = busy || !products.length;
  $('product-count').textContent = stocks.length;
  $('low-count').textContent = stocks.filter(item => item.isLowStock).length;
  $('lot-count').textContent = lots.length;
  stockItems=stocks;
  renderStockOverview();
  const selected = $('lot').value;
  $('lot').replaceChildren();
  for (const lot of lots) {
    const option = document.createElement('option'); option.dataset.i18nRaw='';
    option.value = lot.ID; option.textContent = `${lot.product.name} — ${lot.lotNumber}`;
    $('lot').append(option);
  }
  if (lots.some(item => item.ID === selected)) $('lot').value = selected;
  updateLotInfo();
  $('history-body').replaceChildren();
  for (const item of history.value) {
    row($('history-body'), [new Date(item.recordedAt).toLocaleString('fr-MA'),
      `${item.lot.product.name} / ${item.lot.lotNumber}`, item.kind === 'IN' ? 'Entrée' : 'Sortie',
      `${format(item.quantity)} ${unitLabel(item.lot.product.unit)}`, item.note || '—', item.createdBy || 'Non renseigné (historique)']);
  }
  if (!history.value.length) row($('history-body'), ['Aucun mouvement enregistré.', '', '', '', '', '']);
  $('submit').disabled = busy || !lots.length;
  applyRole();
  if(typeof renderStockCharts==='function') renderStockCharts();
  refreshProductSearches();
}
$('lot').addEventListener('change', updateLotInfo);
$('expiry-days').addEventListener('change', () => load().catch(error => message(error.message, true)));
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  try { await load(); message('Données actualisées.'); }
  catch (error) { message(error.message, true); }
  finally { $('refresh').disabled = false; }
});
$('movement-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true; $('submit').disabled = true;
  let saved = false;
  try {
    await request('recordMovement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotID: $('lot').value, kind: $('kind').value,
        quantity: $('quantity').value, note: $('note').value.trim() })
    });
    saved = true; $('quantity').value = ''; $('note').value = '';
    await load(); message('Mouvement enregistré. Stock et historique actualisés.');
  } catch (error) {
    message(saved ? `Mouvement enregistré, mais actualisation impossible : ${error.message}. Cliquez sur Actualiser.` : error.message, true);
  } finally { busy = false; $('submit').disabled = !lots.length; updateFefoControls(); }
});


function updateReceiptUnit() {
  const product = products.find(item => item.ID === $('receipt-product').value);
  if (!product) { $('receipt-unit').textContent=''; return; }
  $('receipt-unit').textContent = `(${unitLabel(product.unit)})`;
  $('receipt-quantity').step = product.unit === 'kg' ? '0.001' : '1';
  $('receipt-quantity').min = product.unit === 'kg' ? '0.001' : '1';
}
$('receipt-product').addEventListener('change', updateReceiptUnit);
$('new-unit').addEventListener('change', () => {
  $('new-minimum').step = $('new-unit').value === 'piece' ? '1' : '0.001';
});
// Une seule mutation à la fois ; le serveur reste responsable des validations.
function bindCreateForm(formID, statusID, action, payload, success) {
  $(formID).addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const buttons = [...document.querySelectorAll('button[type="submit"]')];
    buttons.forEach(button => { button.disabled = true; });
    let saved = false;
    try {
      await request(action, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload()) });
      saved = true;
      $(formID).reset();
      if (formID === 'receipt-form') setReceiptDate();
      if (formID === 'product-form') $('new-minimum').step = '0.001';
      await load();
      $(statusID).textContent = success;
      message(success);
    } catch (error) {
      const text = saved ? `Enregistré, mais actualisation impossible : ${error.message}. Cliquez sur Actualiser.` : error.message;
      $(statusID).textContent = text;
      message(text, true);
    } finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
      $('submit').disabled = !lots.length;
      $('receipt-submit').disabled = !products.length;
      updateFefoControls();
    }
  });
}
function setReceiptDate() {
  const now = new Date();
  $('receipt-date').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
setReceiptDate();
bindCreateForm('product-form', 'product-status', 'createProduct', () => ({
  reference: $('new-reference').value.trim(), name: $('new-name').value.trim(), unit: $('new-unit').value,
  salePrice: $('new-price').value, minimumStock: $('new-minimum').value
}), 'Produit créé. Vous pouvez maintenant recevoir son premier lot.');
bindCreateForm('receipt-form', 'receipt-status', 'receiveLot', () => ({
  supplierID: $('receipt-supplier').value || null, productID: $('receipt-product').value, lotNumber: $('receipt-number').value.trim(),
  receivedOn: $('receipt-date').value, expiresOn: $('receipt-expiry').value || null,
  quantity: $('receipt-quantity').value, purchasePrice: $('receipt-price').value
}), 'Lot reçu. Le stock et son mouvement d’entrée sont enregistrés.');
bindCreateForm('supplier-form', 'supplier-status', 'createSupplier', () => ({code:$('supplier-code').value.trim(),name:$('supplier-name').value.trim()}), 'Fournisseur créé et disponible pour les réceptions.');


// FEFO : une proposition ne réserve pas les lots. La confirmation est revérifiée par CAP.
const pendingFefoKey = 'atelier-stock-fefo-pending-v1';
let fefoState = null;
try {
  const saved = JSON.parse(sessionStorage.getItem(pendingFefoKey) || 'null');
  if(saved?.plan?.allocations?.length && saved.requestID && typeof saved.note === 'string') fefoState=saved;
} catch { sessionStorage.removeItem(pendingFefoKey); }
function updateFefoControls() {
  applyRole();
  $('supplier-edit-save').disabled=busy;
  $('supplier-edit-cancel').disabled=busy;
  $('inventory-save').disabled=busy || !lots.length;
  $('edit-save').disabled=busy;
  $('edit-cancel').disabled=busy;
  $('submit').disabled=busy || !lots.length;
  $('receipt-submit').disabled=busy || !products.length;
  $('product-form').querySelector('button[type="submit"]').disabled=busy;
  $('supplier-form').querySelector('button[type="submit"]').disabled=busy;
  const pending = fefoState?.note !== null && fefoState !== null;
  $('fefo-product-search').disabled=busy || pending;
  const product=products.find(product=>product.ID===$('fefo-product').value);
  $('fefo-unit').textContent=product ? `(${unitLabel(product.unit)})` : '';
  $('fefo-quantity').step=product?.unit==='piece' ? '1' : '0.001';
  $('fefo-quantity').min=product?.unit==='piece' ? '1' : '0.001';
  for(const id of ['fefo-product','fefo-quantity','fefo-note']) $(id).disabled=pending;
  $('fefo-propose').disabled=busy || pending || !products.length;
  $('fefo-confirm').disabled=busy || !fefoState;
  $('fefo-confirm').textContent=pending ? 'Réessayer la même confirmation' : 'Confirmer cette sortie';
}
function showFefoPlan() {
  $('fefo-proposal').hidden=!fefoState;
  if(!fefoState) {updateFefoControls();return;}
  const {plan}=fefoState;
  $('fefo-body').replaceChildren();
  for(const allocation of plan.allocations) row($('fefo-body'),[allocation.lotNumber,allocation.expiresOn || 'Non renseignée',`${format(allocation.quantity)} ${unitLabel(plan.unit)}`]);
  const name=products.find(product=>product.ID===plan.productID)?.name || 'Produit sélectionné';
  $('fefo-summary').textContent=`${name} : ${format(plan.quantity)} ${unitLabel(plan.unit)} sur ${plan.allocations.length} lot(s).`;
  $('fefo-warning').textContent=plan.allocations.some(allocation=>!allocation.expiresOn) ? 'Attention : la proposition contient un lot sans date de péremption.' : 'Le stock sera revérifié lors de la confirmation.';
  updateFefoControls();
}
function invalidateFefo() {
  if(fefoState?.note !== null && fefoState!==null) return;
  fefoState=null;showFefoPlan();
}
$('fefo-product').addEventListener('change',invalidateFefo);
$('fefo-quantity').addEventListener('input',invalidateFefo);
$('fefo-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || fefoState?.note!==null && fefoState!==null)return;
  busy=true;updateFefoControls();
  try {
    const productID=$('fefo-product').value,quantity=$('fefo-quantity').value;
    const plan=await request(`proposeFefo(productID=${encodeURIComponent(productID)},quantity=${encodeURIComponent(quantity)})`);
    fefoState={plan,requestID:crypto.randomUUID(),note:null};
    showFefoPlan();$('fefo-status').textContent='Proposition calculée. Aucun stock n’a encore été modifié.';
  } catch(error){fefoState=null;showFefoPlan();$('fefo-status').textContent=error.message;}
  finally {busy=false;updateFefoControls();}
});
$('fefo-confirm').addEventListener('click',async()=>{
  if(busy || !fefoState)return;
  busy=true;let saved=false;
  try {
    if(fefoState.note===null) fefoState.note=$('fefo-note').value.trim();
    // Mémoriser le même identifiant AVANT l’envoi, pour une reprise après perte de réponse.
    sessionStorage.setItem(pendingFefoKey,JSON.stringify(fefoState));
    updateFefoControls();
    const {plan,requestID,note}=fefoState;
    await request('confirmFefo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      requestID,productID:plan.productID,quantity:plan.quantity,allocations:plan.allocations,note
    })});
    saved=true;sessionStorage.removeItem(pendingFefoKey);fefoState=null;
    $('fefo-quantity').value='';$('fefo-note').value='';showFefoPlan();
    await load();$('fefo-status').textContent='Sortie FEFO enregistrée. Stock et historique actualisés.';
  } catch(error){
    if(error.status===400 || error.status===404 || error.status===409 && /Recalculer|insuffisant|périmé/.test(error.message)) {
      sessionStorage.removeItem(pendingFefoKey);fefoState=null;showFefoPlan();
    }
    $('fefo-status').textContent=saved ? `Sortie enregistrée. Actualisez les données : ${error.message}` : `${error.message}${fefoState ? ' Vous pouvez réessayer la même confirmation sans doubler la sortie.' : ''}`;
  } finally {busy=false;updateFefoControls();}
});
if(fefoState){$('fefo-quantity').value=fefoState.plan.quantity;$('fefo-note').value=fefoState.note;showFefoPlan();$('fefo-status').textContent='Une confirmation est en attente. Réessayez avec le même identifiant pour connaître son résultat.';}
function searchText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
}
function renderCatalogue() {
  const query=searchText($('product-search').value);
  const matches=catalogueItems.filter(item=>searchText(item.name+' '+item.reference).includes(query));
  $('products-body').replaceChildren();
  for(const item of matches) {
    const button=document.createElement('button');button.type='button';button.className='secondary';
    button.hidden=!canManage;button.textContent='Modifier';button.setAttribute('aria-label','Modifier '+item.name);
    button.addEventListener('click',()=>{
      if(busy)return;
      editingProductID=item.ID;
      $('edit-product-panel').hidden=false;
      $('edit-product-identity').textContent=item.reference+' — '+unitLabel(item.unit);
      $('edit-name').value=item.name;$('edit-price').value=item.salePrice;$('edit-price').labels[0].textContent=item.priceBasis==='HT'?'Nouveau prix HT en MAD par unité':'Nouveau prix de vente en MAD par unité';$('edit-minimum').value=item.minimumStock;
      $('edit-minimum').step=item.unit==='piece' ? '1' : '0.001';
      $('edit-status').textContent='';$('edit-name').focus();
    });
    row($('products-body'),[item.reference,item.name,unitLabel(item.unit),
      Number(item.salePrice).toLocaleString('fr-MA',{style:'currency',currency:'MAD'}) + (item.priceBasis === 'HT' ? ' HT' : ''),format(item.minimumStock),button]);
  }
  if(!matches.length)row($('products-body'),['Aucun produit trouvé.','','','','','']);
  $('product-search-count').textContent=matches.length+' produit(s) affiché(s) sur '+catalogueItems.length;
}
$('product-search').addEventListener('input',renderCatalogue);
$('edit-cancel').addEventListener('click',()=>{editingProductID=null;$('edit-product-panel').hidden=true;});
$('edit-product-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !editingProductID)return;
  busy=true;updateFefoControls();let saved=false;
  try {
    await request('updateProduct',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      productID:editingProductID,name:$('edit-name').value.trim(),salePrice:$('edit-price').value,minimumStock:$('edit-minimum').value
    })});
    saved=true;editingProductID=null;$('edit-product-panel').hidden=true;
    await load();message('Produit modifié. Les quantités et les mouvements sont conservés.');
  }catch(error){const text=saved ? 'Modification enregistrée, mais actualisation impossible : '+error.message : error.message;
    $('edit-status').textContent=text;message(text,true);
  }finally{busy=false;updateFefoControls();}
});
function updateInventoryInfo() {
  const lot=lots.find(lot=>lot.ID===$('inventory-lot').value);
  const previous=$('inventory-expected').value;
  const updated=lot ? lot.remainingQuantity : '';
  if(previous!=='' && previous!==updated && $('inventory-counted').value!=='') {
    $('inventory-counted').value='';
    $('inventory-status').textContent='Le stock affiché a changé. Refaire le comptage avant de corriger.';
  }
  $('inventory-expected').value=updated;
  $('inventory-unit').textContent=lot ? '('+unitLabel(lot.product.unit)+')' : '';
  $('inventory-counted').step=lot?.product.unit==='piece' ? '1' : '0.001';
  $('inventory-save').disabled=busy || !lot;
  updateInventoryPreview();
}
function updateInventoryPreview() {
  const value=$('inventory-counted').value;
  const expected=$('inventory-expected').value;
  if(value==='' || expected==='') {$('inventory-preview').textContent='Saisir la quantité comptée pour voir l’écart.';return;}
  const delta=(Math.round(Number(value)*1000)-Math.round(Number(expected)*1000))/1000;
  $('inventory-preview').textContent=delta===0 ? 'Aucun écart : aucune correction nécessaire.' : (delta>0 ? 'Entrée de correction : ' : 'Sortie de correction : ')+format(Math.abs(delta));
}
$('inventory-lot').addEventListener('change',()=>{$('inventory-counted').value='';$('inventory-status').textContent='';updateInventoryInfo();});
$('inventory-counted').addEventListener('input',updateInventoryPreview);
$('inventory-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const data={lotID:$('inventory-lot').value,expectedQuantity:$('inventory-expected').value,
    countedQuantity:$('inventory-counted').value,reason:$('inventory-reason').value.trim()};
  busy=true;updateFefoControls();let saved=false;
  try {
    await request('adjustInventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    saved=true;$('inventory-counted').value='';$('inventory-reason').value='';
    await load();$('inventory-status').textContent='Correction enregistrée avec son motif. Stock et historique actualisés.';
  }catch(error){$('inventory-status').textContent=saved ? 'Correction enregistrée, mais actualisation impossible : '+error.message : error.message+(/stock.*chang|modifié entre-temps/i.test(error.message) ? ' Actualiser les données avant une nouvelle tentative.' : '');}
  finally{busy=false;updateFefoControls();}
});
$('supplier-edit-cancel').addEventListener('click',()=>{editingSupplierID=null;$('edit-supplier-form').hidden=true;});
$('edit-supplier-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !editingSupplierID)return;
  const payload={supplierID:editingSupplierID,name:$('edit-supplier-name').value.trim()};
  busy=true;updateFefoControls();let saved=false;
  try {
    await request('updateSupplier',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    saved=true;editingSupplierID=null;$('edit-supplier-form').hidden=true;
    await load();message('Fournisseur modifié. Les lots restent reliés au même identifiant.');
  }catch(error){const text=saved ? 'Modification enregistrée, mais actualisation impossible : '+error.message : error.message;
    $('supplier-edit-status').textContent=text;message(text,true);
  }finally{busy=false;updateFefoControls();}
});
function applyRole() {
  for(const element of document.querySelectorAll('[data-manager-only]')) element.hidden=!canManage;
  for(const id of ['movement-form','product-form','receipt-form','supplier-form','inventory-form']) $(id).hidden=!canManage;
  if(!canManage){$('edit-product-panel').hidden=true;$('edit-supplier-form').hidden=true;}
  $('fefo-confirm').hidden=!canManage;
}
$('refresh').hidden=true;
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('login-submit').disabled=true;
  const name=$('login-user').value.trim();
  // Identifiants de démonstration en mémoire uniquement, effacés au rechargement.
  authHeader='Basic '+btoa(name+':'+$('login-password').value);
  try {
    const info=await request('sessionInfo()');
    $('public-demo-banner').hidden=!info.isDemo;
    canManage=info.canManage;window.stockLoggedIn=true;window.stockUser=info.id;document.body.dataset.connected='true';
    $('login-password').value='';$('login-panel').hidden=true;$('session-banner').hidden=false;
    $('session-label').textContent=info.id+' — '+(canManage ? 'Gestionnaire' : 'Consultation seule');
    document.querySelector('.navigation').hidden=false;$('refresh').hidden=false;
    applyRole();window.dispatchEvent(new Event('stock:authenticated'));
    try {await load();if(fefoState)showFefoPlan();}
    catch(error){message('Connexion établie, chargement impossible : '+error.message,true);}
  }catch(error){authHeader='';canManage=false;window.stockLoggedIn=false;$('login-status').textContent=error.status===401 ? 'Utilisateur ou mot de passe incorrect.' : error.message;}
  finally{$('login-submit').disabled=false;}
});
$('logout').addEventListener('click',()=>{authHeader='';canManage=false;location.reload();});
applyRole();

// Filtrer localement sans requête réseau et sans choisir un produit à la place du client.
function filterProductOptions(inputID, selectID, notify=false) {
  const select=$(selectID);
  if(select.disabled)return;
  const previous=select.value,query=searchText($(inputID).value);
  const matches=products.filter(product=>searchText(product.name+' '+product.reference).includes(query));
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=matches.length?'Choisissez le produit':'Aucun produit trouvé.';placeholder.dataset.i18nUi='';
  select.replaceChildren(placeholder);
  for(const product of matches){const option=document.createElement('option');option.dataset.i18nRaw='';option.value=product.ID;option.textContent=product.reference+' — '+product.name;select.append(option);}
  select.value=matches.some(product=>product.ID===previous)?previous:'';
  if(notify && previous!==select.value)select.dispatchEvent(new Event('change'));
}
function refreshProductSearches(){
  filterProductOptions('receipt-product-search','receipt-product');
  filterProductOptions('fefo-product-search','fefo-product');
}
for(const [inputID,selectID] of [['receipt-product-search','receipt-product'],['fefo-product-search','fefo-product']]){
  $(inputID).addEventListener('input',()=>filterProductOptions(inputID,selectID,true));
}
