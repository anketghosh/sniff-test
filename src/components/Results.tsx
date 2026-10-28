'use client';

import { ArrowUpRight, MapPin } from 'lucide-react';
import type { AuditResult } from '@/lib/types';
import { ReviewList } from './ReviewList';
import { SEVERITY_STYLE, Stars, TrustMeter, VERDICT_META, scoreColor } from './ui';

const SOURCE_LABEL: Record<AuditResult['source'], string> = {
  apify: 'live from Google Maps',
  import: 'from your reviews',
  demo: 'example data',
};

export function Results({ result, cached, warnings }: { result: AuditResult; cached: boolean; warnings: string[] }) {
  const v = VERDICT_META[result.verdict];
  const { place } = result;
  const before = place.statedRating ?? result.sampleRating;
  const after = result.adjustedRating;
  const diff = after !== null && before !== null ? after - before : 0;

  return (
    <div className="space-y-6 animate-rise">
      {/* Title block */}
      <div>
        <p className="font-hand text-2xl text-muted">
          the report · {SOURCE_LABEL[result.source]}
          {cached ? ' · saved earlier' : ''}
        </p>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2 className="font-display text-4xl leading-tight font-semibold text-balance sm:text-5xl">{place.name}</h2>
          {place.url && (
            <a
              href={place.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 self-start rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:bg-surface md:self-auto"
            >
              Open in Google Maps <ArrowUpRight className="h-4 w-4" />
            </a>
          )}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          {place.address && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" /> {place.address}
            </span>
          )}
          <span>
            We read {result.sampleSize.toLocaleString()}
            {place.totalReviews && place.totalReviews > result.sampleSize ? ` of the newest out of ${place.totalReviews.toLocaleString()}` : ''} reviews.
          </span>
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-dashed border-info/40 bg-info-soft/60 px-5 py-3 text-sm leading-relaxed">
          <span className="font-hand mr-1 text-lg text-info">note:</span>
          {warnings.join(' ')}
        </div>
      )}

      {/* Verdict row */}
      <div className="paper grid overflow-hidden lg:grid-cols-[1.15fr_1fr_1fr]">
        <div className="relative flex flex-col items-center px-6 pt-7 pb-6 text-center">
          <TrustMeter score={result.trustScore} size={250} />
          <p className="-mt-1 font-display text-5xl font-semibold tabular-nums">
            {result.trustScore}
            <span className="text-xl font-normal text-muted">/100</span>
          </p>
          <p className={`mt-1 font-display text-2xl font-medium italic ${v.text}`}>{v.label}</p>
          <p className={`font-hand absolute top-5 right-5 rotate-6 text-2xl ${v.text}`}>{v.note}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{v.summary}</p>
        </div>

        <div className="flex flex-col justify-center border-t border-dashed border-line px-7 py-7 lg:border-t-0 lg:border-l">
          <p className="text-xs tracking-[0.14em] text-muted uppercase">The star rating</p>
          <div className="mt-3 flex items-baseline gap-3 font-display font-semibold tabular-nums">
            <span className="text-5xl">{before?.toFixed(1) ?? '–'}</span>
            <span className="text-3xl text-muted">→</span>
            <span className="text-6xl" style={{ color: Math.abs(diff) >= 0.3 ? 'var(--bad)' : 'var(--good)' }}>
              {after?.toFixed(1) ?? '–'}
            </span>
          </div>
          <div className="mt-2">
            <Stars value={after} size={18} />
          </div>
          <p className="mt-3 leading-relaxed text-muted">
            {after === null
              ? 'No star ratings in this data.'
              : Math.abs(diff) < 0.1
                ? 'Take out the suspicious reviews and the rating holds steady. A good sign.'
                : diff < 0
                  ? `Without the suspicious reviews it’s ${Math.abs(diff).toFixed(1)}★ lower. The fakes are propping it up.`
                  : `Without the suspicious reviews it’s ${diff.toFixed(1)}★ higher. Someone may be dragging it down.`}
          </p>
          <p className="font-hand mt-1 text-lg text-muted">{place.statedRating !== null ? 'Google’s number → ours' : 'average → ours'}</p>
        </div>

        <div className="flex flex-col justify-center border-t border-dashed border-line px-7 py-7 lg:border-t-0 lg:border-l">
          <p className="text-xs tracking-[0.14em] text-muted uppercase">Every review, one dot</p>
          <DotGrid result={result} />
          <p className="mt-3">
            <span className="font-display text-3xl font-semibold tabular-nums">{result.flaggedCount}</span>{' '}
            <span className="text-muted">of {result.sampleSize} look off</span>
          </p>
          <p className="mt-1 flex items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-bad" /> suspicious
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'color-mix(in oklab, var(--good) 38%, var(--surface))' }} /> seems fine
            </span>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Findings */}
        <div className="paper p-7">
          <h3 className="font-display text-2xl font-medium">
            What we <span className="italic">noticed</span>
          </h3>
          <ul className="mt-5 space-y-5">
            {result.insights.map((ins) => {
              const s = SEVERITY_STYLE[ins.severity];
              return (
                <li key={ins.title} className="flex gap-4">
                  <span className={`font-hand mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-2xl leading-none ${s.text}`} style={{ borderColor: 'currentcolor', borderRadius: '52% 48% 55% 45% / 50% 55% 45% 50%' }}>
                    {s.glyph}
                  </span>
                  <div>
                    <p className="text-[17px] font-semibold">{ins.title}</p>
                    <p className="mt-0.5 leading-relaxed text-muted">{ins.detail}</p>
                  </div>
                </li>
              );
            })}
            {result.insights.length === 0 && <li className="text-muted">Not enough data for detailed findings.</li>}
          </ul>
        </div>

        {/* Score breakdown */}
        <div className="paper p-7">
          <h3 className="font-display text-2xl font-medium">
            How we <span className="italic">scored it</span>
          </h3>
          <ul className="mt-5 space-y-5">
            {result.pillars.map((p) => (
              <li key={p.key} title={p.description}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {p.name} <span className="font-hand text-lg font-normal text-muted">counts {Math.round(p.weight * 100)}%</span>
                  </span>
                  <span className="font-display text-xl font-semibold tabular-nums" style={{ color: p.score === null ? 'var(--muted)' : scoreColor(p.score) }}>
                    {p.score === null ? '–' : Math.round(p.score)}
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
                  {p.score !== null && (
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.max(4, p.score)}%`, background: scoreColor(p.score) }} />
                  )}
                </div>
                <p className="mt-1.5 text-sm text-muted">{p.score === null ? `Skipped. ${p.note.toLowerCase()}.` : p.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="paper grid lg:grid-cols-[1fr_1.6fr]">
        <StarChart result={result} />
        <Timeline result={result} />
      </div>

      <ReviewList result={result} />

      <p className="font-hand px-1 text-center text-xl text-muted">
        remember: these are clues, not convictions. A flagged review can be real, and a clean score isn’t a guarantee.
      </p>
    </div>
  );
}

function DotGrid({ result }: { result: AuditResult }) {
  // Flagged first so the red cluster reads at a glance.
  const dots = [...result.reviews].sort((a, b) => Number(b.flagged) - Number(a.flagged));
  const size = dots.length > 200 ? 7 : dots.length > 100 ? 9 : 12;
  return (
    <div className="mt-4 flex flex-wrap gap-[3px]" role="img" aria-label={`${result.flaggedCount} of ${result.sampleSize} reviews flagged`}>
      {dots.map((r, i) => (
        <span
          key={r.id}
          className="rounded-full transition-opacity"
          style={{
            width: size,
            height: size,
            // colour-mix rather than opacity: the entrance animation ends at opacity 1
            background: r.flagged ? 'var(--bad)' : 'color-mix(in oklab, var(--good) 38%, var(--surface))',
            animation: `rise .4s ${Math.min(i * 6, 900)}ms both`,
          }}
          title={`${r.author}${r.flagged ? ': suspicious' : ''}`}
        />
      ))}
    </div>
  );
}

function StarChart({ result }: { result: AuditResult }) {
  const total = Object.values(result.starCounts).reduce((s, c) => s + c, 0);
  return (
    <div className="p-7">
      <h3 className="font-display text-xl font-medium">Star spread</h3>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted">No star ratings in this data.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {([5, 4, 3, 2, 1] as const).map((s) => {
            const share = result.starCounts[s] / total;
            return (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className="w-7 font-medium tabular-nums">{s}★</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-star transition-all duration-1000" style={{ width: `${share * 100}%` }} />
                </div>
                <span className="w-10 text-right text-muted tabular-nums">{Math.round(share * 100)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Timeline({ result }: { result: AuditResult }) {
  const tl = result.timeline;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const peak = tl?.buckets.filter((b) => b.burst).sort((a, b) => b.count - a.count)[0];
  return (
    <div className="border-t border-dashed border-line p-7 lg:border-t-0 lg:border-l">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl font-medium">When reviews arrived</h3>
        {tl && <span className="font-hand text-lg text-muted">per {tl.unit}</span>}
      </div>
      {!tl || tl.buckets.length < 2 ? (
        <p className="mt-3 text-sm text-muted">Exact review dates aren’t available for this data.</p>
      ) : (
        <>
          <div className="relative mt-5 flex h-32 items-end gap-px" role="img" aria-label="Number of reviews over time">
            {(() => {
              const max = Math.max(...tl.buckets.map((b) => b.count), 1);
              return tl.buckets.map((b) => (
                <div
                  key={b.start}
                  title={`${fmt(b.start)}: ${b.count} review${b.count === 1 ? '' : 's'}${b.burst ? ' (surge)' : ''}`}
                  className="relative min-w-px flex-1 rounded-t-[2px]"
                  style={{
                    height: `${b.count ? Math.max(4, (b.count / max) * 100) : 0}%`,
                    background: b.burst ? 'var(--bad)' : 'var(--brand)',
                    opacity: b.burst ? 1 : 0.45,
                  }}
                >
                  {b === peak && (
                    <span className="font-hand pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 -rotate-3 text-lg whitespace-nowrap text-bad">
                      whoa, {b.count}!
                    </span>
                  )}
                </div>
              ));
            })()}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{fmt(tl.buckets[0].start)}</span>
            <span>{fmt(tl.buckets[tl.buckets.length - 1].start)}</span>
          </div>
        </>
      )}
    </div>
  );
}
