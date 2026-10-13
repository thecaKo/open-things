import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startSync, setConfig } from './sync';
import { startUpdates, isNative } from './update';
import './styles.css';

// One-tap device setup: open https://your-server/#token=XXXX
const hashToken = new URLSearchParams(location.hash.slice(1)).get('token');
if (hashToken) {
  history.replaceState(null, '', location.pathname);
  await setConfig({ url: '', token: hashToken });
}

if (isNative) {
  startUpdates();
} else {
  // Browser/PWA: the service worker handles offline + updates. Not used in the
  // native app, where it would serve stale files over OTA bundles.
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
