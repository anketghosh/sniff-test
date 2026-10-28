'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { analyzeReviews } from '@/lib/analysis';
import { DEMOS, type DemoKey, buildDemo } from '@/lib/demo';
import { importReviews } from '@/lib/importers';
import type { AuditEvent, AuditResult } from '@/lib/types';
import { useApifyKey } from './ApifyKey';
import { Results } from './Results';
import { SearchPanel, type SearchRequest } from './SearchPanel';
import { Squiggle, TrustMeter } from './ui';

type Stage = 'resolving' | 'starting' | 'scraping' | 'analyzing';

type State =
  | { status: 'idle' }
  | { status: 'loading'; stage: Stage; message: string; startedAt: number }
  | { status: 'error'; message: string }
  | { status: 'done'; result: AuditResult; cached: boolean; warnings: string[] };

export function SniffTestApp() {
  const [apifyReady, setApifyReady] = useState<boolean | null>(null);
  const apifyKey = useApifyKey();
  const [state, setState] = useState<State>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const jumpToResults = useRef(false); // true when opened via ?demo=, so we jump rather than glide

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c: { apify: boolean }) => setApifyReady(c.apify))
      .catch(() => setApifyReady(false));
  }, []);

  // ?demo=botfarm opens an example report directly (handy for sharing and for README screenshots).
  // Waits for /api/config so the key panel above has rendered and doesn't push the report down after we jump.
  const demoOpened = useRef(false);
  useEffect(() => {
    if (apifyReady === null || demoOpened.current) return;
    const key = new URLSearchParams(window.location.search).get('demo') as DemoKey | null;
    if (!key || !DEMOS.some((d) => d.key === key)) return;
    const t = setTimeout(() => {
      demoOpened.current = true; // set here (not above) so React's dev double-run of effects can't cancel it
      jumpToResults.current = true;
      const { place, reviews } = buildDemo(key);
      setState({ status: 'done', result: analyzeReviews(reviews, place, 'demo'), cached: false, warnings: [] });
    }, 50);
    return () => clearTimeout(t);
  }, [apifyReady]);

  useEffect(() => {
    if (state.status === 'idle') return;
    resultsRef.current?.scrollIntoView({ behavior: jumpToResults.current ? 'instant' : 'smooth', block: 'start' });
    jumpToResults.current = false;
  }, [state.status]);

  const runLocal = (build: () => { result: AuditResult; warnings: string[] }) => {
    setState({ status: 'loading', stage: 'analyzing', message: 'Reading every review…', startedAt: Date.now() });
    // Let the progress state paint before the (synchronous) analysis runs.
    setTimeout(() => {
      try {
        const { result, warnings } = build();
        if (result.sampleSize === 0) throw new Error('No reviews were found in that content. Check the format or try the sample CSV.');
        setState({ status: 'done', result, cached: false, warnings });
      } catch (err) {
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not read those reviews.' });
      }
    }, 450);
  };

  const runLink = async (url: string, maxReviews: number, refresh: boolean) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'loading', stage: 'resolving', message: 'Checking the link…', startedAt: Date.now() });
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxReviews, refresh, token: apifyKey.key ?? undefined }),
        signal: ctrl.signal,
      });
      if (!res.body) throw new Error('No response from the server.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as AuditEvent;
          if (ev.type === 'progress') {
            setState((s) => (s.status === 'loading' ? { ...s, stage: ev.stage, message: ev.message } : s));
          } else if (ev.type === 'result') {
            setState({ status: 'done', result: ev.result, cached: ev.cached, warnings: [] });
            finished = true;
          } else {
            setState({ status: 'error', message: ev.message });
            finished = true;
          }
        }
      }
      if (!finished) setState({ status: 'error', message: 'The connection closed before the analysis finished. Please try again.' });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Network error. Please try again.' });
    }
  };

  const onSubmit = (req: SearchRequest) => {
    if (req.kind === 'link') return void runLink(req.url, req.maxReviews, req.refresh);
    if (req.kind === 'demo') {
      return runLocal(() => {
        const { place, reviews } = buildDemo(req.key);
        return { result: analyzeReviews(reviews, place, 'demo'), warnings: [] };
      });
    }
    runLocal(() => {
      const imp = importReviews(req.content, req.placeName);
      if (imp.format !== 'apify') imp.place.name = req.placeName;
      return { result: analyzeReviews(imp.reviews, imp.place, 'import'), warnings: imp.warnings };
    });
  };

  const cancel = () => {
    abortRef.current?.abort();
    setState({ status: 'idle' });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <button onClick={() => setState({ status: 'idle' })} className="flex items-center gap-2.5" aria-label="Sniff Test home">
          <Logo />
          <Wordmark className="text-2xl" />
        </button>
        <span className="font-hand hidden -rotate-2 text-xl text-muted sm:block">smells fishy? we’ll check ★</span>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-12 pb-20 sm:px-8 lg:pt-16">
        <section className="grid items-start gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <div className="animate-rise">
            <p className="font-hand mb-3 text-2xl text-bad">psst… not every 5★ is real</p>
            <h1 className="font-display text-[2.75rem] leading-[1.02] font-medium sm:text-6xl lg:text-[4.4rem]">
              Do the reviews
              <br />
              pass the{' '}
              <span className="relative inline-block italic">
                sniff test
                <Squiggle className="absolute -bottom-3 left-0 h-4 w-full sm:-bottom-4 sm:h-5" />
              </span>
              ?
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted">
              Paste a Google Maps link before you book. We read the latest reviews, sniff out the copy-pasted ones, the throwaway
              accounts and the suspicious surges, then show you the rating without them.
            </p>
            <div className="mt-8 max-w-xl">
              <SearchPanel
                serverKey={apifyReady}
                userKey={apifyKey.key}
                keyLoaded={apifyKey.loaded}
                onSaveKey={apifyKey.save}
                onRemoveKey={apifyKey.remove}
                busy={state.status === 'loading'}
                onSubmit={onSubmit}
              />
            </div>
          </div>

          <ExampleCard onOpen={() => onSubmit({ kind: 'demo', key: 'botfarm' })} />
        </section>

        <div ref={resultsRef} className="scroll-mt-6 pt-16">
          {state.status === 'loading' && <ProgressCard stage={state.stage} message={state.message} startedAt={state.startedAt} onCancel={cancel} />}
          {state.status === 'error' && (
            <div className="paper mx-auto max-w-2xl -rotate-[0.4deg] p-6 animate-rise">
              <p className="font-hand text-3xl text-bad">oops.</p>
              <p className="mt-1 font-display text-xl font-medium">We couldn’t finish that check</p>
              <p className="mt-2 leading-relaxed text-muted">{state.message}</p>
            </div>
          )}
          {state.status === 'done' && <Results result={state.result} cached={state.cached} warnings={state.warnings} />}
          {state.status === 'idle' && <HowItWorks />}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-10 sm:px-8">
        <div className="rule-dashed" />
        <div className="mt-5 flex flex-col justify-between gap-2 text-sm text-muted sm:flex-row">
          <span>
            <Wordmark /> · honest hints, not hard proof.
          </span>
          <span className="font-hand text-lg">made for people who read reviews twice</span>
        </div>
      </footer>
    </div>
  );
}

/** A star being sniffed: three little scent lines drifting toward it. */
function Logo() {
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9" aria-hidden>
      <circle cx="18" cy="18" r="16" fill="var(--brand)" />
      <path
        d="M22 9.5 l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.6 5.2-.7z"
        fill="var(--brand-ink)"
        strokeLinejoin="round"
        stroke="var(--brand-ink)"
        strokeWidth="1"
      />
      <g fill="none" stroke="var(--bad)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M6.5 13.5 q2.2 -1.4 4.4 0" />
        <path d="M5.5 18.2 q2.6 -1.6 5.2 0" />
        <path d="M6.5 22.9 q2.2 -1.4 4.4 0" />
      </g>
    </svg>
  );
}

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-semibold text-ink ${className}`}>
      sniff<span className="text-bad italic">test</span>
    </span>
  );
}

/** Tilted "polaroid" showing what a result looks like; clicking runs that demo. */
function ExampleCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group relative mx-auto block w-full max-w-sm rotate-2 text-left transition duration-300 hover:rotate-0 animate-rise lg:sticky lg:top-10 lg:mt-24" style={{ animationDelay: '0.15s' }}>
      <span className="absolute -top-3 left-1/2 z-10 h-6 w-24 -translate-x-1/2 -rotate-3 rounded-sm bg-warn-soft/90 shadow-sm" aria-hidden />
      <div className="paper p-6 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.14em] text-muted uppercase">Example check</p>
            <p className="mt-1 font-display text-2xl font-semibold">Sunny Side Café</p>
          </div>
          <span className="font-hand -rotate-6 rounded-full border-2 border-bad px-3 py-0.5 text-lg text-bad">fishy</span>
        </div>
        <div className="mt-3 flex justify-center">
          <TrustMeter score={46} size={220} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-surface-2/70 p-3">
            <p className="font-display text-2xl font-semibold tabular-nums">
              4.3 <span className="text-muted">→</span> <span className="text-bad">3.9</span>
            </p>
            <p className="text-xs text-muted">after removing fakes</p>
          </div>
          <div className="rounded-xl bg-surface-2/70 p-3">
            <p className="font-display text-2xl font-semibold tabular-nums">21</p>
            <p className="text-xs text-muted">reviews in one day</p>
          </div>
        </div>
        <p className="font-hand mt-4 text-center text-xl text-muted transition group-hover:text-ink">tap to see the full report ↗</p>
      </div>
    </button>
  );
}

const STAGE_COPY: Record<Stage, string> = {
  resolving: 'Finding the place',
  starting: 'Waking up the collector',
  scraping: 'Gathering reviews',
  analyzing: 'Reading between the lines',
};

function ProgressCard({ stage, message, startedAt, onCancel }: { stage: Stage; message: string; startedAt: number; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const order: Stage[] = ['resolving', 'starting', 'scraping', 'analyzing'];
  const current = order.indexOf(stage);

  return (
    <div className="paper mx-auto max-w-2xl p-7 animate-rise">
      <div className="flex items-center gap-4">
        <span className="animate-wobble flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn">
          <Search className="h-6 w-6" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-medium">{STAGE_COPY[stage]}…</p>
          <p className="truncate text-sm text-muted">{message}</p>
        </div>
        <span className="font-hand text-2xl text-muted tabular-nums">{elapsed}s</span>
      </div>
      <div className="mt-6 flex items-center gap-2">
        {order.map((s, i) => (
          <span key={s} className={`h-2 flex-1 rounded-full transition-colors duration-500 ${i < current ? 'bg-brand' : i === current ? 'bg-warn animate-pulse' : 'bg-surface-2'}`} />
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">{stage === 'starting' || stage === 'scraping' ? 'This usually takes 30–90 seconds. Grab a sip of tea.' : ' '}</p>
        <button onClick={onCancel} className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

function HowItWorks() {
  const items = [
    { title: 'Copy-paste praise', body: 'Reviews that say the same thing in nearly the same words. Real people don’t write in chorus.', note: 'déjà vu?' },
    { title: 'One-hit accounts', body: 'Profiles that have only ever written a single review, usually made just for the occasion.', note: 'who are you?' },
    { title: 'Sudden surges', body: 'Twenty reviews in one afternoon after weeks of quiet. Usually a campaign, sometimes an attack.', note: 'all at once?!' },
    { title: 'Too-perfect ratings', body: 'All 5★ or a strange split of 5★ and 1★ with nothing in between. Real opinions are messier.', note: 'suspiciously neat' },
  ];
  return (
    <section className="animate-rise">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl font-medium sm:text-4xl">
          What we <span className="italic">look for</span>
        </h2>
        <span className="font-hand hidden text-xl text-muted sm:block">(the usual tricks)</span>
      </div>
      <div className="rule-dashed mt-5" />
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <li key={it.title} className={`relative py-7 sm:px-6 ${i % 2 === 0 ? 'sm:pl-0' : ''} ${i > 0 ? 'lg:border-l lg:border-dashed lg:border-line' : 'lg:pl-0'}`}>
            <span className="font-display text-5xl text-bad italic">{String(i + 1).padStart(2, '0')}</span>
            <p className="mt-3 font-display text-xl font-semibold">{it.title}</p>
            <p className="mt-2 leading-relaxed text-muted">{it.body}</p>
            <p className="font-hand mt-3 -rotate-2 text-xl text-warn">{it.note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
