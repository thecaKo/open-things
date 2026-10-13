# Open Things

A local-first to-do app modelled on Things 3, with self-hosted sync between macOS and Android.

- `web/`: React + TypeScript PWA. Data lives in IndexedDB, so it works offline. Install it on the Mac (Safari → File → Add to Dock, or Chrome → Install) and on Android (Chrome → Add to Home screen).
- `server/`: zero-dependency Node 24 sync server (`node:http` + `node:sqlite`). It also serves the web app.
- `tools/import-things.ts`: imports your Things 3 database.

## Data model (from Things 3's `main.sqlite`)

| Things (`TMTask`) | open-things |
|---|---|
| `type` 0/1/2 | `kind` todo / project / heading |
| `status` 0/2/3 | `status` open / canceled / done |
| `start` 0/1/2 | `start` inbox / anytime / someday |
| `startDate` (packed int) | `startDate` `YYYY-MM-DD` (future → Upcoming) |
| `startBucket` 1 | `evening` (This Evening) |
| `deadline` | `deadline` |
| `area` / `project` / `heading` | `areaId` / `projectId` / `headingId` |
| `TMChecklistItem` | `checklist[]` embedded |
| `TMTaskTag` | `tagIds[]` |

## Repeating to-dos and projects

Same model as Things: a hidden template holds the rule (daily, weekly on chosen weekdays, monthly on a day or on the "2nd Tuesday", yearly, or N days/weeks/months after completion; optional end date, repeat count, and per-copy deadline). Copies are ordinary tasks with `templateId` and `occurrence`. Upcoming shows projected copies plus a "Repeating" section listing the rules.

Copies are generated on each device from data alone. Ids are deterministic (`<template>:<date>`, or `<template>:#<n>` for after-completion), and generated records carry `updatedAt = 1`. So two devices creating the same copy converge, and real edits always win. Things' own repeating templates are not imported yet (see `tools/import-things.ts`).

## Sync

Each device keeps a full local copy. On every edit (debounced), on focus, and when the server pushes an event (SSE), the client sends its dirty records and pulls everything after its last server `seq`. Conflicts are resolved **last-write-wins per record** by `updatedAt`, so the device clocks need to be roughly correct. Deletions are tombstones (`deleted: true`).

## Deploy (Oracle Cloud VM)

The sync server, web app, OTA bundles and installers all run on one VM (Docker + Caddy with automatic HTTPS). The server is private: every request except `/api/health` needs the token.

```bash
# on the VM (Docker + compose; ports 80/443 open in the VCN security list and in iptables)
git clone git@github.com:<you>/open-things.git && cd open-things   # read-only deploy key
cp .env.example .env   # DOMAIN (e.g. 1-2-3-4.sslip.io) and OPEN_THINGS_TOKEN (openssl rand -hex 32)
docker compose up -d --build
# redeploy: git pull && docker compose up -d --build
```

The apps have the server built in, so there is no setup screen. Builds read it from `web/.env.local`, which is not committed:

```
VITE_SERVER_URL=https://<DOMAIN>
VITE_SERVER_TOKEN=<OPEN_THINGS_TOKEN>
```

The Docker build gets the same two values from `.env` as build args.

- **Browser / PWA:** open `https://<DOMAIN>/?token=<token>` once. An HttpOnly cookie keeps you signed in.
- **Installers:** `https://<DOMAIN>/open-things.apk?token=…` and `https://<DOMAIN>/OpenThings.dmg?token=…`. Copy them into `data/` on the VM.
- **Backup:** copy `data/open-things.sqlite`.
- **Moving servers:** `node tools/push-db.ts <old.sqlite> https://<DOMAIN> <token>` merges an old database. The newer version of each record wins.

### Import from Things 3

Run this on the Mac, ideally with Things closed:

```bash
node tools/import-things.ts https://<DOMAIN> <OPEN_THINGS_TOKEN>
```

## Android app (Capacitor) with over-the-air updates

The APK bundles the web app, so it works offline from the first launch. On launch, on resume, and every 30 minutes it fetches `<server>/version.json`. When the server has a newer build, it downloads `<server>/bundle.zip` (via `@capgo/capacitor-updater`, self-hosted, telemetry off) and applies it the next time the app goes to the background, or immediately if you tap the "New version available" banner.

- **UI or logic change:** `cd web && npm run build` on the machine serving `web/dist`. Phones pick it up automatically.
- **Native change** (new plugin, permissions, icon): `cd web && npm run apk`, then copy `data/open-things.apk` to the server's `data/` dir and reinstall from `<server>/open-things.apk`.

Building requires Java 21 and the Android SDK (`brew install openjdk@21 && brew install --cask android-commandlinetools`, then `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`). APKs are signed with the local debug key (`~/.android/debug.keystore`). Keep that file, because Android only accepts updates signed with the same key.

## macOS app (Electron)

`desktop/` wraps the same web app in a native window: Things-style hidden title bar, Dock and Cmd+Tab, offline-first. It uses the same sync server and the same over-the-air UI updates as Android. The bundled UI is served from an `app://` origin. A newer `/bundle.zip` from the server, verified by SHA-256, is unpacked into the app's data folder and used from then on. Installing a newer `.dmg` discards those downloaded bundles.

```bash
cd desktop && npm install
npm start      # run from source
npm run dist   # build desktop/dist/OpenThings-<version>-arm64.dmg (also copied to data/OpenThings.dmg)
```

The server offers the installers at `<server>/OpenThings.dmg` and `<server>/open-things.apk`. Both are read from `data/`. The app is ad-hoc signed and not notarized. A `.dmg` downloaded through a browser therefore needs right-click → Open the first time, or System Settings → Privacy & Security → Open Anyway.

## Development

```bash
OPEN_THINGS_TOKEN=dev-token-0123456789 node server/src/index.ts   # :8080
cd web && npm install && npm run dev                               # :5173, proxies /api
```

## Roadmap

- Drag-and-drop reordering, Quick Find, reminders/notifications
- Field-level merge for conflicts
