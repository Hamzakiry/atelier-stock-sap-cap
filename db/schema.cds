namespace shop;

@assert.unique: { reference: [reference] }
entity Products {
  key ID : UUID;
  @mandatory
  reference : String(40) not null;
  @mandatory
  name : String(150) not null;
  @mandatory
  unit : String(10) enum { kg; piece; } not null;
  @assert.range: [0, 99999999.99]
  salePrice : Decimal(10,2) not null;
  priceBasis : String(10);
  tvaRate : Decimal(5,2);
  sourceSystem : String(30);
  sourceID : String(40);
  @assert.range: [0, 999999999.999]
  minimumStock : Decimal(12,3) default 0;
}

@assert.unique: { productLot: [product, lotNumber] }
entity Lots {
  supplier : Association to Suppliers;
  key ID : UUID;
  @mandatory
  @assert.target
  product : Association to Products not null;
  @mandatory
  lotNumber : String(60) not null;
  receivedOn : Date not null;
  expiresOn : Date;
  @assert.range: [0, 999999999.999]
  remainingQuantity : Decimal(12,3) not null;
  @assert.range: [0, 99999999.99]
  purchasePrice : Decimal(10,2) not null;
}

// Stock physique : tous les lots, y compris ceux éventuellement périmés.
entity StockTotals as select from Products as p
  left join Lots as l on l.product.ID = p.ID
{
  key p.ID as ID,
  p.reference,
  p.name,
  p.unit,
  p.minimumStock,
  coalesce(sum(l.remainingQuantity), 0) as totalStock : Decimal(12,3)
}
group by p.ID, p.reference, p.name, p.unit, p.minimumStock;

entity StockMovements {
  key ID : UUID;
  lot : Association to Lots not null;
  kind : String(3) enum { inbound = 'IN'; outbound = 'OUT'; } not null;
  quantity : Decimal(12,3) not null;
  recordedAt : Timestamp not null;
  createdBy: String(255);
  note : String(250);
}


@assert.unique: { code: [code] }
entity Suppliers {
  key ID : UUID;
  code : String(40) not null;
  name : String(150) not null;
}

// Déduplication des confirmations FEFO, conservée après redémarrage.
entity OutboundRequests {
  key ID : UUID;
  signature : String(64) not null;
  result : LargeString;
}


// Référentiel client importé ; aucun module de vente ni de facturation.
@assert.unique: { source: [sourceSystem, sourceID] }
entity Clients {
  key ID : UUID;
  sourceSystem : String(30) not null;
  sourceID : String(40) not null;
  name : String(160) not null;
  ice : String(15);
  address : String(400);
  phone : String(40);
  email : String(254);
}

// Modifications du catalogue uniquement ; les mouvements gardent leur propre historique.
entity CatalogueChanges {
  key ID : UUID;
  changeID : UUID not null;
  entityType : String(20) not null;
  entityID : UUID not null;
  reference : String(40) not null;
  field : String(40) not null;
  oldValue : String(300);
  newValue : String(300);
  recordedAt : Timestamp not null;
  createdBy : String(255) not null;
}
