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

## Deploy on the Oracle VM

```bash
# on the VM (Docker + compose plugin installed; ports 80/443 open in the VCN security list AND the VM firewall)
git clone <this repo> open-things && cd open-things
cp .env.example .env   # set DOMAIN and OPEN_THINGS_TOKEN (openssl rand -hex 24)
docker compose up -d --build
```

Oracle Ubuntu images block ports at the OS firewall too:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Then, on each device, open `https://<DOMAIN>/#token=<OPEN_THINGS_TOKEN>` once. The token is saved locally and removed from the URL. After that, install the app to the Dock or home screen.

Backup: copy `data/open-things.sqlite`.

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

## Development

```bash
OPEN_THINGS_TOKEN=dev-token-0123456789 node server/src/index.ts   # :8080
cd web && npm install && npm run dev                               # :5173, proxies /api
```

## Roadmap

- Drag-and-drop reordering, Quick Find, reminders/notifications
- Native wrappers: Capacitor (Android APK) / Tauri (macOS), reusing `web/` as is
- Field-level merge for conflicts
