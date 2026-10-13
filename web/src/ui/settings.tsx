import { useEffect, useState, useSyncExternalStore } from 'react';
import { db } from '../db';
import { getSyncState, subscribeSync, syncNow, getConfig, setConfig } from '../sync';
import { APP_VERSION, isNative, getUpdateStatus, subscribeUpdate, checkForUpdate } from '../update';
import { Sheet, ActionList, Action } from './Sheet';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const { state, lastError } = useSyncExternalStore(subscribeSync, getSyncState);
  const update = useSyncExternalStore(subscribeUpdate, getUpdateStatus);
  useEffect(() => {
    if (open) void getConfig().then((c) => { setUrl(c.url); setToken(c.token); });
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Settings"
      action={<button className="text-btn" onClick={async () => { await setConfig({ url, token }); onClose(); }}>Save</button>}
    >
      <p className="muted">
        Your data lives on this device and syncs to your server.
        {isNative ? ' Paste the setup link (https://server/#token=…) or fill both fields.' : ' Leave the URL empty when the app is served by the sync server itself.'}
      </p>
      <div className="form">
        <label className="form-row stacked">
          <span>Server URL</span>
          <input
            className="text-input"
            placeholder="https://things.example.com"
            value={url}
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="url"
            onChange={(e) => {
              // Accept a full setup link: https://server/#token=XXXX
              const [base, hash] = e.target.value.split('#');
              const t = new URLSearchParams(hash ?? '').get('token');
              if (t) { setUrl(base.replace(/\/+$/, '')); setToken(t); } else setUrl(e.target.value);
            }}
          />
        </label>
        <label className="form-row stacked">
          <span>Token</span>
          <input className="text-input" type="password" placeholder="OPEN_THINGS_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
      </div>
      <p className="muted">Sync: {state}{lastError && ` · ${lastError}`}</p>
      <p className="muted">
        Version {APP_VERSION}{isNative ? ' (app)' : ''}
        {isNative && update.checkedAt > 0 && ` · checked ${new Date(update.checkedAt).toLocaleTimeString()}`}
        {update.error && ` · update error: ${update.error}`}
      </p>
      <ActionList>
        <Action label="Sync Now" onClick={() => void syncNow()} />
        {isNative && <Action label="Check for Updates" onClick={() => void checkForUpdate()} />}
      </ActionList>
      <ActionList>
        <Action danger label="Reset Local Data" onClick={async () => {
          if (!confirm('Erase all local data on this device? Unsynced changes are lost; synced data will be downloaded again.')) return;
          await db.delete();
          location.reload();
        }} />
      </ActionList>
    </Sheet>
  );
}
