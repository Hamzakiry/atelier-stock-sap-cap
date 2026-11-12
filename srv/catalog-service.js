import cds from '@sap/cds';
import { installFefo } from './fefo.js';
import { recordCatalogueChanges } from './catalogue-audit.js';

export default class CatalogService extends cds.ApplicationService {
  async init() {
    this.on('recordMovement', async req => {
      const { lotID, kind, quantity, note } = req.data;
      if (!lotID || !['IN', 'OUT'].includes(kind)) {
        return req.reject(400, 'Indiquer un lot et un type IN ou OUT.');
      }
      // Les millièmes évitent les calculs de quantité en virgule flottante.
      const text = String(quantity ?? '');
      if (!/^\d{1,9}(\.\d{1,3})?$/.test(text)) {
        return req.reject(400, 'Quantité positive avec trois décimales maximum.');
      }
      const [whole, fraction = ''] = text.split('.');
      const amount = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
      if (amount === 0) return req.reject(400, 'La quantité doit être supérieure à zéro.');

      const { SELECT, UPDATE, INSERT } = cds.ql;
      const lot = await SELECT.one.from('shop.Lots').where({ ID: lotID });
      if (!lot) return req.reject(404, 'Lot introuvable.');
      const product = await SELECT.one.from('shop.Products').where({ ID: lot.product_ID });
      if (!product) return req.reject(409, 'Le produit du lot est introuvable.');
      if (product.unit === 'piece' && amount % 1000 !== 0) {
        return req.reject(400, 'Un article à la pièce exige une quantité entière.');
      }
      const today = new Date(req.timestamp).toISOString().slice(0, 10);
      if (kind === 'OUT' && lot.expiresOn && lot.expiresOn < today) {
        return req.reject(409, 'Sortie refusée : lot périmé.');
      }
      const current = Math.round(Number(lot.remainingQuantity) * 1000);
      const next = current + (kind === 'IN' ? amount : -amount);
      if (next < 0) return req.reject(409, 'Stock insuffisant pour cette sortie.');
      if (next > 999999999999) return req.reject(400, 'Capacité de stockage dépassée.');

      // Comparaison de la valeur lue : refuse une modification concurrente.
      const result = await UPDATE('shop.Lots')
        .set({ remainingQuantity: (next / 1000).toFixed(3) })
        .where({ ID: lotID, remainingQuantity: lot.remainingQuantity });
      const affected = typeof result === 'number' ? result : result.affected;
      if (affected !== 1) return req.reject(409, 'Stock modifié entre-temps. Réessayer.');
      const movement = {
        ID: cds.utils.uuid(), lot_ID: lotID, kind,
        quantity: (amount / 1000).toFixed(3),
        recordedAt: new Date(req.timestamp).toISOString(), createdBy: req.user.id, note: note ?? null
      };
      // CAP utilise la même transaction pour la quantité et son historique.
      await INSERT.into('shop.StockMovements').entries(movement);
      return movement;
    });
    // Ces actions gardent les entités de consultation en lecture seule.
    this.on('createProduct', async req => {
      const { SELECT, INSERT } = cds.ql;
      const reference = requiredText(req, req.data.reference, 40, 'Référence');
      const name = requiredText(req, req.data.name, 150, 'Nom');
      if (!['kg', 'piece'].includes(req.data.unit)) return req.reject(400, 'Unité attendue : kg ou piece.');
      const salePrice = decimal(req, req.data.salePrice, 8, 2, 'Prix de vente');
      const minimumStock = decimal(req, req.data.minimumStock ?? '0', 9, 3, 'Seuil minimum');
      if (req.data.unit === 'piece' && Number(minimumStock) % 1 !== 0) return req.reject(400, 'Le seuil doit être entier pour les pièces.');
      if (await SELECT.one.from('shop.Products').where({ reference })) return req.reject(409, 'Cette référence existe déjà.');
      const product = { ID: cds.utils.uuid(), reference, name, unit: req.data.unit, salePrice, minimumStock };
      await INSERT.into('shop.Products').entries(product);
      return product;
    });

    this.on('receiveLot', async req => {
      const { SELECT, INSERT } = cds.ql;
      const { productID, supplierID } = req.data;
      if (supplierID && !await SELECT.one.from('shop.Suppliers').where({ID:supplierID})) return req.reject(404, 'Fournisseur introuvable.');
      if (!productID) return req.reject(400, 'Sélectionner un produit.');
      const product = await SELECT.one.from('shop.Products').where({ ID: productID });
      if (!product) return req.reject(404, 'Produit introuvable.');
      const lotNumber = requiredText(req, req.data.lotNumber, 60, 'Numéro de lot');
      const quantity = decimal(req, req.data.quantity, 9, 3, 'Quantité');
      if (Number(quantity) <= 0) return req.reject(400, 'La quantité doit être supérieure à zéro.');
      if (product.unit === 'piece' && Number(quantity) % 1 !== 0) return req.reject(400, 'Un article à la pièce exige une quantité entière.');
      const purchasePrice = decimal(req, req.data.purchasePrice, 8, 2, 'Prix d’achat');
      const receivedOn = validDate(req, req.data.receivedOn, 'Date de réception');
      const expiresOn = req.data.expiresOn ? validDate(req, req.data.expiresOn, 'Péremption') : null;
      const today = new Date(req.timestamp).toISOString().slice(0, 10);
      if (receivedOn > today) return req.reject(400, 'La réception ne peut pas être dans le futur.');
      if (expiresOn && expiresOn < receivedOn) return req.reject(400, 'La péremption précède la réception.');
      if (await SELECT.one.from('shop.Lots').where({ product_ID: productID, lotNumber })) return req.reject(409, 'Ce lot existe déjà pour ce produit.');
      const lot = { ID: cds.utils.uuid(), supplier_ID: supplierID || null, product_ID: productID, lotNumber, receivedOn, expiresOn,
        remainingQuantity: quantity, purchasePrice };
      await INSERT.into('shop.Lots').entries(lot);
      // La réception et son mouvement initial sont enregistrés ensemble.
      await INSERT.into('shop.StockMovements').entries({
        ID: cds.utils.uuid(), lot_ID: lot.ID, kind: 'IN', quantity,
        recordedAt: new Date(req.timestamp).toISOString(), createdBy: req.user.id, note: 'Réception initiale du lot'
      });
      return lot;
    });
    this.on('createSupplier', async req => {
      const {SELECT, INSERT} = cds.ql;
      const code = requiredText(req, req.data.code, 40, 'Code fournisseur');
      const name = requiredText(req, req.data.name, 150, 'Nom fournisseur');
      if (await SELECT.one.from('shop.Suppliers').where({code})) return req.reject(409, 'Ce code fournisseur existe déjà.');
      const supplier = {ID:cds.utils.uuid(), code, name};
      await INSERT.into('shop.Suppliers').entries(supplier);
      return supplier;
    });
    this.on('expiryReport', async req => {
      const days = req.data.days ?? 30;
      if (!Number.isInteger(days) || days < 0 || days > 365) return req.reject(400, 'Le délai doit être compris entre 0 et 365 jours.');
      // Même convention que les sorties : une date de péremption reste valide le jour même (UTC).
      const today = new Date(req.timestamp).toISOString().slice(0,10);
      const limit = new Date(today + 'T00:00:00Z');
      limit.setUTCDate(limit.getUTCDate() + days);
      const deadline = limit.toISOString().slice(0,10);
      const {SELECT} = cds.ql;
      const products = await SELECT.from('shop.Products').orderBy('name');
      const lots = await SELECT.from('shop.Lots');
      const quantities = new Map(products.map(product => [product.ID, {physical:0,expired:0,soon:0,undated:0}]));
      for (const lot of lots) {
        const sums = quantities.get(lot.product_ID);
        if (!sums) continue;
        const amount = Math.round(Number(lot.remainingQuantity) * 1000);
        sums.physical += amount;
        if (!lot.expiresOn) sums.undated += amount;
        else if (lot.expiresOn < today) sums.expired += amount;
        else if (lot.expiresOn <= deadline) sums.soon += amount;
      }
      return products.map(product => {
        const sums = quantities.get(product.ID);
        const available = sums.physical - sums.expired;
        const decimal = value => (value / 1000).toFixed(3);
        return {productID:product.ID, name:product.name, unit:product.unit,
          physicalStock:decimal(sums.physical), availableStock:decimal(available),
          expiredStock:decimal(sums.expired), expiringStock:decimal(sums.soon), undatedStock:decimal(sums.undated),
          lowAvailableStock:available < Math.round(Number(product.minimumStock ?? 0) * 1000)};
      });
    });
    this.on('updateProduct', async req => {
      const {SELECT,UPDATE} = cds.ql;
      const {productID} = req.data;
      const product=productID && await SELECT.one.from('shop.Products').where({ID:productID});
      if(!product) return req.reject(404,'Produit introuvable.');
      const name=requiredText(req,req.data.name,150,'Nom');
      const salePrice=decimal(req,req.data.salePrice,8,2,'Prix de vente');
      const minimumStock=decimal(req,req.data.minimumStock,9,3,'Seuil minimum');
      if(product.unit==='piece' && Number(minimumStock)%1!==0) return req.reject(400,'Le seuil doit être entier pour les pièces.');
      // La référence, l’unité, les quantités et l’historique ne sont pas modifiés.
      await UPDATE('shop.Products').set({name,salePrice,minimumStock}).where({ID:productID});
      await recordCatalogueChanges(req, 'Products', product, {name,salePrice,minimumStock});
      return {...product,name,salePrice,minimumStock};
    });
    this.on('adjustInventory', async req => {
      const {SELECT,UPDATE,INSERT}=cds.ql;
      const {lotID}=req.data;
      const expected=decimal(req,req.data.expectedQuantity,9,3,'Quantité affichée');
      const counted=decimal(req,req.data.countedQuantity,9,3,'Quantité comptée');
      const reason=requiredText(req,req.data.reason,120,'Motif');
      if(reason.length<5) return req.reject(400,'Décrire le motif en au moins cinq caractères.');
      const lot=lotID && await SELECT.one.from('shop.Lots').where({ID:lotID});
      if(!lot) return req.reject(404,'Lot introuvable.');
      const product=await SELECT.one.from('shop.Products').where({ID:lot.product_ID});
      if(!product) return req.reject(409,'Produit du lot introuvable.');
      const current=Math.round(Number(lot.remainingQuantity)*1000);
      const target=Math.round(Number(counted)*1000);
      if(product.unit==='piece' && target%1000!==0) return req.reject(400,'La quantité comptée doit être entière pour les pièces.');
      if(current!==Math.round(Number(expected)*1000)) return req.reject(409,'Le stock a changé depuis son affichage. Actualiser et recompter avant de corriger.');
      const difference=target-current;
      if(difference===0) return req.reject(409,'Aucun écart : aucune correction nécessaire.');
      // Comparaison et écriture dans la même opération : détecter une modification concurrente.
      const result=await UPDATE('shop.Lots').set({remainingQuantity:counted})
        .where({ID:lotID,remainingQuantity:lot.remainingQuantity});
      const affected=typeof result==='number' ? result : result.affected;
      if(affected!==1) return req.reject(409,'Stock modifié entre-temps. Actualiser avant de corriger.');
      const movement={ID:cds.utils.uuid(),lot_ID:lotID,kind:difference>0?'IN':'OUT',
        quantity:(Math.abs(difference)/1000).toFixed(3),recordedAt: new Date(req.timestamp).toISOString(), createdBy: req.user.id,
        note:'Inventaire : '+(current/1000).toFixed(3)+' → '+counted+' '+product.unit+' | '+reason};
      // Même transaction CAP : quantité et justification sont validées ou annulées ensemble.
      await INSERT.into('shop.StockMovements').entries(movement);
      return movement;
    });
    this.on('updateSupplier', async req => {
      const {SELECT,UPDATE}=cds.ql;
      const {supplierID}=req.data;
      const supplier=supplierID && await SELECT.one.from('shop.Suppliers').where({ID:supplierID});
      if(!supplier) return req.reject(404,'Fournisseur introuvable.');
      const name=requiredText(req,req.data.name,150,'Nom fournisseur');
      await UPDATE('shop.Suppliers').set({name}).where({ID:supplierID});
      await recordCatalogueChanges(req, 'Suppliers', supplier, {name});
      return {...supplier,name};
    });
    this.on('sessionInfo', req => ({id:req.user.id,canManage:req.user.is('Manager'),isDemo:process.env.STOCK_DEMO_MODE==='true'}));
    installFefo(this);
    return super.init();
  }
}

function requiredText(req, value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    req.reject(400, `${label} obligatoire, ${max} caractères maximum.`);
  }
  return value.trim();
}
function decimal(req, value, wholeDigits, scale, label) {
  const text = String(value ?? '');
  if (!new RegExp(`^[0-9]{1,${wholeDigits}}([.][0-9]{1,${scale}})?$`).test(text)) {
    req.reject(400, `${label} : nombre positif ou nul, ${scale} décimales maximum.`);
  }
  return Number(text).toFixed(scale);
}
function validDate(req, value, label) {
  const date = new Date(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    req.reject(400, `${label} : date invalide.`);
  }
  return value;
}
