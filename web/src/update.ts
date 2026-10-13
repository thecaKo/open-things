// Over-the-air updates for the native (Capacitor) app.
// The APK ships with a bundled copy of the web app. On launch/resume it asks the
// sync server for /version.json; if newer, it downloads /bundle.zip, stages it
// with the updater plugin, and applies it on next background (or immediately
// when the user taps the banner). Native code changes still need a new APK.
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { getConfig } from './sync';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;
export const isNative = Capacitor.isNativePlatform();

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

let checking = false;
export async function checkForUpdate() {
  if (!isNative || checking) return;
  checking = true;
  try {
    const { url } = await getConfig();
    if (!url) return;
    const res = await fetch(`${url}/version.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version, checksum } = (await res.json()) as { version?: string; checksum?: string };
    setStatus({ checkedAt: Date.now(), latest: version ?? '', error: '' });
    if (!version || version === APP_VERSION || ready?.version === version) return;

    const { bundles } = await CapacitorUpdater.list();
    const bundle =
      bundles.find((b) => b.version === version && b.status === 'success') ??
      (await CapacitorUpdater.download({ url: `${url}/bundle.zip`, version, checksum }));
    await CapacitorUpdater.next({ id: bundle.id }); // applied when the app goes to background
    ready = { id: bundle.id, version };
    subscribers.forEach((fn) => fn());
  } catch (e) {
    console.warn('update check failed', e);
    setStatus({ checkedAt: Date.now(), error: String((e as Error)?.message ?? e) });
  } finally {
    checking = false;
  }
}

export async function applyUpdate() {
  if (ready) await CapacitorUpdater.set({ id: ready.id }); // reloads the WebView
}

export function startUpdates() {
  if (!isNative) return;
  // Confirms this bundle booted fine; otherwise the plugin rolls back.
  void CapacitorUpdater.notifyAppReady();
  void checkForUpdate();
  void CapApp.addListener('resume', () => void checkForUpdate());
  setInterval(() => void checkForUpdate(), 30 * 60_000);
}
