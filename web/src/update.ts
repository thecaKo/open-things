// Over-the-air updates for the installed apps (Android via Capacitor, macOS via
// Electron). Each ships with a bundled copy of the web app. On launch/resume it
// asks the sync server for /version.json; if newer, it downloads /bundle.zip
// (SHA-256 verified), stages it, and applies it later (Android: next time the app
// goes to background; macOS: next launch) or immediately when the user taps the
// banner. Native code changes still need a new APK/.dmg.
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { getConfig } from './sync';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

interface DesktopBridge {
  platform: string;
  downloadUpdate(opts: { url: string; version: string; checksum?: string }): Promise<{ version: string }>;
  applyUpdate(): Promise<void>;
}
const desktop = (window as unknown as { openThingsDesktop?: DesktopBridge }).openThingsDesktop;

/** Android app (Capacitor). */
export const isNative = Capacitor.isNativePlatform();
/** macOS app (Electron). */
export const isDesktop = !!desktop;
/** Any installed app: no same-origin server, no service worker, OTA updates. */
export const isApp = isNative || isDesktop;

let ready: { id: string; version: string } | null = null;
const subscribers = new Set<() => void>();
export const getPendingUpdate = () => ready;

// Last check result, shown in Settings for troubleshooting.
let status = { checkedAt: 0, latest: '', error: '' };
export const getUpdateStatus = () => status;
function setStatus(patch: Partial<typeof status>) {
  status = { ...status, ...patch };
  subscribers.forEach((fn) => fn());
}
export function subscribeUpdate(fn: () => void) {
  subscribers.add(fn);
  return () => void subscribers.delete(fn);
}

/** Download the bundle and stage it; returns an id to apply it with. */
async function stage(url: string, version: string, checksum?: string): Promise<string> {
  if (desktop) {
    await desktop.downloadUpdate({ url: `${url}/bundle.zip`, version, checksum });
    return version;
  }
  const { bundles } = await CapacitorUpdater.list();
  const bundle =
    // A downloaded-but-not-yet-applied bundle is 'pending': reuse it instead of re-downloading.
    bundles.find((b) => b.version === version && (b.status === 'success' || b.status === 'pending')) ??
    (await CapacitorUpdater.download({ url: `${url}/bundle.zip`, version, checksum }));
  await CapacitorUpdater.next({ id: bundle.id }); // applied when the app goes to background
  return bundle.id;
}

let checking = false;
export async function checkForUpdate() {
  if (!isApp || checking) return;
  checking = true;
  try {
    const { url } = await getConfig();
    if (!url) return;
    const res = await fetch(`${url}/version.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version, checksum } = (await res.json()) as { version?: string; checksum?: string };
    setStatus({ checkedAt: Date.now(), latest: version ?? '', error: '' });
    if (!version || version === APP_VERSION || ready?.version === version) return;
    ready = { id: await stage(url, version, checksum), version };
    subscribers.forEach((fn) => fn());
  } catch (e) {
    console.warn('update check failed', e);
    setStatus({ checkedAt: Date.now(), error: String((e as Error)?.message ?? e) });
  } finally {
    checking = false;
  }
}

export async function applyUpdate() {
  if (!ready) return;
  if (desktop) await desktop.applyUpdate(); // reloads the window from the new bundle
  else await CapacitorUpdater.set({ id: ready.id }); // reloads the WebView
}

export function startUpdates() {
  if (!isApp) return;
  // Confirms this bundle booted fine; otherwise the plugin rolls back.
  if (isNative) void CapacitorUpdater.notifyAppReady();
  void checkForUpdate();
  if (isNative) void CapApp.addListener('resume', () => void checkForUpdate());
  else window.addEventListener('focus', () => void checkForUpdate());
  setInterval(() => void checkForUpdate(), 30 * 60_000);
}
