import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startSync, setConfig } from './sync';
import { startUpdates, isApp, isDesktop } from './update';
import { installBackHandlers } from './ui/back';
import './styles.css';

// One-tap device setup: open https://your-server/#token=XXXX
const hashToken = new URLSearchParams(location.hash.slice(1)).get('token');
if (hashToken) {
  history.replaceState(null, '', location.pathname);
  await setConfig({ url: '', token: hashToken });
}

if (isDesktop) document.documentElement.classList.add('desktop');

if (isApp) {
  startUpdates();
} else {
  // Browser/PWA: the service worker handles offline + updates. Not used in the
  // native app, where it would serve stale files over OTA bundles.
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

startSync();
installBackHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
