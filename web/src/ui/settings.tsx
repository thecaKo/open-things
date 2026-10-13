// Settings: read-only status. The sync server is built into the app (see sync.ts).
import { useSyncExternalStore } from 'react';
import { db } from '../db';
import { getSyncState, subscribeSync, syncNow, LOCAL_ONLY } from '../sync';
import { APP_VERSION, isApp, isDesktop, getUpdateStatus, subscribeUpdate, checkForUpdate } from '../update';
import { Sheet, ActionList, Action } from './Sheet';
import { ThemeSegmented } from './theme-controls';

const SERVER = (import.meta.env.VITE_SERVER_URL ?? '').replace(/^https?:\/\//, '') || 'this site';
const SYNC_LABEL = { local: 'Not configured', syncing: 'Syncing…', synced: 'Up to date', offline: 'Offline', error: 'Error' };

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, lastError } = useSyncExternalStore(subscribeSync, getSyncState);
  const update = useSyncExternalStore(subscribeUpdate, getUpdateStatus);

  return (
    <Sheet open={open} onClose={onClose} title="Settings" action={<button className="text-btn" onClick={onClose}>Done</button>}>
      <div className="settings-section-title">Appearance</div>
      <ThemeSegmented />
      <div className="settings-section-title">{LOCAL_ONLY ? 'Storage' : 'Sync'}</div>
      {LOCAL_ONLY ? (
        <ActionList>
          <Action label="Storage" detail="This device only" onClick={() => {}} />
          <Action label="Version" detail={APP_VERSION} onClick={() => {}} />
        </ActionList>
      ) : (<>
      <ActionList>
        <Action label="Sync" detail={SYNC_LABEL[state] + (lastError ? ` · ${lastError}` : '')} onClick={() => void syncNow()} />
        <Action label="Server" detail={SERVER} onClick={() => void syncNow()} />
        <Action
          label="Version"
          detail={`${APP_VERSION}${isDesktop ? ' · Mac' : isApp ? ' · Android' : ''}`}
          onClick={() => void checkForUpdate()}
        />
      </ActionList>
      {isApp && (update.checkedAt > 0 || update.error) && (
        <p className="muted">
          {update.checkedAt > 0 && `Updates checked ${new Date(update.checkedAt).toLocaleTimeString()}`}
          {update.error && ` · update error: ${update.error}`}
        </p>
      )}
      <ActionList>
        <Action label="Sync Now" onClick={() => void syncNow()} />
        {isApp && <Action label="Check for Updates" onClick={() => void checkForUpdate()} />}
      </ActionList>
      </>)}
      <ActionList>
        <Action danger label={LOCAL_ONLY ? 'Erase All Data' : 'Reset Local Data'} onClick={async () => {
          if (!confirm(LOCAL_ONLY
            ? 'Erase all your to-dos? They exist only on this device and cannot be recovered.'
            : 'Erase the data stored on this device? Everything synced is downloaded again from the server; unsynced changes are lost.')) return;
          await db.delete();
          location.reload();
        }} />
      </ActionList>
    </Sheet>
  );
}
