# Contributing to Sniff Test

Thanks for helping. Here's how to get going.

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
```

The demos (`/?demo=botfarm`, `bomb`, `polarised`, `organic`) and paste mode work without any keys. For link checks, add your own free Apify key in the app.

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm run build
```

CI runs the same three on every push and pull request.

## Guidelines

- **Scoring changes** (`src/lib/analysis.ts`): run all four demos before and after your change, and include their trust scores in the PR description. The genuine demo (`organic`) should stay at 80 or above, and the other three below 60. Update [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) if you change any threshold.
- **UI changes**: check light and dark mode, and a phone width (about 390 px). Attach screenshots to the PR.
- **Data sources**: new review providers should go behind the same `fetchReviews` shape in `src/lib/apify.ts` (or a sibling module) so the rest of the app doesn't change. Please don't add scraping that evades bot detection.
- **Copy**: keep the friendly, plain-language voice. Flags must always explain *why* in words a non-expert understands.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected and what happened. For a wrong score, include the demo name, or an anonymised CSV of the reviews if you can share one.
