const CHANNEL_NAME = 'intimo-catalog';
const CHANGE_EVENT = 'intimo-catalog-changed';

// Only the fact that something changed crosses tabs: no product or account data.
export function notifyCatalogChanged() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* A notification must never turn a successful save into an error. */ }
  if (typeof BroadcastChannel === 'undefined') return;
  let channel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'catalog-changed' });
  } catch { /* Polling also covers browsers without a working channel. */ }
  finally { try { channel?.close(); } catch { /* Optional notification only. */ } }
}

export function createCatalogSync({
  readVersion,
  readCatalog,
  onData,
  onError = () => {},
  onStart = () => {},
  onSuccess = () => {},
  onSettled = () => {},
  interval = 15000,
  timeout = 12000,
}) {
  let hasData = false;
  let version;
  let pending;
  let controller;
  let pollTimer;
  let suspended = false;
  let destroyed = false;
  let recheck = false;
  let pauseAbort = false;
  let channel;

  const visible = () => !destroyed && !suspended && document.visibilityState !== 'hidden';
  const stopTimer = () => { clearTimeout(pollTimer); pollTimer = undefined; };
  const schedule = () => {
    stopTimer();
    if (visible()) pollTimer = setTimeout(() => check(), interval);
  };

  async function check({ force = false, changed = false } = {}) {
    if (!visible()) return;
    if (pending) {
      // Focus events during the initial request must not start a second load.
      // A mutation, however, deserves one more version check after this request.
      if (changed) recheck = true;
      return pending;
    }
    stopTimer();
    controller = new AbortController();
    const requestController = controller;
    pauseAbort = false;
    const deadline = setTimeout(() => requestController.abort(), timeout);
    pending = (async () => {
      onStart({ initial: !hasData });
      let nextVersion;
      let versionError;
      try {
        // Read the baseline first. A mutation while data is loading will then
        // be detected by the next version check, rather than being overlooked.
        nextVersion = await readVersion(requestController.signal);
        if (requestController.signal.aborted) throw requestController.signal.reason;
        if (typeof nextVersion !== 'string' || !nextVersion) throw new Error('Versione del catalogo non disponibile.');
      } catch (error) {
        if (requestController.signal.aborted) throw error;
        versionError = error;
        if (hasData && !force) throw error;
      }
      if (!hasData || force || version === undefined || nextVersion !== version) {
        const data = await readCatalog(requestController.signal, { initial: !hasData });
        if (requestController.signal.aborted) return;
        onData(data, { initial: !hasData });
        hasData = true;
        version = nextVersion;
      }
      if (versionError) onError(versionError, { initial: false, versionOnly: true });
      else onSuccess();
    })().catch(error => {
      if (!pauseAbort && !destroyed) onError(error, { initial: !hasData });
    }).finally(() => {
      clearTimeout(deadline);
      pending = undefined;
      controller = undefined;
      onSettled();
      if (recheck && visible()) {
        recheck = false;
        queueMicrotask(() => check());
      } else schedule();
    });
    return pending;
  }

  function pause() {
    stopTimer();
    recheck = false;
    if (controller) { pauseAbort = true; controller.abort(); }
  }
  function resume() {
    if (!visible()) return;
    if (pending && pauseAbort) recheck = true;
    else check();
  }
  const onVisibility = () => document.visibilityState === 'hidden' ? pause() : resume();
  const onPageHide = () => { suspended = true; pause(); };
  const onPageShow = () => {
    const wasSuspended = suspended;
    suspended = false;
    if (wasSuspended || (!hasData && !pending)) resume();
  };
  const onChange = () => check({ changed: true });
  const onMessage = event => { if (event.data?.type === 'catalog-changed') onChange(); };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', resume);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener(CHANGE_EVENT, onChange);
  if (typeof BroadcastChannel !== 'undefined') {
    try { channel = new BroadcastChannel(CHANNEL_NAME); channel.addEventListener('message', onMessage); }
    catch { /* Version polling remains available. */ }
  }

  return {
    start: () => check(),
    refresh: () => check({ force: true }),
    destroy() {
      destroyed = true;
      pause();
      channel?.close();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener(CHANGE_EVENT, onChange);
    },
  };
}
