import cds from '@sap/cds';
import {createHash} from 'node:crypto';

const quantityText = amount => (amount / 1000).toFixed(3);
function amount(req, value) {
  const text = String(value ?? '');
  if (!/^[0-9]{1,9}([.][0-9]{1,3})?$/.test(text)) req.reject(400, 'Quantité positive avec trois décimales maximum.');
  const [whole, fraction=''] = text.split('.');
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3,'0'));
  if (!result) req.reject(400, 'La quantité doit être supérieure à zéro.');
  return result;
}
function allocationsKey(rows) {
  return JSON.stringify(rows.map(row=>({lotID:row.lotID,quantity:row.quantity})).sort((a,b)=>a.lotID.localeCompare(b.lotID)));
}
async function propose(req, productID, wanted) {
  const {SELECT} = cds.ql;
  const product = productID && await SELECT.one.from('shop.Products').where({ID:productID});
  if (!product) req.reject(404,'Produit introuvable.');
  if(product.unit==='piece' && wanted%1000!==0) req.reject(400,'Un article à la pièce exige une quantité entière.');
  const today = new Date(req.timestamp).toISOString().slice(0,10);
  const lots = (await SELECT.from('shop.Lots').where({product_ID:productID}))
    .filter(lot=>Number(lot.remainingQuantity)>0 && (!lot.expiresOn || lot.expiresOn>=today))
    .sort((a,b)=>(a.expiresOn || '9999-12-31').localeCompare(b.expiresOn || '9999-12-31')
      || a.receivedOn.localeCompare(b.receivedOn) || a.ID.localeCompare(b.ID));
  let remaining = wanted;
  const allocations = [];
  for (const lot of lots) {
    if (!remaining) break;
    const taken = Math.min(remaining,Math.round(Number(lot.remainingQuantity)*1000));
    allocations.push({lotID:lot.ID,lotNumber:lot.lotNumber,expiresOn:lot.expiresOn,quantity:quantityText(taken)});
    remaining -= taken;
  }
  if (remaining) req.reject(409,'Stock non périmé insuffisant pour cette quantité.');
  if (allocations.length>1000) req.reject(400,'La sortie concerne trop de lots. Réduire la quantité.');
  return {productID,unit:product.unit,quantity:quantityText(wanted),allocations};
}
export function installFefo(service) {
  service.on('proposeFefo',req=>propose(req,req.data.productID,amount(req,req.data.quantity)));
  service.on('confirmFefo',async req=>{
    const {requestID,productID,allocations,note=''} = req.data;
    if(typeof requestID!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestID)) req.reject(400,'Identifiant de confirmation invalide.');
    if(typeof note!=='string' || note.length>250) req.reject(400,'Note limitée à 250 caractères.');
    const wanted = amount(req,req.data.quantity);
    if(!Array.isArray(allocations) || !allocations.length || allocations.length>1000) req.reject(400,'Proposition de lots requise.');
    const normalized = allocations.map(row=>{
      if(typeof row.lotID!=='string') req.reject(400,'Identifiant de lot manquant.');
      return {lotID:row.lotID,quantity:quantityText(amount(req,row.quantity))};
    });
    if(new Set(normalized.map(row=>row.lotID)).size!==normalized.length) req.reject(400,'Un lot ne doit apparaître qu’une fois.');
    if(normalized.reduce((sum,row)=>sum+Math.round(Number(row.quantity)*1000),0)!==wanted) req.reject(400,'La somme des lots ne correspond pas à la quantité demandée.');
    const signature = createHash('sha256').update(JSON.stringify({productID,quantity:quantityText(wanted),allocations:allocationsKey(normalized),note})).digest('hex');
    const {SELECT,INSERT,UPDATE} = cds.ql;
    const prior = await SELECT.one.from('shop.OutboundRequests').where({ID:requestID});
    if(prior) {
      if(prior.signature!==signature) req.reject(409,'Cet identifiant est déjà utilisé pour une autre demande.');
      if(!prior.result) req.reject(409,'Confirmation en cours. Réessayer avec le même identifiant.');
      return JSON.parse(prior.result);
    }
    const current = await propose(req,productID,wanted);
    if(allocationsKey(current.allocations)!==allocationsKey(normalized)) req.reject(409,'Le stock ou l’ordre des lots a changé. Recalculer la proposition.');
    // La clé primaire bloque une deuxième confirmation simultanée du même identifiant.
    try {await INSERT.into('shop.OutboundRequests').entries({ID:requestID,signature});}
    catch(error) {
      if(/unique|ENTITY_ALREADY_EXISTS|constraint/i.test(error.message || error.code || '')) req.reject(409,'Confirmation déjà engagée. Réessayer avec le même identifiant.');
      throw error;
    }
    const movements=[];
    for(const allocation of current.allocations) {
      movements.push(await service.send('recordMovement',{lotID:allocation.lotID,kind:'OUT',quantity:allocation.quantity,note:note || 'Sortie FEFO'}));
    }
    await UPDATE('shop.OutboundRequests').set({result:JSON.stringify(movements)}).where({ID:requestID});
    return movements;
  });
}
