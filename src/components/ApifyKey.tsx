'use client';

import { useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, ChevronDown, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

const STORAGE_KEY = 'snifftest.apifyKey';

// Tiny external store over localStorage. If storage is blocked (private mode etc.) the key lives in memory only.
let memoryKey: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryKey;
  }
}

function writeKey(value: string | null) {
  memoryKey = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

/** The visitor's own Apify key, kept only in this browser. `undefined` on the server = not loaded yet. */
export function useApifyKey() {
  const key = useSyncExternalStore<string | null | undefined>(subscribe, readKey, () => undefined);
  return {
    key: key ?? null,
    loaded: key !== undefined,
    save: (value: string) => writeKey(value),
    remove: () => writeKey(null),
  };
}

type Status = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok'; username: string } | { kind: 'error'; message: string };

export function ApifyKeyPanel({
  userKey,
  serverKey,
  onSave,
  onRemove,
}: {
  userKey: string | null;
  serverKey: boolean;
  onSave: (key: string) => void;
  onRemove: () => void;
}) {
  const needsKey = !userKey && !serverKey;
  // Open by default while no key is available; after that, the visitor's toggle wins.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? needsKey;
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const check = async () => {
    const value = draft.trim();
    if (!value) return;
    setStatus({ kind: 'checking' });
    try {
      const res = await fetch('/api/apify/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      const data = (await res.json()) as { ok: boolean; username?: string; message?: string };
      if (data.ok) {
        onSave(value);
        setDraft('');
        setStatus({ kind: 'ok', username: data.username ?? 'your account' });
      } else setStatus({ kind: 'error', message: data.message ?? 'That key didn’t work.' });
    } catch {
      setStatus({ kind: 'error', message: 'Couldn’t check the key. Are you online?' });
    }
  };

  const summary = userKey
    ? `using your key ···${userKey.slice(-4)}`
    : serverKey
      ? 'provided by this site'
      : 'not added yet';

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setToggled(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <KeyRound className={`h-4 w-4 ${needsKey ? 'text-bad' : 'text-good'}`} />
        <span>
          Apify key: <span className={needsKey ? 'font-medium text-bad' : 'text-ink'}>{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-2xl border border-dashed border-line bg-surface/70 p-5 animate-rise">
          <p className="font-hand text-2xl leading-none text-warn">{needsKey ? 'one quick thing first…' : 'your Apify key'}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Link checks use <strong className="text-ink">Apify</strong> to collect the reviews from Google Maps. Their free plan covers a few thousand
            reviews a month and doesn’t need a card.
          </p>

          <ol className="mt-4 space-y-2.5 text-sm">
            {[
              <>
                Create a free account at{' '}
                <a href="https://console.apify.com/sign-up" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand underline-offset-4 hover:underline">
                  apify.com <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </>,
              <>
                Open{' '}
                <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand underline-offset-4 hover:underline">
                  Settings → API &amp; Integrations <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </>,
              <>
                Copy your <strong>Personal API token</strong> (starts with <code className="rounded bg-surface-2 px-1 font-mono text-[12px]">apify_api_</code>) and paste it below
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-ink italic">{i + 1}</span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void check();
            }}
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative min-w-0 flex-1">
              <input
                type={reveal ? 'text' : 'password'}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (status.kind === 'error') setStatus({ kind: 'idle' });
                }}
                placeholder={userKey ? 'Paste a new key to replace it' : 'apify_api_…'}
                autoComplete="off"
                spellCheck={false}
                aria-label="Apify API token"
                className="w-full rounded-full border border-line bg-surface py-2.5 pr-11 pl-4 font-mono text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide key' : 'Show key'}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:text-ink"
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={!draft.trim() || status.kind === 'checking'}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
            >
              {status.kind === 'checking' && <Loader2 className="h-4 w-4 animate-spin" />}
              {status.kind === 'checking' ? 'Checking…' : 'Save key'}
            </button>
          </form>

          {status.kind === 'ok' && (
            <p className="mt-3 text-sm text-good">
              <span className="font-hand mr-1 text-xl">nice!</span> Connected to Apify as <strong>{status.username}</strong>. You’re ready to check links.
            </p>
          )}
          {status.kind === 'error' && <p className="mt-3 text-sm text-bad">{status.message}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-line pt-3 text-xs text-muted">
            <span>Saved only in this browser. It’s passed to Apify when you run a check and never stored on our server.</span>
            {userKey && (
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  setStatus({ kind: 'idle' });
                }}
                className="font-semibold text-bad underline-offset-4 hover:underline"
              >
                Remove my key
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
