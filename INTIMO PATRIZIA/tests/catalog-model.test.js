import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectProducts, visibleCatalog, isSafeImage } from '../src/catalog-model.js';

const demo=JSON.parse(readFileSync(new URL('../public/data/demo-catalog.json',import.meta.url),'utf8'));
test('demo has four complete categories with three explicitly fictional products each',()=>{
  assert.equal(demo.categories.length,4);assert.equal(demo.products.length,12);
  for(const category of demo.categories)assert.equal(demo.products.filter(p=>p.categoryId===category.id).length,3);
  assert.ok(demo.products.every(product=>product.isDemo===true&&isSafeImage(product.image)));
});
test('catalog hides draft categories and products and does not mutate its source when sorting',()=>{
  const source={categories:[{id:'a',published:true},{id:'b',published:false}],products:[{name:'B',categoryId:'a',published:true},{name:'A',categoryId:'a',published:false},{name:'Hidden',categoryId:'b',published:true}]};
  assert.deepEqual(visibleCatalog(source).products.map(p=>p.name),['B']);
  selectProducts(demo.products,{sort:'price-desc'});assert.equal(demo.products[0].name,'Canotta quotidiana');
});
test('search combines category and normalized words, price sort leaves missing prices last',()=>{
  assert.equal(selectProducts(demo.products,{categoryId:'pigiameria',query:'COTONE'}).length,1);
  assert.equal(selectProducts(demo.products,{query:'nessun articolo con questo nome'}).length,0);
  const items=[{name:'A',price:null},{name:'B',price:2},{name:'C',price:1}];
  assert.deepEqual(selectProducts(items,{sort:'price-asc'}).map(p=>p.name),['C','B','A']);
  assert.deepEqual(selectProducts(items,{sort:'price-desc'}).map(p=>p.name),['B','C','A']);
});
test('product images accept only local known image paths and reject script URLs and traversal',()=>{
  for(const image of ['javascript:alert(1)','https://tracker.example/x.png','//evil.test/x.png','/assets/../secret.svg','data:image/svg+xml,test'])assert.equal(isSafeImage(image),false);
  assert.equal(isSafeImage('/api/images/abc_123'),true);
});
