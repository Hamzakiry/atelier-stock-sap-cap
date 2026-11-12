import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

const sourceSystem='KIRY_FACTURATION';
function identifier(type,id){const s=createHash('sha256').update(sourceSystem+':'+type+':'+id).digest('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-5${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;}
function sourceID(value){if(!Number.isSafeInteger(value)||value<=0)throw new Error('Identifiant source invalide.');return String(value);}
function text(value,max,required=false){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new Error('Texte source absent ou trop long.');return value.trim();}
function decimal(value,max){const s=String(value);if(!/^\d+(\.\d{1,2})?$/.test(s)||Number(s)>max)throw new Error('Prix ou TVA source invalide.');return Number(s).toFixed(2);}
export function prepareKiry(snapshot){
 if(!Array.isArray(snapshot.products)||!snapshot.products.length||!Array.isArray(snapshot.clients))throw new Error('Export source incomplet.');
 const products=snapshot.products.map(p=>{
  const id=sourceID(p.id),unit=String(p.unit).trim().toLowerCase();
  if(!['pc','kg'].includes(unit))throw new Error('Unité source non reconnue : '+p.unit);
  return {ID:identifier('product',id),reference:'KIRY-'+id,name:text(p.designation,150,true),unit:unit==='kg'?'kg':'piece',salePrice:decimal(p.default_price_ht,99999999.99),minimumStock:0,priceBasis:'HT',tvaRate:decimal(p.tva_rate,100),sourceSystem,sourceID:id};
 });
 const clients=snapshot.clients.map(c=>({ID:identifier('client',sourceID(c.id)),sourceSystem,sourceID:sourceID(c.id),name:text(c.name,160,true),ice:text(c.ice??'',15),address:text(c.address??'',400),phone:text(c.phone??'',40),email:text(c.email??'',254)}));
 for(const rows of [products,clients])if(new Set(rows.map(x=>x.ID)).size!==rows.length)throw new Error('Identifiant source présent plusieurs fois.');
 return {products,clients};
}
export function importKiry(filename,snapshot){
 const rows=prepareKiry(snapshot);
 const db=new DatabaseSync(filename);const result={productsAdded:0,clientsAdded:0,productsSkipped:0,clientsSkipped:0};
 try {
  db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  for(const [key,table] of [['products','shop_Products'],['clients','shop_Clients']]) {
   for(const entry of rows[key]) {
    const existing=db.prepare('SELECT * FROM '+table+' WHERE ID=? OR (sourceSystem=? AND sourceID=?)'+(key==='products'?' OR reference=?':'')).all(...[entry.ID,sourceSystem,entry.sourceID,...(key==='products'?[entry.reference]:[])]);
    if(existing.length){
     if(existing.length!==1||existing[0].sourceSystem!==sourceSystem||existing[0].sourceID!==entry.sourceID)throw new Error('Conflit avec une référence existante : import annulé.');
     result[key+'Skipped']++;continue;
    }
    const columns=Object.keys(entry);db.prepare('INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').run(...Object.values(entry));
    result[key+'Added']++;
   }
  }
  db.exec('COMMIT');return result;
 }catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
}
