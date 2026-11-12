import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scannerSource = await readFile(new URL('../src/barcode-scanner.js', import.meta.url), 'utf8');
let fixtureId = 0;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class TestEventTarget extends EventTarget {
  listeners = new Map();
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    this.listeners.get(type)?.delete(listener);
  }
  listenerCount() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
}

function cameraStream() {
  const tracks = ['video', 'audio'].map(kind => Object.assign(new TestEventTarget(), {
    kind,
    stops: 0,
    stop() { this.stops += 1; },
  }));
  return { tracks, getTracks: () => tracks };
}

async function setup(t, { camera = async () => cameraStream(), secure = true } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // Replace only the optional SDK import in a copy of the real source. This
  // supplies a local decoder fixture without adding production injection hooks,
  // touching a real camera, or loading the third-party SDK in these unit tests.
  const sdkURL = `data:text/javascript;base64,${Buffer.from(`
    export const fixture = { id: ${++fixtureId}, loadCalls: 0, loadPromise: null, instances: [], results: [], errors: [], decodes: 0 };
    export const BarcodeFormat = { EAN_8: 6, EAN_13: 7, UPC_A: 14, ITF: 8, UPC_E: 15, QR_CODE: 11, CODE_128: 4 };
    export class BrowserMultiFormatReader {
      constructor() { fixture.instances.push(this); }
      decode() {
        fixture.decodes++;
        if (fixture.errors.length) throw fixture.errors.shift();
        if (fixture.results.length) return fixture.results.shift();
        throw { getKind: () => 'NotFoundException' };
      }
    }
  `).toString('base64')}`;
  const sdk = await import(sdkURL);
  const importLine = "const loadDecoder = () => import('@zxing/browser');";
  assert.ok(scannerSource.includes(importLine), 'Test decoder import seam must match the production source');
  const source = `import { fixture as __fixture } from ${JSON.stringify(sdkURL)};\n` + scannerSource
    .replace("'./product-barcodes.js'", JSON.stringify(new URL('../src/product-barcodes.js', import.meta.url).href))
    .replace(importLine, `const loadDecoder = () => { __fixture.loadCalls++; return __fixture.loadPromise || import(${JSON.stringify(sdkURL)}); };`);
  const { createBarcodeScanner } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const window = Object.assign(new TestEventTarget(), {
    isSecureContext: secure,
    navigator: { mediaDevices: camera ? { getUserMedia: constraints => { cameraCalls.push(constraints); return camera(); } } : undefined },
  });
  const document = Object.assign(new TestEventTarget(), { hidden: false, defaultView: window });
  const dialog = new TestEventTarget();
  const video = {
    ownerDocument: document,
    srcObject: null,
    readyState: 4,
    videoWidth: 1280,
    paused: true,
    attributes: {},
    pauseCalls: 0,
    playCalls: 0,
    playPromise: null,
    playError: null,
    closest: selector => selector === 'dialog' ? dialog : null,
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    play() {
      this.playCalls++;
      if (this.playError) return Promise.reject(this.playError);
      this.paused = false;
      return this.playPromise || Promise.resolve();
    },
    pause() { this.pauseCalls++; this.paused = true; },
  };
  const cameraCalls = [];
  const detected = [];
  const statuses = [];
  const errors = [];
  const scanner = createBarcodeScanner({ video, onDetected: value => detected.push(value), onStatus: value => statuses.push(value), onError: value => errors.push(value) });
  t.after(() => scanner.destroy());
  const result = (text, format = sdk.BarcodeFormat.EAN_13) => ({ getText: () => text, getBarcodeFormat: () => format });
  return { scanner, video, window, document, dialog, cameraCalls, detected, statuses, errors, fixture: sdk.fixture, formats: sdk.BarcodeFormat, sdk, result };
}

test('construction is idle; explicit start alone loads the local SDK and requests only camera video', async t => {
  const ctx = await setup(t);
  assert.equal(ctx.fixture.loadCalls, 0);
  assert.equal(ctx.cameraCalls.length, 0);
  assert.equal(ctx.fixture.instances.length, 0);
  assert.equal(await ctx.scanner.start(), true);
  assert.equal(ctx.fixture.loadCalls, 1);
  assert.deepEqual(ctx.cameraCalls, [{ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }]);
  assert.deepEqual(ctx.fixture.instances[0].possibleFormats, [ctx.formats.EAN_8, ctx.formats.EAN_13, ctx.formats.UPC_A, ctx.formats.ITF]);
  assert.equal(ctx.video.muted, true);
  assert.equal(ctx.video.playsInline, true);
  assert.deepEqual(ctx.statuses.map(item => item.state), ['starting', 'scanning']);
});

test('a valid result releases every camera track before its one callback, retaining leading zeroes', async t => {
  const stream = cameraStream();
  const ctx = await setup(t, { camera: async () => stream });
  ctx.fixture.results.push(ctx.result('036000291452', ctx.formats.UPC_A));
  await ctx.scanner.start();
  t.mock.timers.tick(0);
  assert.deepEqual(ctx.detected, ['036000291452']);
  assert.equal(ctx.video.srcObject, null);
  assert.equal(ctx.video.paused, true);
  assert.ok(stream.tracks.every(track => track.stops === 1 && track.listenerCount() === 0));
  assert.equal(ctx.statuses.at(-1).state, 'detected');
  ctx.scanner.stop();
  ctx.scanner.destroy();
  t.mock.timers.tick(5000);
  assert.equal(ctx.fixture.decodes, 1);
  assert.equal(ctx.detected.length, 1);
  assert.ok(stream.tracks.every(track => track.stops === 1));
});

test('QR, UPC-E, Code128, wrong format lengths, invalid checksums and arbitrary text never produce a GTIN', async t => {
  const ctx = await setup(t);
  ctx.fixture.results.push(
    ctx.result('4006381333931', ctx.formats.QR_CODE),
    ctx.result('96385074', ctx.formats.UPC_E),
    ctx.result('10012345000017', ctx.formats.CODE_128),
    ctx.result('4006381333931', ctx.formats.ITF),
    ctx.result('4006381333931', ctx.formats.EAN_8),
    ctx.result('4006381333932'),
    ctx.result('0000000000000'),
    ctx.result('https://example.invalid/4006381333931'),
    ctx.result(' 4006381333931 '),
    ctx.result('96385074', ctx.formats.EAN_8),
  );
  await ctx.scanner.start();
  t.mock.timers.tick(0);
  for (let i = 0; i < 8; i++) t.mock.timers.tick(220);
  assert.deepEqual(ctx.detected, []);
  assert.ok(ctx.video.srcObject);
  t.mock.timers.tick(220);
  assert.deepEqual(ctx.detected, ['96385074']);
  assert.equal(ctx.video.srcObject, null);
});

test('EAN-13 and ITF-14 are accepted with their actual lengths', async t => {
  for (const [text, format] of [['4006381333931', 'EAN_13'], ['10012345000017', 'ITF']]) {
    await t.test(format, async child => {
      const ctx = await setup(child);
      ctx.fixture.results.push(ctx.result(text, ctx.formats[format]));
      await ctx.scanner.start();
      child.mock.timers.tick(0);
      assert.deepEqual(ctx.detected, [text]);
    });
  }
});

test('denial is recoverable, reports a sanitized error, and never attaches a camera', async t => {
  const ctx = await setup(t, { camera: async () => { throw Object.assign(new Error('secret device details'), { name: 'NotAllowedError' }); } });
  assert.equal(await ctx.scanner.start(), false);
  assert.equal(ctx.errors.length, 1);
  assert.equal(ctx.errors[0].code, 'camera-denied');
  assert.doesNotMatch(ctx.errors[0].message, /secret|device details/u);
  assert.equal(ctx.video.srcObject, null);
  assert.deepEqual(ctx.statuses.map(item => item.state), ['starting', 'error']);
  assert.equal(await ctx.scanner.start(), false);
  assert.equal(ctx.cameraCalls.length, 2);
});

test('unsupported and insecure contexts fail before the SDK is loaded or permission is requested', async t => {
  for (const options of [{ camera: null }, { secure: false }]) {
    await t.test(options.camera === null ? 'unsupported' : 'insecure', async child => {
      const ctx = await setup(child, options);
      assert.equal(await ctx.scanner.start(), false);
      assert.equal(ctx.fixture.loadCalls, 0);
      assert.equal(ctx.cameraCalls.length, 0);
      assert.equal(ctx.errors.length, 1);
      assert.match(ctx.errors[0].code, /^camera-(?:unsupported|insecure)$/u);
    });
  }
});

test('SDK import failure leaves manual entry available without requesting a camera', async t => {
  const ctx = await setup(t);
  ctx.fixture.loadPromise = Promise.reject(new Error('internal decoder path'));
  assert.equal(await ctx.scanner.start(), false);
  assert.equal(ctx.errors[0].code, 'scanner-unavailable');
  assert.equal(ctx.cameraCalls.length, 0);
  assert.equal(ctx.video.srcObject, null);
});

test('stopping while the SDK loads prevents any later permission request', async t => {
  const ctx = await setup(t);
  const loading = deferred();
  ctx.fixture.loadPromise = loading.promise;
  const start = ctx.scanner.start();
  ctx.scanner.stop();
  loading.resolve(ctx.sdk);
  assert.equal(await start, false);
  assert.equal(ctx.cameraCalls.length, 0);
  assert.equal(ctx.fixture.instances.length, 0);
});

test('concurrent starts share one permission request; an old late stream cannot affect a restarted scan', async t => {
  const permission = deferred();
  const firstStream = cameraStream();
  const secondStream = cameraStream();
  let requests = 0;
  const ctx = await setup(t, { camera: () => ++requests === 1 ? permission.promise : Promise.resolve(secondStream) });
  const firstStart = ctx.scanner.start();
  assert.equal(ctx.scanner.start(), firstStart);
  await flush();
  assert.equal(ctx.cameraCalls.length, 1);
  ctx.scanner.stop();
  assert.equal(await ctx.scanner.start(), true);
  assert.equal(ctx.video.srcObject, secondStream);
  permission.resolve(firstStream);
  assert.equal(await firstStart, false);
  assert.equal(ctx.video.srcObject, secondStream);
  assert.ok(firstStream.tracks.every(track => track.stops === 1));
  assert.ok(secondStream.tracks.every(track => track.stops === 0));
  assert.equal(ctx.errors.length, 0);
});

test('destroy during an open permission prompt stops its late tracks and removes all lifecycle listeners', async t => {
  const permission = deferred();
  const stream = cameraStream();
  const ctx = await setup(t, { camera: () => permission.promise });
  const start = ctx.scanner.start();
  await flush();
  ctx.scanner.destroy();
  const callbackCount = ctx.statuses.length;
  permission.resolve(stream);
  assert.equal(await start, false);
  assert.ok(stream.tracks.every(track => track.stops === 1));
  assert.equal(ctx.video.srcObject, null);
  assert.equal(ctx.statuses.length, callbackCount);
  assert.equal(await ctx.scanner.start(), false);
  assert.equal(ctx.document.listenerCount(), 0);
  assert.equal(ctx.window.listenerCount(), 0);
  assert.equal(ctx.dialog.listenerCount(), 0);
  t.mock.timers.tick(10000);
  assert.equal(ctx.fixture.decodes, 0);
});

test('stop cancels a pending preview immediately; late playback cannot restart decoding', async t => {
  const playback = deferred();
  const stream = cameraStream();
  const ctx = await setup(t, { camera: async () => stream });
  ctx.video.playPromise = playback.promise;
  const start = ctx.scanner.start();
  await flush();
  assert.equal(ctx.video.srcObject, stream);
  ctx.scanner.stop();
  assert.equal(await start, false);
  playback.resolve();
  await flush();
  t.mock.timers.tick(10000);
  assert.ok(stream.tracks.every(track => track.stops === 1));
  assert.equal(ctx.fixture.decodes, 0);
});

test('an unresponsive preview times out and releases the camera', async t => {
  const stream = cameraStream();
  const ctx = await setup(t, { camera: async () => stream });
  ctx.video.playPromise = new Promise(() => {});
  const start = ctx.scanner.start();
  await flush();
  t.mock.timers.tick(8000);
  assert.equal(await start, false);
  assert.equal(ctx.errors[0].code, 'camera-preview');
  assert.ok(stream.tracks.every(track => track.stops === 1));
  assert.equal(ctx.video.srcObject, null);
});

test('hidden document, page departure, dialog close and dialog cancellation stop decoding and every track', async t => {
  for (const event of ['visibilitychange', 'pagehide', 'close', 'cancel']) {
    await t.test(event, async child => {
      const stream = cameraStream();
      const ctx = await setup(child, { camera: async () => stream });
      await ctx.scanner.start();
      if (event === 'visibilitychange') ctx.document.hidden = true;
      const target = event === 'visibilitychange' ? ctx.document : event === 'pagehide' ? ctx.window : ctx.dialog;
      target.dispatchEvent(new Event(event));
      child.mock.timers.tick(1000);
      assert.ok(stream.tracks.every(track => track.stops === 1));
      assert.equal(ctx.video.srcObject, null);
      assert.equal(ctx.fixture.decodes, 0);
      assert.equal(ctx.statuses.at(-1).state, 'stopped');
    });
  }
});

test('routine no-result errors retry; an unexpected decoder error stops the camera without exposing its details', async t => {
  const stream = cameraStream();
  const ctx = await setup(t, { camera: async () => stream });
  ctx.fixture.errors.push({ getKind: () => 'NotFoundException' }, { getKind: () => 'ChecksumException' }, { getKind: () => 'FormatException' }, new Error('secret frame details'));
  await ctx.scanner.start();
  t.mock.timers.tick(0);
  t.mock.timers.tick(220);
  t.mock.timers.tick(220);
  assert.equal(ctx.errors.length, 0);
  assert.ok(ctx.video.srcObject);
  t.mock.timers.tick(220);
  assert.equal(ctx.errors.length, 1);
  assert.equal(ctx.errors[0].code, 'scanner-unavailable');
  assert.doesNotMatch(ctx.errors[0].message, /secret/u);
  assert.ok(stream.tracks.every(track => track.stops === 1));
  t.mock.timers.tick(1000);
  assert.equal(ctx.fixture.decodes, 4);
});

test('camera disconnection stops every remaining track', async t => {
  const stream = cameraStream();
  const ctx = await setup(t, { camera: async () => stream });
  await ctx.scanner.start();
  stream.tracks[0].dispatchEvent(new Event('ended'));
  t.mock.timers.tick(1000);
  assert.ok(stream.tracks.every(track => track.stops === 1));
  assert.equal(ctx.errors[0].code, 'camera-unavailable');
  assert.equal(ctx.fixture.decodes, 0);
});
