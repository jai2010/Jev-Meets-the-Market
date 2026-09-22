# Jev Investment Lab

Experiment: can Jev make useful stock decisions using only information that existed at the decision time?

This repository is a Next.js app so the dashboard can deploy on Vercel. Phase 1 only downloads and checks historical prices. It does not call Jev.

## Stack

- Next.js on Vercel for the report and, later, the dashboard.
- Yahoo Finance daily bars, cached under `data/raw/` by a local script. The download is not a serverless function.
- Jev, from Phase 3 onward, through Vercel AI Gateway: model `typesafe-ai/jev`, `POST https://ai-gateway.vercel.sh/v1/evaluate`, key in `AI_GATEWAY_API_KEY`. See `.env.example`. The promotional Gateway price ends 2026-09-25.

## Phase 1

```bash
npm install
npm run download
npm run dev
```

`npm run download` reads `data/universe/ind_nifty100list.csv`, writes `config/universe.json`, and caches one CSV per symbol. A second run skips files that already end on the latest session. Use `npm run download -- --force` to fetch again.

`npm run features` builds point-in-time features into `data/processed/market.duckdb`. `npm run validate` checks that database against the raw cache and fails if a feature uses a later session. `npm test` runs the indicator tests.

The universe is the **fixed current NIFTY 100** list captured on 2026-09-22. It is not historical index membership.
