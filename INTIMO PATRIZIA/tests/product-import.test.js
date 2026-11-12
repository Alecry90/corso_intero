import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProductCSV,planProductImport,productCodeKey } from '../src/product-import.js';
const categories=[{id:'intimo-donna',slug:'intimo-donna'}];
test('CSV supports BOM, quoted separators, escaped quotes and multiline descriptions',()=>{
  const rows=parseProductCSV('\uFEFFcodice;nome;reparto;descrizione\r\nA;"Maglia; cotone";intimo-donna;"Prima riga\nSeconda ""riga"""\r\n');
  assert.equal(rows[0].nome,'Maglia; cotone');assert.equal(rows[0].descrizione,'Prima riga\nSeconda "riga"');
});
test('CSV rejects unclosed quotes, unknown/duplicate headers, oversized batches and malformed cells',()=>{
  for(const text of ['codice;nome;reparto\nA;"Errore;intimo-donna','codice;nome;reparto;nome\nA;B;C;D','codice;nome;reparto\nA;B','codice;nome;reparto\n'+Array(51).fill('A;B;C').join('\n')])assert.throws(()=>parseProductCSV(text));
});
test('preview creates drafts, parses Italian decimal prices and leaves existing products untouched',()=>{
  const rows=parseProductCSV('codice;nome;reparto;prezzo;taglie;colori\nＡ1;Maglia;intimo-donna;19,90;S|M;Bianco, Nero\nB;Pigiama;intimo-donna;;;');
  const plan=planProductImport(rows,categories,[{sku:'a1'}]);assert.equal(plan[0].skip,true);assert.equal(plan[0].payload.price,19.9);assert.deepEqual(plan[0].payload.sizes,['S','M']);
  assert.equal(plan[1].payload.published,false);assert.equal(plan[1].payload.price,null);assert.equal(plan[1].payload.isDemo,false);assert.equal(productCodeKey(' Ａ1 '),'a1');
});
test('preview exposes duplicate codes, unknown categories, invalid prices and file paths',()=>{
  const plan=planProductImport([{codice:'A',nome:'Uno',reparto:'intimo-donna'},{codice:'a',nome:'Due',reparto:'intimo-donna'},{codice:'C',nome:'Tre',reparto:'missing'},{codice:'D',nome:'Quattro',reparto:'intimo-donna',prezzo:'1.000,00'},{codice:'E',nome:'Cinque',reparto:'intimo-donna',foto:'../foto.jpg'}],categories);
  assert.equal(plan.filter(row=>row.error).length,4);
});
