import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.openthings',
  appName: 'Open Things',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Allow syncing with a plain-http server on the LAN during development.
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false, // we drive updates from our own server (src/update.ts)
      statsUrl: '', // no telemetry to Capgo
      appReadyTimeout: 10000,
    },
  },
};

export default config;
