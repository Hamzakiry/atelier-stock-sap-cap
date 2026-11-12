using { shop } from '../db/schema';

@path: '/catalog'
@requires: ['Viewer', 'Manager']
service CatalogService {
  @readonly
  entity Products as projection on shop.Products;

  @readonly
  entity Lots as projection on shop.Lots;

  @readonly
  entity Stock as select from shop.StockTotals {
    *,
    case when totalStock < minimumStock then true else false end as isLowStock : Boolean
  };
  @readonly
  entity Movements as projection on shop.StockMovements;

  @requires: 'Manager'
  action recordMovement(
    lotID : UUID,
    kind : String(3),
    quantity : Decimal(12,3),
    note : String(250)
  ) returns Movements;
  @requires: 'Manager'
  action createProduct(
    reference : String(40), name : String(150), unit : String(10),
    salePrice : Decimal(10,2), minimumStock : Decimal(12,3)
  ) returns Products;

  @requires: 'Manager'
  action receiveLot(
    supplierID : UUID, productID : UUID, lotNumber : String(60), receivedOn : Date,
    expiresOn : Date, quantity : Decimal(12,3), purchasePrice : Decimal(10,2)
  ) returns Lots;
  @readonly
  entity Suppliers as projection on shop.Suppliers;
  @readonly
  entity Clients as projection on shop.Clients;
  @readonly
  @requires: 'Manager'
  entity CatalogueChanges as projection on shop.CatalogueChanges;

  @requires: 'Manager'
  action createSupplier(code : String(40), name : String(150)) returns Suppliers;
  type ExpirySummary {
    productID : UUID;
    name : String(150);
    unit : String(10);
    physicalStock : Decimal(15,3);
    availableStock : Decimal(15,3);
    expiredStock : Decimal(15,3);
    expiringStock : Decimal(15,3);
    undatedStock : Decimal(15,3);
    lowAvailableStock : Boolean;
  }
  function expiryReport(days : Integer) returns array of ExpirySummary;
  type FefoAllocation {
    lotID : UUID;
    lotNumber : String(60);
    expiresOn : Date;
    quantity : Decimal(12,3);
  }
  type FefoPlan {
    productID : UUID;
    unit : String(10);
    quantity : Decimal(12,3);
    allocations : array of FefoAllocation;
  }
  function proposeFefo(productID : UUID, quantity : Decimal(12,3)) returns FefoPlan;
  @requires: 'Manager'
  action confirmFefo(requestID : UUID, productID : UUID, quantity : Decimal(12,3),
    allocations : array of FefoAllocation, note : String(250)) returns array of Movements;
  @requires: 'Manager'
  action updateProduct(productID : UUID, name : String(150), salePrice : Decimal(10,2), minimumStock : Decimal(12,3)) returns Products;
  // expectedQuantity protège contre une correction basée sur un ancien stock.
  @requires: 'Manager'
  action adjustInventory(lotID : UUID, expectedQuantity : Decimal(12,3),
    countedQuantity : Decimal(12,3), reason : String(120)) returns Movements;
  @requires: 'Manager'
  action updateSupplier(supplierID : UUID, name : String(150)) returns Suppliers;
  type SessionInfo { id : String; canManage : Boolean; isDemo : Boolean; }
  function sessionInfo() returns SessionInfo;
}
