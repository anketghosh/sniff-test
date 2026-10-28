# How Sniff Test scores reviews

Everything here is implemented in [`src/lib/analysis.ts`](../src/lib/analysis.ts). The numbers below are the exact thresholds in the code.

## 1. Per-review flags

Each review collects zero or more flags. Each flag adds to that review's **suspicion score** (capped at 1.0). A review is **flagged as suspicious at 0.45 or above**.

| Flag | When it fires | Weight |
|---|---|---|
| **Copied text** | TF-IDF cosine similarity ≥ **0.80** with another review (unigrams + bigrams, stop-words removed). Only reviews with ≥ 6 meaningful words are compared. | 0.50 → 0.80 (rises with similarity) |
| **Generic wording** | ≤ 20 words, a 1★ or 5★ rating, and ≥ 75% of the meaningful words are generic ("great", "amazing", "highly recommend", "scam", "avoid"…) | 0.20 |
| **One-review account** | The reviewer has written exactly 1 review on Google | 0.30 |
| **New account** | The reviewer has written 2–3 reviews | 0.10 |
| **Review spike** | Posted in a spike bucket (see below) with a 1★ or 5★ rating | 0.30 |
| **No written review** | A 1★ or 5★ with no text | 0.10 |

**Local Guides** with 10 or more reviews get their suspicion multiplied by 0.6.

No single weak signal can flag a review on its own. It takes either copied text, or a combination such as a one-review account plus generic wording (0.30 + 0.20).

### Spike detection
Reviews with exact dates are bucketed **per day** (or **per week** if the sample spans more than 180 days). A bucket is a spike when all of these hold:
- count ≥ max(6, 5 × the average bucket),
- Z-score ≥ 3.5,
- there are at least 5 buckets and at least 15 dated reviews (60% or more of the sample).

## 2. The four checks (0–100, higher = more trustworthy)

| Check | Weight | Formula (simplified) |
|---|---|---|
| **Review text** | 35% | `100 − 220 × copiedShare − 60 × genericShare` (shares of reviews that have text) |
| **Reviewer accounts** | 25% | Penalty = `oneReviewShare × 100` up to 30%, then 180 points per unit above. Plus `newAccountShare × 20`. |
| **Posting pattern** | 20% | `100 − 160 × shareOfReviewsInSpikes` |
| **Rating pattern** | 20% | `100 − 60 × bimodality − perfectPenalty − shiftPenalty` |

**Rating pattern details**
- *Bimodality* is close to 1 when there are many 1★ (≥ 20%) and many 5★ (≥ 40%) but few 2–4★ (< 15%).
- *Perfect penalty*: with 20+ ratings and ≥ 95% 5★, up to 25 points.
- *Shift penalty*: if removing suspicious reviews moves the average by ≥ 0.2★, `40 × |shift|`, capped at 40.

A check is **skipped** when the data can't support it (for example, pasted reviews have no exact dates, so there's no posting-pattern check). The remaining weights are rescaled to add up to 100%.

## 3. The headline numbers

- **Trust score** = weighted average of the checks that ran.
  - **80–100**: Mostly genuine reviews
  - **60–79**: Read with care
  - **0–59**: High risk of fake reviews
- **Rating without suspicious** = average stars of the reviews that weren't flagged.
- **What we noticed** = plain-language findings, ordered from most to least serious.

## 4. Known blind spots

- Sophisticated fakes written individually by real people with long review histories look genuine to every check here.
- Only the newest 50–300 reviews are analysed.
- Similar wording can be innocent: short, honest reviews like "Great pizza, friendly staff" do resemble each other. That's why short texts are excluded from duplicate matching and generic wording carries a low weight.

The demo scenarios (`/?demo=botfarm|bomb|polarised|organic`) are seeded and anchored to the current day, so they give the same scores on every run. They're handy for checking that a change to the engine behaves as expected.
