'use client';

import { useMemo, useState } from 'react';
import { BadgeCheck, MessageSquareReply, Search } from 'lucide-react';
import { FLAG_LABELS } from '@/lib/analysis';
import type { AnalyzedReview, AuditResult, FlagKey } from '@/lib/types';
import { Stars } from './ui';

type Filter = 'suspicious' | 'all' | 'clean' | FlagKey;

const PAGE = 12;

function formatDate(r: AnalyzedReview) {
  if (r.date && r.datePrecision === 'exact')
    return new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return r.relativeDate ?? '';
}

export function ReviewList({ result }: { result: AuditResult }) {
  const [filter, setFilter] = useState<Filter>(result.flaggedCount ? 'suspicious' : 'all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'suspicious', label: 'Suspicious', count: result.flaggedCount },
    { key: 'all', label: 'Everything', count: result.sampleSize },
    { key: 'clean', label: 'Seem fine', count: result.sampleSize - result.flaggedCount },
    ...(Object.keys(FLAG_LABELS) as FlagKey[])
      .filter((k) => result.flagCounts[k] > 0)
      .map((k) => ({ key: k as Filter, label: FLAG_LABELS[k], count: result.flagCounts[k] })),
  ];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return result.reviews.filter((r) => {
      const byFilter =
        filter === 'all' ? true : filter === 'suspicious' ? r.flagged : filter === 'clean' ? !r.flagged : r.flags.some((f) => f.key === filter);
      return byFilter && (!q || r.author.toLowerCase().includes(q) || r.text.toLowerCase().includes(q));
    });
  }, [result.reviews, filter, query]);

  return (
    <section>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h3 className="font-display text-3xl font-medium">
          The reviews, <span className="italic">annotated</span>
        </h3>
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search names or words"
            className="w-full rounded-full border border-line bg-surface py-2.5 pr-4 pl-10 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </div>
      </div>

      <div className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setLimit(PAGE);
            }}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              filter === f.key ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface/60 text-muted hover:border-ink/40 hover:text-ink'
            }`}
          >
            {f.label} <span className="tabular-nums opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="font-hand mt-8 text-center text-2xl text-muted">nothing here. try another filter.</p>
      ) : (
        <ul className="mt-5 grid gap-4 lg:grid-cols-2">
          {visible.slice(0, limit).map((r, i) => (
            <ReviewCard key={r.id} review={r} tilt={i % 3 === 1} />
          ))}
        </ul>
      )}
      {visible.length > limit && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setLimit((l) => l + PAGE * 2)}
            className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold transition hover:-translate-y-px hover:border-ink/40"
          >
            Show more <span className="text-muted">({visible.length - limit} left)</span>
          </button>
        </div>
      )}
    </section>
  );
}

function ReviewCard({ review: r, tilt }: { review: AnalyzedReview; tilt: boolean }) {
  const [open, setOpen] = useState(false);
  const long = r.text.length > 240;
  const stamp = r.suspicion >= 0.7 ? { text: 'very sus', cls: 'text-bad border-bad' } : r.flagged ? { text: 'sus', cls: 'text-warn border-warn' } : null;

  return (
    <li className={`paper relative p-5 transition hover:rotate-0 ${tilt ? 'lg:rotate-[0.4deg]' : ''} ${r.flagged ? '' : 'opacity-95'}`}>
      {stamp && (
        <span className={`font-hand absolute top-4 right-4 -rotate-12 rounded-md border-2 px-2 text-xl leading-tight ${stamp.cls}`}>{stamp.text}</span>
      )}
      <div className="flex items-center gap-3 pr-20">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold uppercase"
          style={{ background: r.flagged ? 'var(--bad-soft)' : 'var(--good-soft)', color: r.flagged ? 'var(--bad)' : 'var(--good)' }}
        >
          {r.author.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-semibold">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="truncate underline-offset-4 hover:underline">
                {r.author}
              </a>
            ) : (
              <span className="truncate">{r.author}</span>
            )}
            {r.isLocalGuide && <BadgeCheck className="h-4 w-4 shrink-0 text-info" aria-label="Local Guide" />}
          </p>
          <p className="text-xs text-muted">
            {r.authorReviewCount !== null ? `${r.authorReviewCount.toLocaleString()} review${r.authorReviewCount === 1 ? '' : 's'} written` : 'history unknown'}
            {r.isLocalGuide ? ' · Local Guide' : ''}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <Stars value={r.rating} size={14} />
        <span>{formatDate(r)}</span>
        {r.hasOwnerResponse && (
          <span className="inline-flex items-center gap-1">
            <MessageSquareReply className="h-3.5 w-3.5" /> owner replied
          </span>
        )}
      </div>

      {r.text ? (
        <p className="mt-3 font-display text-[17px] leading-relaxed" style={{ fontVariationSettings: '"SOFT" 100, "opsz" 14' }}>
          “{long && !open ? `${r.text.slice(0, 240).trimEnd()}…` : r.text}”
          {long && (
            <button onClick={() => setOpen((o) => !o)} className="ml-2 font-sans text-sm font-semibold text-brand underline-offset-4 hover:underline">
              {open ? 'less' : 'more'}
            </button>
          )}
        </p>
      ) : (
        <p className="font-hand mt-3 text-xl text-muted">(just stars, no words)</p>
      )}

      {r.flags.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-dashed border-line pt-3">
          {r.flags.map((f) => (
            <li key={f.key} className="text-sm leading-snug">
              <span className="mark font-semibold" style={{ ['--mark' as string]: r.flagged ? 'var(--warn-soft)' : 'var(--surface-2)' }}>
                {f.label}
              </span>{' '}
              <span className="text-muted">{f.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
