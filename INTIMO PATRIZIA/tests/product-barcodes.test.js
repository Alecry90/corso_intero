import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGTIN, gtinKey, equivalentGTINs } from '../src/product-barcodes.js';

test('GTIN lengths and check digits preserve the original string and leading zeros', () => {
  for (const code of ['96385074', '036000291452', '4006381333931', '10012345000017']) assert.equal(normalizeGTIN(` ${code} `), code);
  for (const value of ['00000000', '12345678', '4006381333932', 'abc', ' 4006 381333931 ', 36000291452, null, '1234567']) assert.throws(() => normalizeGTIN(value), TypeError);
});

test('UPC and leading-zero EAN aliases compare together without conflating outer packaging', () => {
  assert.equal(gtinKey('036000291452'), gtinKey('0036000291452'));
  assert.equal(gtinKey('00036000291452'), '00036000291452');
  assert.deepEqual(equivalentGTINs('036000291452'), ['036000291452', '0036000291452', '00036000291452']);
  assert.deepEqual(equivalentGTINs('10012345000017'), ['10012345000017']);
});
