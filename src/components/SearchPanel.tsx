'use client';

import { useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Download, FileUp } from 'lucide-react';
import { DEMOS, type DemoKey } from '@/lib/demo';
import { ApifyKeyPanel } from './ApifyKey';

export type SearchRequest =
  | { kind: 'link'; url: string; maxReviews: number; refresh: boolean }
  | { kind: 'import'; content: string; placeName: string }
  | { kind: 'demo'; key: DemoKey };

const SIZES = [
  { value: 50, label: '50', hint: 'quick look' },
  { value: 150, label: '150', hint: 'recommended' },
  { value: 300, label: '300', hint: 'deep dive' },
];

const TILTS = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2'];
const TAG_COLORS = ['bg-warn-soft', 'bg-bad-soft', 'bg-info-soft', 'bg-good-soft'];

export function SearchPanel({
  serverKey,
  userKey,
  keyLoaded,
  onSaveKey,
  onRemoveKey,
  busy,
  onSubmit,
}: {
  serverKey: boolean | null;
  userKey: string | null;
  keyLoaded: boolean;
  onSaveKey: (key: string) => void;
  onRemoveKey: () => void;
  busy: boolean;
  onSubmit: (req: SearchRequest) => void;
}) {
  const [tab, setTab] = useState<'link' | 'paste'>('link');
  const [url, setUrl] = useState('');
  const [maxReviews, setMaxReviews] = useState(150);
  const [refresh, setRefresh] = useState(false);
  const [content, setContent] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const keyKnown = serverKey !== null && keyLoaded;
  const linkDisabled = keyKnown && !serverKey && !userKey;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setContent(await file.text());
    if (!placeName) setPlaceName(file.name.replace(/\.(csv|json|txt|tsv)$/i, '').replace(/[-_]+/g, ' '));
  };

  return (
    <div>
      <div role="tablist" className="mb-3 flex items-center gap-5 text-[15px]">
        {(
          [
            { key: 'link', label: 'Paste a Maps link' },
            { key: 'paste', label: 'I have the reviews' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`relative pb-1 font-medium transition ${tab === key ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {label}
            {tab === key && (
              <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-2 w-full" aria-hidden>
                <path d="M2 5 C 25 2, 50 7, 98 3" fill="none" stroke="var(--bad)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {tab === 'link' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) onSubmit({ kind: 'link', url: url.trim(), maxReviews, refresh });
          }}
        >
          <div className="paper flex items-center gap-2 rounded-full! p-1.5 pl-5 focus-within:ring-4 focus-within:ring-brand/15">
            <input
              type="url"
              inputMode="url"
              aria-label="Google Maps link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="maps.app.goo.gl/…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted/70"
            />
            <button
              type="submit"
              disabled={busy || linkDisabled || !url.trim()}
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-3 text-[15px] font-semibold text-brand-ink transition hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Check it <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          </div>

          {!linkDisabled && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 pl-2 text-sm text-muted">
              <span className="flex items-center gap-2">
                check the latest
                <span className="inline-flex gap-1">
                  {SIZES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      title={s.hint}
                      onClick={() => setMaxReviews(s.value)}
                      className={`rounded-full px-2.5 py-0.5 font-medium tabular-nums transition ${
                        maxReviews === s.value ? 'bg-brand text-brand-ink' : 'hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </span>
                reviews
              </span>
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--brand)]" />
                skip saved results
              </label>
            </div>
          )}
        </form>
      ) : null}

      {/* Kept outside the link <form>: the key panel has its own form and forms can't nest. */}
      {tab === 'link' && keyKnown && <ApifyKeyPanel userKey={userKey} serverKey={Boolean(serverKey)} onSave={onSaveKey} onRemove={onRemoveKey} />}
      {tab === 'link' && linkDisabled && (
        <p className="mt-2 pl-2 text-sm text-muted">
          Rather not sign up?{' '}
          <button type="button" onClick={() => setTab('paste')} className="font-semibold text-ink underline decoration-bad decoration-2 underline-offset-4">
            Paste the reviews yourself
          </button>{' '}
          instead. It’s free.
        </p>
      )}

      {tab === 'paste' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (content.trim()) onSubmit({ kind: 'import', content, placeName: placeName.trim() || 'Your reviews' });
          }}
          className="paper space-y-3 p-4"
        >
          <CopyGuide />
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setFileName('');
            }}
            rows={6}
            aria-label="Reviews to analyse"
            placeholder={'Paste the reviews you copied from Google Maps here…\n\n…or paste CSV / JSON (author, rating, text, date, reviewer_reviews)'}
            className="w-full resize-y rounded-xl border border-line bg-canvas/50 px-4 py-3 text-sm leading-relaxed outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="Name of the place (optional)"
              className="min-w-0 flex-1 rounded-full border border-line bg-canvas/50 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <input ref={fileRef} type="file" accept=".csv,.tsv,.json,.txt,text/csv,application/json,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
            >
              <FileUp className="h-4 w-4" />
              <span className="max-w-[11rem] truncate">{fileName || 'Upload a file'}</span>
            </button>
            <button
              type="submit"
              disabled={busy || !content.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
            >
              Check them <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-xs text-muted">
            <span>Stays on your device. Nothing gets uploaded.</span>
            <a href="/sample-reviews.csv" download className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
              <Download className="h-3.5 w-3.5" /> sample CSV
            </a>
          </p>
        </form>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-2.5">
        <span className="font-hand mr-1 text-xl text-muted">or poke at an example →</span>
        {DEMOS.map((d, i) => (
          <button
            key={d.key}
            type="button"
            disabled={busy}
            onClick={() => onSubmit({ kind: 'demo', key: d.key })}
            className={`${TILTS[i % TILTS.length]} ${TAG_COLORS[i % TAG_COLORS.length]} rounded-md px-3 py-1.5 text-left text-xs shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:rotate-0 hover:-translate-y-0.5 disabled:opacity-50`}
          >
            <span className="block font-semibold text-ink">{d.name}</span>
            <span className="block text-muted">{d.tagline}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-md border border-line border-b-2 bg-surface px-1.5 py-px font-sans text-[12px] font-semibold text-ink">{children}</kbd>
);

/** Step-by-step help for copying reviews out of Google Maps. */
function CopyGuide() {
  const [open, setOpen] = useState(true);
  const steps: React.ReactNode[] = [
    <>
      Open the place on <strong>Google Maps in a computer browser</strong>. The phone app won’t let you copy reviews.
    </>,
    <>
      Click the <strong>Reviews</strong> tab, then <strong>Sort → Newest</strong>.
    </>,
    <>Scroll down the list until enough reviews have loaded. 50 or more works best.</>,
    <>
      Click just before the first reviewer’s name and drag down to the last review, then press <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>{' '}
      <span className="text-muted">
        (<Kbd>⌘</Kbd> + <Kbd>C</Kbd> on Mac)
      </span>
      .
    </>,
    <>
      Paste below with <Kbd>Ctrl</Kbd> + <Kbd>V</Kbd> and hit <strong>Check them</strong>.
    </>,
  ];
  return (
    <div className="rounded-xl bg-warn-soft/45 px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="font-hand text-xl leading-none text-warn">how to copy reviews from any Maps link</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-warn transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <ol className="mt-3 space-y-2 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="font-display w-4 shrink-0 text-right font-semibold text-warn italic">{i + 1}.</span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-dashed border-warn/30 pt-2 text-xs leading-relaxed text-muted">
            Heads up: star ratings and exact dates don’t come along when you copy, so pasted reviews get a lighter check. For the full
            report, use a Maps link with an Apify key.
          </p>
        </>
      )}
    </div>
  );
}
