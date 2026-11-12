import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG_GROUPS, catalogGroups, categoryGroupId } from '../src/catalog-taxonomy.js';

const manifest=JSON.parse(readFileSync(new URL('../catalog/notes-categories.json',import.meta.url),'utf8'));
const categories=manifest.categories;

test('the source preserves exactly 21 distinct note categories and imports no products',()=>{
  assert.equal(categories.length,21);assert.equal(new Set(categories.map(category=>category.id)).size,21);
  assert.equal(new Set(categories.map(category=>category.slug)).size,21);assert.equal(manifest.productImport,false);
  assert.ok(categories.every(category=>category.sourceTitle&&category.name));
});
test('six navigation groups cover all 21 source IDs exactly once',()=>{
  assert.equal(CATALOG_GROUPS.length,6);
  const ids=CATALOG_GROUPS.flatMap(group=>group.categoryIds);
  assert.equal(ids.length,21);assert.equal(new Set(ids).size,21);
  assert.deepEqual([...ids].sort(),categories.map(category=>category.id).sort());
});
test('the category membership uses stable IDs rather than source title or display name',()=>{
  const renamed={...categories.find(category=>category.id==='intimo-uomo'),name:'Nome cambiato',slug:'nome-cambiato',sourceTitle:'Titolo cambiato'};
  assert.equal(categoryGroupId(renamed.id),'intimo');
  assert.equal(catalogGroups([renamed])[0].categories[0],renamed);
});
test('the six navigation groups retain their intended order and membership counts',()=>{
  const groups=catalogGroups(categories);
  assert.deepEqual(groups.map(group=>group.id),['intimo','pigiami-e-relax','biancheria-casa','bebe-e-maternita','stagioni-e-occasioni','profumi']);
  assert.deepEqual(groups.map(group=>group.categoryIds.length),[4,8,3,2,3,1]);
});
test('partial catalogues show only groups with published member categories',()=>{
  const subset=categories.filter(category=>['pigiami-uomo','pigiami-donna','profumi'].includes(category.id));
  assert.deepEqual(catalogGroups(subset).map(group=>group.id),['pigiami-e-relax','profumi']);
});
test('each group keeps its categories in the order provided by the catalogue',()=>{
  const ordered=[...categories].sort((a,b)=>a.order-b.order);
  assert.deepEqual(catalogGroups(ordered).find(group=>group.id==='intimo').categoryIds,['intimo-donna','intimo-uomo','intimo-bambini','intimo-neonato']);
});
test('an empty catalogue has no navigation groups',()=>assert.deepEqual(catalogGroups([]),[]));
test('legacy and newly created unmapped-only catalogues keep flat navigation',()=>{
  assert.deepEqual(catalogGroups([{id:'lingerie',name:'Lingerie'},{id:'nuovo',name:'Nuovo reparto'}]),[]);
  assert.equal(categoryGroupId('nuovo'),'');assert.equal(categoryGroupId(''),'');
});
test('an unmapped category remains reachable through Altri reparti alongside mapped categories',()=>{
  const extra={id:'nuovo-reparto',name:'Nuovo reparto'};
  const groups=catalogGroups([categories.find(category=>category.id==='intimo-donna'),extra]);
  assert.deepEqual(groups.map(group=>group.id),['intimo','altri-reparti']);
  assert.deepEqual(groups.at(-1).categories,[extra]);assert.deepEqual(groups.at(-1).categoryIds,['nuovo-reparto']);
});
test('grouping does not mutate the source category documents or the static taxonomy',()=>{
  const source=structuredClone(categories);const before=JSON.stringify(source);const staticBefore=JSON.stringify(CATALOG_GROUPS);
  catalogGroups(source);assert.equal(JSON.stringify(source),before);assert.equal(JSON.stringify(CATALOG_GROUPS),staticBefore);
  assert.ok(Object.isFrozen(CATALOG_GROUPS));assert.ok(CATALOG_GROUPS.every(group=>Object.isFrozen(group)&&Object.isFrozen(group.categoryIds)));
});
