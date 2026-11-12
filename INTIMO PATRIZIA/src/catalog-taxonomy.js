// Navigation groups only. Firestore categories keep their existing flat schema
// and stable IDs; renaming a category does not change its group membership.
export const CATALOG_GROUPS = Object.freeze([
  { id: 'intimo', name: 'Intimo', categoryIds: ['intimo-neonato', 'intimo-bambini', 'intimo-donna', 'intimo-uomo'] },
  { id: 'pigiami-e-relax', name: 'Pigiami e relax', categoryIds: ['vestaglie-bambini', 'vestaglie-adulti', 'tute-bambini', 'tute-adulti', 'giacche-camera', 'pigiami-bambini', 'pigiami-donna', 'pigiami-uomo'] },
  { id: 'biancheria-casa', name: 'Biancheria per la casa', categoryIds: ['biancheria-bagno', 'biancheria-cucina', 'biancheria-letto'] },
  { id: 'bebe-e-maternita', name: 'Bebè e maternità', categoryIds: ['accessori-bebe', 'valigia-parto'] },
  { id: 'stagioni-e-occasioni', name: 'Stagioni e occasioni', categoryIds: ['estate', 'ritorno-scuola', 'natale'] },
  { id: 'profumi', name: 'Profumi', categoryIds: ['profumi'] },
].map(group => Object.freeze({ ...group, categoryIds: Object.freeze(group.categoryIds) })));

const categoryGroups = new Map(CATALOG_GROUPS.flatMap(group => group.categoryIds.map(id => [id, group.id])));
export const categoryGroupId = categoryId => categoryGroups.get(categoryId) || '';

export function catalogGroups(categories) {
  // Older catalogues and explicit demo fixtures retain their familiar flat
  // filters until at least one category has a mapped, stable department ID.
  if (!categories.some(category => categoryGroups.has(category.id))) return [];
  const groups = CATALOG_GROUPS.map(group => {
    const members = categories.filter(category => categoryGroupId(category.id) === group.id);
    return { ...group, categoryIds: members.map(category => category.id), categories: members };
  }).filter(group => group.categories.length);
  const otherCategories = categories.filter(category => !categoryGroups.has(category.id));
  if (otherCategories.length) groups.push({ id: 'altri-reparti', name: 'Altri reparti', categoryIds: otherCategories.map(category => category.id), categories: otherCategories });
  return groups;
}
