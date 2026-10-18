// "Install the app" support. Browsers that can install PWAs fire
// beforeinstallprompt once, possibly before the home screen is drawn, so we
// keep the event here and let screens ask for it.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own button instead of the mini-infobar
  deferred = e as InstallPromptEvent;
  notify();
});

addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const canInstall = () => !!deferred && !isStandalone();

export async function install() {
  if (!deferred) return;
  const e = deferred;
  deferred = null;
  await e.prompt();
  await e.userChoice;
  notify();
}

/** Subscribe to availability changes; returns an unsubscribe function. */
export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
