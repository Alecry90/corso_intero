import { normalizeGTIN } from './product-barcodes.js';

const SCAN_INTERVAL = 220;
const PREVIEW_TIMEOUT = 8000;
const RETRYABLE_DECODE_ERRORS = new Set(['NotFoundException', 'ChecksumException', 'FormatException']);

// Vite serves this optional chunk from this site's own assets. No camera frames
// or decoded values are sent to ZXing or any other scanning service.
const loadDecoder = () => import('@zxing/browser');

function scannerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function cameraError(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) {
    return scannerError('camera-denied', 'Accesso alla fotocamera non consentito. Puoi autorizzarlo nelle impostazioni del browser oppure inserire il codice manualmente.');
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) {
    return scannerError('camera-missing', 'Nessuna fotocamera disponibile. Inserisci il codice manualmente.');
  }
  if (['NotReadableError', 'TrackStartError'].includes(error?.name)) {
    return scannerError('camera-busy', 'La fotocamera non è disponibile: potrebbe essere usata da un’altra applicazione. Riprova oppure inserisci il codice manualmente.');
  }
  return scannerError('camera-unavailable', 'Non è stato possibile avviare la fotocamera. Riprova oppure inserisci il codice manualmente.');
}

function stopTracks(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch { /* Continue releasing the remaining tracks. */ }
  }
}

/**
 * Local, optional camera scanner. Constructing this controller never requests a
 * camera or downloads the decoder. Call start() only from the user's start action.
 * onDetected receives the checksum-validated GTIN, preserving its original length
 * and leading zeroes; the product model handles canonical identity comparisons.
 * onStatus receives { state, message }; start() resolves false on cancellation or
 * an error reported through onError. The owner must call stop() on logout and
 * destroy() when removing the scanner UI.
 */
export function createBarcodeScanner({ video, onDetected, onStatus, onError } = {}) {
  if (!video || typeof video.play !== 'function') throw new TypeError('È necessario un elemento video per lo scanner.');
  const ownerDocument = video.ownerDocument || globalThis.document;
  const ownerWindow = ownerDocument?.defaultView || globalThis.window;
  const dialog = video.closest?.('dialog');
  let active = null;
  let destroyed = false;

  const isCurrent = session => !destroyed && active === session && !session.cancelled;
  const status = (state, message) => { if (!destroyed) onStatus?.({ state, message }); };

  function release(session) {
    session.cancelled = true;
    clearTimeout(session.scanTimer);
    session.cancelPlayback?.();
    session.cancelPlayback = null;
    for (const [track, listener] of session.trackListeners) track.removeEventListener?.('ended', listener);
    session.trackListeners.length = 0;
    // A late response from an older permission request must never clear a new
    // scan's preview or stop the new scan's stream.
    if (session.stream && video.srcObject === session.stream) {
      try { video.pause(); } catch { /* The tracks still need to be stopped. */ }
      video.srcObject = null;
      video.removeAttribute?.('src');
    }
    stopTracks(session.stream);
    session.stream = null;
    session.decoder = null;
  }

  function finish(session, state, message) {
    if (!isCurrent(session)) return false;
    active = null;
    release(session);
    status(state, message);
    return true;
  }

  function fail(session, error) {
    if (finish(session, 'error', error.message) && !destroyed) onError?.(error);
    return false;
  }

  function stop() {
    if (active) finish(active, 'stopped', 'Fotocamera spenta. Puoi inserire il codice manualmente.');
  }

  function waitForPlayback(session) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const complete = (error, playing = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        session.cancelPlayback = null;
        if (error) reject(error);
        else resolve(playing);
      };
      const timer = setTimeout(() => complete(scannerError('camera-preview', 'L’anteprima della fotocamera non si è avviata. Riprova oppure inserisci il codice manualmente.')), PREVIEW_TIMEOUT);
      session.cancelPlayback = () => complete(null, false);
      try {
        Promise.resolve(video.play()).then(() => complete(null, true), error => complete(cameraError(error)));
      } catch (error) {
        complete(cameraError(error));
      }
    });
  }

  function decodedGTIN(result, formats) {
    if (!result) return null;
    const text = result.getText();
    const length = formats.get(result.getBarcodeFormat());
    // UPC-E is intentionally excluded: its eight digits are not an EAN-8 GTIN.
    // ITF is accepted only with exactly fourteen digits and a valid GTIN check.
    if (!length || typeof text !== 'string' || text.length !== length || !/^\d+$/u.test(text)) return null;
    try { return normalizeGTIN(text); } catch { return null; }
  }

  function scan(session) {
    if (!isCurrent(session)) return;
    session.scanTimer = null;
    if (ownerDocument?.hidden) { stop(); return; }
    let result;
    if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused) {
      try {
        result = session.decoder.decode(video);
      } catch (error) {
        if (!RETRYABLE_DECODE_ERRORS.has(error?.getKind?.() || error?.name)) {
          fail(session, scannerError('scanner-unavailable', 'La lettura del codice non è disponibile in questo browser. Inserisci il codice manualmente.'));
          return;
        }
      }
    }
    const gtin = decodedGTIN(result, session.formats);
    if (gtin) {
      // Release every camera track before delivering the one successful result.
      if (finish(session, 'detected', 'Codice letto. Fotocamera spenta.') && !destroyed) onDetected?.(gtin);
      return;
    }
    if (isCurrent(session)) session.scanTimer = setTimeout(() => scan(session), SCAN_INTERVAL);
  }

  async function run(session) {
    if (!isCurrent(session)) return false;
    let decoderModule;
    try { decoderModule = await loadDecoder(); } catch {
      return fail(session, scannerError('scanner-unavailable', 'Il lettore non è disponibile. Controlla la connessione oppure inserisci il codice manualmente.'));
    }
    if (!isCurrent(session)) return false;
    try {
      const { BrowserMultiFormatReader, BarcodeFormat } = decoderModule;
      session.formats = new Map([[BarcodeFormat.EAN_8, 8], [BarcodeFormat.EAN_13, 13], [BarcodeFormat.UPC_A, 12], [BarcodeFormat.ITF, 14]]);
      session.decoder = new BrowserMultiFormatReader();
      session.decoder.possibleFormats = [...session.formats.keys()];
    } catch {
      return fail(session, scannerError('scanner-unavailable', 'Il lettore non è disponibile in questo browser. Inserisci il codice manualmente.'));
    }
    let stream;
    try {
      stream = await ownerWindow.navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (error) {
      return fail(session, cameraError(error));
    }
    // Permission prompts cannot be aborted by the browser API. If the owner
    // stopped or destroyed us while the prompt was open, dispose its late stream.
    if (!isCurrent(session)) { stopTracks(stream); return false; }
    session.stream = stream;
    try {
      for (const track of stream.getTracks()) {
        const ended = () => fail(session, scannerError('camera-unavailable', 'La fotocamera è stata disconnessa. Riprova oppure inserisci il codice manualmente.'));
        track.addEventListener?.('ended', ended);
        session.trackListeners.push([track, ended]);
      }
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute?.('playsinline', '');
      video.setAttribute?.('muted', '');
      video.srcObject = stream;
      const playing = await waitForPlayback(session);
      if (!playing || !isCurrent(session)) return false;
    } catch (error) {
      return fail(session, error?.code === 'camera-preview' ? error : cameraError(error));
    }
    status('scanning', 'Inquadra il codice a barre con la fotocamera posteriore. La lettura avviene sul dispositivo.');
    if (isCurrent(session)) session.scanTimer = setTimeout(() => scan(session), 0);
    return isCurrent(session);
  }

  function start() {
    if (destroyed || ownerDocument?.hidden) return Promise.resolve(false);
    if (active) return active.promise;
    const session = { cancelled: false, stream: null, decoder: null, scanTimer: null, cancelPlayback: null, trackListeners: [] };
    active = session;
    if (ownerWindow?.isSecureContext === false) {
      return Promise.resolve(fail(session, scannerError('camera-insecure', 'La fotocamera richiede una connessione HTTPS. Inserisci il codice manualmente.')));
    }
    if (typeof ownerWindow?.navigator?.mediaDevices?.getUserMedia !== 'function') {
      return Promise.resolve(fail(session, scannerError('camera-unsupported', 'Questo browser non consente l’uso della fotocamera. Inserisci il codice manualmente.')));
    }
    status('starting', 'Avvio della fotocamera…');
    session.promise = run(session);
    return session.promise;
  }

  const visibilityChanged = () => { if (ownerDocument.hidden) stop(); };
  ownerDocument?.addEventListener('visibilitychange', visibilityChanged);
  ownerWindow?.addEventListener('pagehide', stop);
  dialog?.addEventListener('close', stop);
  dialog?.addEventListener('cancel', stop);

  function destroy() {
    if (destroyed) return;
    stop();
    destroyed = true;
    ownerDocument?.removeEventListener('visibilitychange', visibilityChanged);
    ownerWindow?.removeEventListener('pagehide', stop);
    dialog?.removeEventListener('close', stop);
    dialog?.removeEventListener('cancel', stop);
  }

  return { start, stop, destroy };
}
