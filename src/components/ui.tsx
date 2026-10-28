import { Star } from 'lucide-react';
import type { Severity, Verdict } from '@/lib/types';

export const VERDICT_META: Record<Verdict, { label: string; note: string; summary: string; text: string; bg: string; color: string }> = {
  trustworthy: {
    label: 'Mostly genuine reviews',
    note: 'feels genuine ✓',
    summary: 'The reviews read like real people with real experiences. No strong signs of manipulation.',
    text: 'text-good',
    bg: 'bg-good-soft',
    color: 'var(--good)',
  },
  mixed: {
    label: 'Read with care',
    note: 'hmm, iffy…',
    summary: 'Mostly genuine, but a chunk of reviews look off. Read the recent ones with care.',
    text: 'text-warn',
    bg: 'bg-warn-soft',
    color: 'var(--warn)',
  },
  risky: {
    label: 'High risk of fake reviews',
    note: 'something’s fishy!',
    summary: 'Strong signs of fake or coordinated reviews. Don’t trust the star rating on its own.',
    text: 'text-bad',
    bg: 'bg-bad-soft',
    color: 'var(--bad)',
  },
};

export const SEVERITY_STYLE: Record<Severity, { text: string; bg: string; mark: string; glyph: string }> = {
  bad: { text: 'text-bad', bg: 'bg-bad-soft', mark: 'var(--bad-soft)', glyph: '✗' },
  warn: { text: 'text-warn', bg: 'bg-warn-soft', mark: 'var(--warn-soft)', glyph: '!' },
  info: { text: 'text-info', bg: 'bg-info-soft', mark: 'var(--info-soft)', glyph: 'i' },
  good: { text: 'text-good', bg: 'bg-good-soft', mark: 'var(--good-soft)', glyph: '✓' },
};

export function scoreColor(score: number) {
  return score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--warn)' : 'var(--bad)';
}

export function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  if (value === null) return <span className="text-xs text-muted">no stars</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-line" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="text-star" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Hand-drawn underline that "draws itself" in. */
export function Squiggle({ className = '', color = 'var(--bad)' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" className={className} aria-hidden>
      <path
        className="animate-draw"
        d="M4 15 C 40 6, 70 20, 108 12 S 170 5, 205 13 S 262 19, 296 9"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        className="animate-draw"
        style={{ animationDelay: '0.7s' }}
        d="M30 20 C 90 14, 160 22, 250 15"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

/** Speedometer-style gauge: fishy → iffy → legit, with a needle. */
export function TrustMeter({ score, size = 240 }: { score: number; size?: number }) {
  const w = 240;
  const h = 142;
  const cx = 120;
  const cy = 122;
  const r = 96;
  const pt = (pctOf100: number, radius = r) => {
    const a = Math.PI * (1 - pctOf100 / 100);
    // Rounded so server and browser render identical path strings (avoids hydration mismatch).
    return [+(cx + radius * Math.cos(a)).toFixed(2), +(cy - radius * Math.sin(a)).toFixed(2)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const angle = -90 + (score / 100) * 180;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} role="img" aria-label={`Trust score ${score} out of 100`}>
      <path d={arc(0, 100)} fill="none" stroke="var(--surface-2)" strokeWidth="22" strokeLinecap="round" />
      <path d={arc(1.5, 58.5)} fill="none" stroke="var(--bad)" strokeWidth="14" strokeLinecap="round" opacity="0.85" />
      <path d={arc(61.5, 78.5)} fill="none" stroke="var(--warn)" strokeWidth="14" strokeLinecap="round" opacity="0.85" />
      <path d={arc(81.5, 98.5)} fill="none" stroke="var(--good)" strokeWidth="14" strokeLinecap="round" opacity="0.85" />
      {[0, 20, 40, 60, 80, 100].map((t) => {
        const [x1, y1] = pt(t, r - 16);
        const [x2, y2] = pt(t, r - 22);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />;
      })}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 1.2s cubic-bezier(.3,1.4,.5,1)' }}>
        <path d={`M ${cx - 4} ${cy} L ${cx} ${cy - r + 26} L ${cx + 4} ${cy} Z`} fill="var(--ink)" />
      </g>
      <circle cx={cx} cy={cy} r="9" fill="var(--ink)" />
      <circle cx={cx} cy={cy} r="3.5" fill="var(--surface)" />
      <text x="22" y="140" fontSize="11" fill="var(--muted)" fontFamily="var(--font-hand)" style={{ fontSize: 15 }}>
        fishy
      </text>
      <text x="203" y="140" fontSize="11" fill="var(--muted)" fontFamily="var(--font-hand)" style={{ fontSize: 15 }}>
        legit
      </text>
    </svg>
  );
}
