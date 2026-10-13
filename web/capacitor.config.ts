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
    backgroundColor: '#141416', // WebView colour before first paint (matches the splash)
  },
  plugins: {
    SplashScreen: {
      // Native splash (same first frame as the web splash) stays up until the web
      // splash has painted and calls SplashScreen.hide(): no gap between the two.
      launchAutoHide: false,
      launchFadeOutDuration: 0,
      backgroundColor: '#141416',
      androidSplashResourceName: 'splash_screen',
      showSpinner: false,
    },
    CapacitorUpdater: {
      autoUpdate: false, // we drive updates from our own server (src/update.ts)
      statsUrl: '', // no telemetry to Capgo
      appReadyTimeout: 10000,
    },
  },
};

export default config;
