// Open Things for macOS: an Electron shell around the web app (../web).
//
// The UI is served from a custom app:// origin (stable storage origin for
// IndexedDB, secure context). It comes from the copy bundled in the .app, or from
// a newer web bundle downloaded from the sync server (same /version.json +
// /bundle.zip + SHA-256 scheme the Android app uses), so UI updates don't need a
// new .dmg.
const { app, BrowserWindow, protocol, net, ipcMain, shell, nativeTheme, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { unzipSync } = require('fflate');

const ORIGIN = 'app://open-things';
const BUNDLED = path.join(__dirname, 'web');
const BUNDLES = () => path.join(app.getPath('userData'), 'bundles');
const ACTIVE = () => path.join(app.getPath('userData'), 'active-bundle.json');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** Directory to serve the UI from: a downloaded bundle if it belongs to this app build. */
function webRoot() {
  try {
    const active = JSON.parse(fs.readFileSync(ACTIVE(), 'utf8'));
    if (active.appVersion === app.getVersion() && fs.existsSync(path.join(active.dir, 'index.html'))) return active.dir;
    // A new .dmg was installed: its bundled UI wins; drop bundles made for the old build.
    fs.rmSync(BUNDLES(), { recursive: true, force: true });
    fs.rmSync(ACTIVE(), { force: true });
  } catch {
    // no downloaded bundle
  }
  return BUNDLED;
}

let root = BUNDLED;
let win = null;

function serve(request) {
  const { pathname } = new URL(request.url);
  let file = path.normalize(path.join(root, decodeURIComponent(pathname)));
  if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); // SPA fallback
  return net.fetch(pathToFileURL(file).toString());
}

/** Download, verify and unpack a web bundle; it becomes active on the next load. */
async function downloadBundle(_event, { url, version, checksum }) {
  if (!/^[\w.-]+$/.test(version)) throw new Error('bad version');
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  if (!checksum || sha !== checksum.toLowerCase()) throw new Error('checksum mismatch');

  const dir = path.join(BUNDLES(), version);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [name, data] of Object.entries(unzipSync(new Uint8Array(zip)))) {
    if (name.endsWith('/')) continue;
    const out = path.normalize(path.join(dir, name));
    if (!out.startsWith(dir + path.sep)) throw new Error('bad zip entry');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
  }
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error('bundle has no index.html');
  fs.writeFileSync(ACTIVE(), JSON.stringify({ version, dir, appVersion: app.getVersion() }));
  return { version };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 780,
    minHeight: 520,
    title: 'Open Things',
    titleBarStyle: 'hiddenInset', // traffic lights over the sidebar, like Things for Mac
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // Lets the app:// page sync with a plain-http server on the LAN (no-op over https).
      allowRunningInsecureContent: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  // Links open in the browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  win.on('closed', () => { win = null; });
  void win.loadURL(`${ORIGIN}/`);
}

app.whenReady().then(() => {
  root = webRoot();
  protocol.handle('app', serve);
  ipcMain.handle('updates:download', downloadBundle);
  ipcMain.handle('updates:apply', () => {
    root = webRoot();
    win?.webContents.reloadIgnoringCache();
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
