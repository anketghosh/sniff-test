// Demo scenarios: synthetic reviews (seeded, so results are stable) that are run through the real analysis engine.

import type { PlaceInfo, Review } from './types';

export type DemoKey = 'botfarm' | 'bomb' | 'polarised' | 'organic';

export const DEMOS: { key: DemoKey; name: string; tagline: string }[] = [
  { key: 'botfarm', name: 'Sunny Side Café', tagline: 'Paid 5★ reviews' },
  { key: 'bomb', name: 'Downtown Auto Repair', tagline: '1★ review attack' },
  { key: 'polarised', name: 'Harbor View Hotel', tagline: 'Polarised ratings' },
  { key: 'organic', name: "Luca's Wood-fired Pizza", tagline: 'Genuine reviews' },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T,>(r: Rand, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const spin = (r: Rand, template: string) => template.replace(/\{([^}]+)\}/g, (_, opts: string) => pick(r, opts.split('|')));

const FIRST = ['Priya', 'James', 'Sofia', 'Daniel', 'Aisha', 'Marco', 'Emily', 'Kenji', 'Olivia', 'Rahul', 'Grace', 'Lucas', 'Fatima', 'Noah', 'Mei', 'Arjun', 'Hannah', 'Diego', 'Chloe', 'Omar', 'Zara', 'Ethan', 'Leila', 'Tom', 'Ana', 'Ben', 'Ivy', 'Sam', 'Nina', 'Raj'];
const LAST = ['Sharma', 'Miller', 'Rossi', 'Kim', 'Khan', 'Garcia', 'Chen', 'Patel', 'Brown', 'Novak', 'Silva', 'Ito', 'Dubois', 'Walsh', 'Mehta', 'Lopez', 'Berg', 'Okafor'];
const BOT_NAMES = ['alex', 'sarah', 'mike', 'jenny', 'chris', 'kate', 'john', 'lisa', 'dave', 'amy'];

function humanName(r: Rand) {
  return r() < 0.3 ? `${pick(r, FIRST)} ${pick(r, LAST)[0]}.` : `${pick(r, FIRST)} ${pick(r, LAST)}`;
}
function botName(r: Rand) {
  return `${pick(r, BOT_NAMES)}${pick(r, ['_', '.', ''])}${pick(r, ['reviews', 'k', 'x', 'pro', 'official', ''])}${int(r, 10, 999)}`;
}
function realisticCount(r: Rand) {
  const x = r();
  if (x < 0.1) return 1;
  if (x < 0.22) return int(r, 2, 4);
  if (x < 0.6) return int(r, 5, 40);
  return int(r, 41, 600);
}

// Organic text: random combination of opening + specifics + closing gives natural variety.
const ORGANIC: Record<'cafe' | 'garage' | 'hotel' | 'pizza', { pos: string[]; neg: string[]; mid: string[]; details: string[] }> = {
  cafe: {
    pos: ['Lovely little spot for brunch.', 'Came here on a Sunday with friends.', 'My go-to for a flat white before work.', 'Stopped by after a walk along the river.', 'Finally tried this place after walking past for months.'],
    neg: ['Waited almost 25 minutes for two coffees.', 'The eggs arrived cold and the toast was burnt.', 'Overpriced for what you get.', 'Staff seemed overwhelmed and forgot our order.'],
    mid: ['Decent coffee, nothing special.', 'Food was fine but the music was too loud.', 'Nice terrace, average pastries.'],
    details: ['The banana bread is excellent, slightly warm with salted butter.', 'Oat milk costs extra which is a bit annoying.', 'They roast their own beans, you can taste it in the espresso.', 'Seating is tight inside, so try to grab a table outside.', 'The shakshuka had a proper kick to it.', 'Wifi was patchy so not ideal for laptop work.', 'Our server Maya was really patient with my picky kid.', 'Gets busy after 10am on weekends.', 'The avocado toast portion was smaller than I expected.', 'Dog friendly, they even brought a water bowl.'],
  },
  garage: {
    pos: ['Took my 2016 Corolla in for brakes.', 'Honest mechanics, which is rare.', 'They squeezed me in the same day after my battery died.', 'Been coming here for three years now.'],
    neg: ['Quoted one price and charged me nearly double.', 'Car came back with a new rattle in the dashboard.', 'Had to call three times to get an update.'],
    mid: ['Work was okay but it took two days longer than promised.', 'Fair price, but the waiting room is grim.'],
    details: ['Tony showed me the worn pads before replacing anything.', 'They told me the timing belt could wait another 10k miles instead of upselling me.', 'Oil change plus tyre rotation was done in under an hour.', 'They sent photos of the corroded battery terminals by text.', 'Parking is tricky, the lot only fits a few cars.', 'The invoice was itemised clearly with parts and labour.', 'They fixed a check-engine light the dealer could not figure out.', 'Loaner car was not available so I had to take a bus.'],
  },
  hotel: {
    pos: ['Stayed four nights for a conference.', 'Great location right by the ferry terminal.', 'Weekend getaway with my partner.'],
    neg: ['Room smelled of smoke even though it was non-smoking.', 'The air conditioning rattled all night.', 'Check-in took 40 minutes.'],
    mid: ['Clean enough but very dated.', 'Fine for one night, would not stay longer.'],
    details: ['Ask for a harbour-facing room on a high floor.', 'Breakfast buffet had good pastries but the coffee was weak.', 'The pool closes at 8pm which is early.', 'Front desk let us check out late at no charge.', 'Walls are thin, we could hear the neighbours.', 'Parking costs 30 a night.', 'The bed was very comfortable and the shower pressure was strong.'],
  },
  pizza: {
    pos: ['Best Neapolitan style pizza in the neighbourhood.', 'Came for my birthday dinner.', 'Ordered takeaway on a Friday night.', 'Luca himself came out to check on our table.'],
    neg: ['Base was soggy in the middle this time.', 'Delivery took over an hour and arrived lukewarm.'],
    mid: ['Good pizza, slow service.', 'Tasty but small for the price.'],
    details: ['The crust has that leopard char from the wood oven.', 'Try the nduja and honey, sounds odd but it works.', 'Tiramisu is made in house and not too sweet.', 'They do a gluten-free base that is actually decent.', 'Booking is a must on weekends.', 'House red by the carafe is good value.', 'The margherita uses proper fior di latte.', 'A bit loud when it is full.'],
  },
};

// Personal context sentences add the variety real reviews have, so organic reviews don't look like copies.
const CONTEXT = [
  '{We|I} {came|went|stopped by} {on a {Monday|Tuesday|Thursday|Saturday} {morning|afternoon|evening}|last {week|month|weekend}|for {my|our} {anniversary|lunch break|day off}|after {a long drive|work|the match|visiting family}}.',
  '{Parked|Got a spot} {nearby|around the corner|on {Elm|Mill|Park|Station} Street} {without much trouble|after circling twice|easily}.',
  '{My|Our} {partner|brother|daughter|colleague|mum|friend from {Leeds|Pune|Boston|Lyon}} {thought|said} it was {spot on|a bit hit and miss|better than last time|worth the trip}.',
  '{Paid|Spent} about {18|25|32|40|55|70|90} {in total|for two|with tip}, {which felt fair|a little steep|reasonable for the area}.',
  '{Will|Might|Would} {come back|return|try it again} {to try something else|next time I am in town|once it is less busy|in the summer}.',
  'Small {gripe|note}: {the {door|bathroom|menu board} {could use|needs} {a refresh|some attention}|{it|the place} was {chilly|warm|a little cramped} {inside|near the window}}.',
];

function organicText(r: Rand, kind: keyof typeof ORGANIC, rating: number) {
  const pool = ORGANIC[kind];
  if (r() < 0.12) return ''; // rating-only reviews are common on Google
  const opener = rating >= 4 ? pick(r, pool.pos) : rating <= 2 ? pick(r, pool.neg) : pick(r, pool.mid);
  const parts = [opener];
  const used = new Set<string>();
  for (let k = int(r, 0, 1); k > 0; k--) {
    const d = pick(r, pool.details);
    if (!used.has(d)) {
      parts.push(d);
      used.add(d);
    }
  }
  for (let k = int(r, 1, 3); k > 0; k--) {
    const t = pick(r, CONTEXT);
    if (!used.has(t)) {
      parts.push(spin(r, spin(r, t)));
      used.add(t);
    }
  }
  return parts.join(' ');
}

const BOT_5_TEMPLATES = [
  'Best {service|experience|place} ever! Highly recommended, truly {amazing|great|fantastic} staff and {experience|atmosphere}.',
  '{Outstanding|Excellent|Amazing} experience, {fast|quick} service and very professional team. Five stars all the way!',
  'Top tier! Always delivers beyond expectations every single time.',
  '{Great|Amazing} place, {great|friendly} staff, {highly|totally} recommend!',
];
const BOMB_TEMPLATES = [
  'Terrible place! {Scammers|Crooks} and completely unprofessional. Do not go here!',
  'Worst customer service in history. Total rip-off, avoid at all costs!',
  '{Avoid|Stay away}! {Rude|Awful} staff and {terrible|horrible} service.',
  'Never again. {Scam|Rip off}, {awful|horrible} experience.',
];

function organicRating(r: Rand, profile: 'good' | 'great' | 'mixed') {
  const x = r();
  if (profile === 'great') return x < 0.62 ? 5 : x < 0.86 ? 4 : x < 0.94 ? 3 : x < 0.97 ? 2 : 1;
  if (profile === 'good') return x < 0.45 ? 5 : x < 0.75 ? 4 : x < 0.87 ? 3 : x < 0.94 ? 2 : 1;
  return x < 0.3 ? 5 : x < 0.55 ? 4 : x < 0.72 ? 3 : x < 0.85 ? 2 : 1;
}

export function buildDemo(key: DemoKey, at = Date.now()): { place: PlaceInfo; reviews: Review[] } {
  const r = rng({ botfarm: 11, bomb: 22, polarised: 33, organic: 44 }[key]);
  const DAY = 86_400_000;
  // Anchor to the start of the UTC day so the day buckets (and therefore the scores) are identical on every run.
  const now = Math.floor(at / DAY) * DAY;
  const reviews: Review[] = [];
  const add = (rv: Omit<Review, 'id' | 'datePrecision'>) => reviews.push({ ...rv, id: `${key}-${reviews.length}`, datePrecision: 'exact' });
  const spreadDate = (days: number) => new Date(now - r() * days * DAY - int(r, 0, 86_399) * 1000).toISOString();
  const organic = (count: number, kind: keyof typeof ORGANIC, profile: 'good' | 'great' | 'mixed', days: number) => {
    for (let k = 0; k < count; k++) {
      const rating = organicRating(r, profile);
      const cnt = realisticCount(r);
      add({ author: humanName(r), rating, text: organicText(r, kind, rating), date: spreadDate(days), authorReviewCount: cnt, isLocalGuide: cnt > 20 && r() < 0.6 });
    }
  };

  let name = '';
  if (key === 'botfarm') {
    name = 'Sunny Side Café';
    organic(85, 'cafe', 'good', 150);
    const burstDay = now - 23 * DAY;
    for (let k = 0; k < 38; k++) {
      add({ author: botName(r), rating: 5, text: spin(r, pick(r, BOT_5_TEMPLATES)), date: new Date(burstDay + r() * DAY * 1.6).toISOString(), authorReviewCount: r() < 0.85 ? 1 : 2 });
    }
  } else if (key === 'bomb') {
    name = 'Downtown Auto Repair';
    organic(90, 'garage', 'great', 160);
    const burstDay = now - 9 * DAY;
    for (let k = 0; k < 34; k++) {
      add({ author: botName(r), rating: 1, text: r() < 0.25 ? '' : spin(r, pick(r, BOMB_TEMPLATES)), date: new Date(burstDay + r() * DAY * 0.9).toISOString(), authorReviewCount: r() < 0.8 ? 1 : int(r, 2, 3) });
    }
  } else if (key === 'polarised') {
    name = 'Harbor View Hotel';
    for (let k = 0; k < 110; k++) {
      const x = r();
      const rating = x < 0.55 ? 5 : x < 0.9 ? 1 : int(r, 2, 4);
      const throwaway = r() < (rating === 5 ? 0.45 : 0.3);
      add({
        author: throwaway && r() < 0.5 ? botName(r) : humanName(r),
        rating,
        text: throwaway && r() < 0.6 ? spin(r, pick(r, rating === 5 ? BOT_5_TEMPLATES : BOMB_TEMPLATES)) : organicText(r, 'hotel', rating),
        date: spreadDate(170),
        authorReviewCount: throwaway ? 1 : realisticCount(r),
      });
    }
  } else {
    name = "Luca's Wood-fired Pizza";
    organic(130, 'pizza', 'good', 170);
  }

  reviews.sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!));
  const avg = reviews.reduce((s, x) => s + (x.rating ?? 0), 0) / reviews.length;
  return {
    place: { name, statedRating: Math.round(avg * 10) / 10, totalReviews: reviews.length, address: 'Demo data, not a real business' },
    reviews,
  };
}
