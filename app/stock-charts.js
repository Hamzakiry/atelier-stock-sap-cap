function renderStockOverview(){
 const query=searchText($('stock-search').value),filter=$('stock-filter').value;
 const matches=stockItems.filter(item=>searchText(item.name+' '+item.reference).includes(query)
   && (filter==='all'||filter==='low'&&item.isLowStock||filter==='empty'&&Number(item.totalStock)===0));
 $('stock-body').replaceChildren();
 for(const item of matches){
  const badge=document.createElement('span');badge.className='badge'+(item.isLowStock?' low':'');badge.textContent=item.isLowStock?'Sous le seuil':'Stock suffisant';
  row($('stock-body'),[item.name,format(item.totalStock)+' '+unitLabel(item.unit),format(item.minimumStock),badge]);
 }
 if(!matches.length)row($('stock-body'),['Aucun produit correspondant.','','','']);
}
function renderStockCharts(){
 const availableByID=new Map(availabilityItems.map(item=>[item.productID,item]));
 const mode=$('chart-stock-mode').value;
 const byUnit=unit=>stockItems.filter(item=>item.unit===unit).map(item=>({...item,
   displayed:Number(mode==='available' ? availableByID.get(item.ID)?.availableStock ?? 0 : item.totalStock)}));
 for(const [unit,id] of [['kg','stocks-kg-chart'],['piece','stocks-piece-chart']]){
  const items=byUnit(unit),target=$(id);target.replaceChildren();
  const max=Math.max(1,...items.flatMap(item=>[item.displayed,Number(item.minimumStock)]));
  for(const item of items){
   const minimum=Number(item.minimumStock);
   const state=item.displayed===0?'empty':item.displayed<minimum?'low':'good';
   const line=document.createElement('div');line.className='stock-bar-item';
   const heading=document.createElement('div');heading.className='stock-bar-heading';
   const name=document.createElement('span');name.dataset.i18nRaw='';name.textContent=item.name;name.title=item.reference+' — '+item.name;
   const value=document.createElement('strong');if(state==='empty') value.className='legend-empty';
   value.textContent=format(item.displayed)+' '+unitLabel(unit);heading.append(name,value);
   const track=document.createElement('div');track.className='stock-bar-track';
   const fill=document.createElement('span');fill.className='stock-bar-fill '+state;fill.style.width=(item.displayed/max*100)+'%';
   const marker=document.createElement('span');marker.className='stock-threshold';marker.style.left=(minimum/max*100)+'%';
   track.append(fill,marker);track.setAttribute('role','img');track.setAttribute('aria-label',item.name+' : '+format(item.displayed)+' '+unitLabel(unit)+', seuil '+format(minimum));
   const caption=document.createElement('small');caption.textContent=item.reference+' · Seuil : '+format(minimum)+' '+unitLabel(unit)+(state==='empty'?' · Stock à zéro':state==='low'?' · Réapprovisionnement à prévoir':'');
   line.append(heading,track,caption);target.append(line);
  }
  if(!items.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Aucun produit dans cette unité.';target.append(empty);}
 }
 const counts={good:0,low:0,empty:0};
 for(const item of availabilityItems){
  if(Number(item.availableStock)===0)counts.empty++;else if(item.lowAvailableStock)counts.low++;else counts.good++;
 }
 const total=availabilityItems.length;
 const goodEnd=total?counts.good/total*100:0,lowEnd=total?(counts.good+counts.low)/total*100:0;
 $('stock-health-ring').style.background=total?`conic-gradient(#39795a 0% ${goodEnd}%,#d5a24d ${goodEnd}% ${lowEnd}%,#b95d50 ${lowEnd}% 100%)`:'#e0e7dc';
 $('stock-health-total').textContent=total+' produits';
 $('stock-health-ring').setAttribute('aria-label',counts.good+' produits au seuil ou au-dessus, '+counts.low+' sous le seuil, '+counts.empty+' à zéro');
 $('stock-health-legend').replaceChildren();
 for(const [state,label] of [['good','Au seuil ou au-dessus'],['low','Sous le seuil, hors stock à zéro'],['empty','Stock disponible à zéro']]){
  const entry=document.createElement('div');entry.className='health-row';
  const text=document.createElement('span');text.className='legend-'+state;text.textContent='● '+label;
  const value=document.createElement('strong');value.textContent=counts[state];entry.append(text,value);$('stock-health-legend').append(entry);
 }
 const expired=availabilityItems.filter(item=>Number(item.expiredStock)>0).length;
 const undated=availabilityItems.filter(item=>Number(item.undatedStock)>0).length;
 $('stock-expiry-alerts').replaceChildren();
 for(const text of [expired+' produit(s) avec quantité périmée',undated+' produit(s) avec quantité sans date de péremption']){
  const p=document.createElement('p');p.className='notice';p.textContent=text;$('stock-expiry-alerts').append(p);
 }
 $('stock-chart-note').textContent=mode==='available'
  ? 'Disponible = stock physique moins les lots périmés. Les lots sans date sont inclus et restent à vérifier.'
  : 'Stock physique : toutes les quantités restantes, y compris les lots périmés. Chaque graphique utilise sa propre échelle.';
}
$('stock-search').addEventListener('input',renderStockOverview);
$('stock-filter').addEventListener('change',renderStockOverview);
$('chart-stock-mode').addEventListener('change',renderStockCharts);
