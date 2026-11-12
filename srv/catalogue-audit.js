import cds from '@sap/cds';

export async function recordCatalogueChanges(req, entityType, before, after) {
  const changeID = cds.utils.uuid();
  const normalize = (field, value) => field === 'salePrice' ? Number(value).toFixed(2)
    : field === 'minimumStock' ? Number(value ?? 0).toFixed(3) : String(value ?? '');
  const changes = Object.entries(after).flatMap(([field, value]) => {
    const oldValue = normalize(field, before[field]), newValue = normalize(field, value);
    if (oldValue === newValue) return [];
    return [{ID:cds.utils.uuid(),changeID,entityType,entityID:before.ID,
      reference:before.reference ?? before.code,field,oldValue,newValue,
      recordedAt:new Date(req.timestamp).toISOString(),createdBy:req.user.id}];
  });
  // Le contexte CAP propage la transaction : l’écriture du journal est obligatoire.
  if (changes.length) await cds.ql.INSERT.into('shop.CatalogueChanges').entries(changes);
}
