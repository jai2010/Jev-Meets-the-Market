# Phase 3 Jev decision test

Run: JEV-20260922-V1-PHASE3-TEST
Model: typesafe-ai/jev
Prompt: decision_schema_v1

This is an integration sample. It is not the six-month portfolio experiment. No profitability was calculated.

## Sample rule

Dates are the 0, 25, 50, 75, and 100 percent positions among sessions where at least 90 stocks are decision-ready.
Stocks are chosen on the middle of those dates, one ticker each, in this order: nearest the 52-week high, lowest RSI, strongest 60-day return above the 200-day average, weakest 60-day return below that average, then smallest absolute 20-day return with RSI between 40 and 60. Ties use the ticker name.
The first two selected tickers in alphabetical order are marked held in a synthetic portfolio. Cash is ₹6,00,000, portfolio value is ₹10,00,000, two positions, maximum five. Entry price for a held name is the close 20 sessions earlier. This is not the portfolio engine.

Dates: 2026-03-25, 2026-05-13, 2026-06-29, 2026-08-10, 2026-09-22

| Ticker | Archetype on the middle date | Held in the mock book |
| --- | --- | --- |
| ZYDUSLIFE | near_high | no |
| ONGC | oversold | no |
| ADANIGREEN | uptrend | yes |
| VEDL | downtrend | no |
| HINDUNILVR | sideways | yes |

## Calls

- Planned primary decisions: 25
- Stored rows: 31
- Successful calls: 30
- Failed calls: 1
- Repeated-input calls: 5
- Average latency of successful calls: 541 ms
- Account block: none

Latency is recorded only so a hung client is visible. It is not a score.

## Decisions

| Date | Ticker | Call | Status | Action | Confidence |
| --- | --- | --- | --- | --- | ---: |
| 2026-03-25 | ZYDUSLIFE | primary | ERROR |  |  |
| 2026-03-25 | ZYDUSLIFE | primary | OK | BUY | 0.74 |
| 2026-03-25 | ONGC | primary | OK | BUY | 0.81 |
| 2026-03-25 | ADANIGREEN | primary | OK | SELL | 0.46 |
| 2026-03-25 | VEDL | primary | OK | BUY | 0.61 |
| 2026-03-25 | HINDUNILVR | primary | OK | HOLD | 0.5 |
| 2026-05-13 | ZYDUSLIFE | primary | OK | BUY | 0.85 |
| 2026-05-13 | ONGC | primary | OK | BUY | 0.99 |
| 2026-05-13 | ADANIGREEN | primary | OK | HOLD | 0.88 |
| 2026-05-13 | VEDL | primary | OK | BUY | 0.54 |
| 2026-05-13 | HINDUNILVR | primary | OK | HOLD | 0.89 |
| 2026-06-29 | ZYDUSLIFE | primary | OK | BUY | 0.97 |
| 2026-06-29 | ONGC | primary | OK | BUY | 0.68 |
| 2026-06-29 | ADANIGREEN | primary | OK | HOLD | 0.93 |
| 2026-06-29 | VEDL | primary | OK | NO_ACTION | 0.6900000000000001 |
| 2026-06-29 | HINDUNILVR | primary | OK | HOLD | 0.73 |
| 2026-08-10 | ZYDUSLIFE | primary | OK | BUY | 0.52 |
| 2026-08-10 | ONGC | primary | OK | NO_ACTION | 0.87 |
| 2026-08-10 | ADANIGREEN | primary | OK | HOLD | 0.44 |
| 2026-08-10 | VEDL | primary | OK | BUY | 0.8 |
| 2026-08-10 | HINDUNILVR | primary | OK | HOLD | 0.56 |
| 2026-09-22 | ZYDUSLIFE | primary | OK | BUY | 0.98 |
| 2026-09-22 | ONGC | primary | OK | NO_ACTION | 0.53 |
| 2026-09-22 | ADANIGREEN | primary | OK | HOLD | 0.82 |
| 2026-09-22 | VEDL | primary | OK | NO_ACTION | 0.79 |
| 2026-09-22 | HINDUNILVR | primary | OK | HOLD | 0.45 |
| 2026-03-25 | ZYDUSLIFE | repeat | OK | BUY | 0.72 |
| 2026-05-13 | ZYDUSLIFE | repeat | OK | BUY | 0.84 |
| 2026-06-29 | ZYDUSLIFE | repeat | OK | BUY | 0.98 |
| 2026-08-10 | ZYDUSLIFE | repeat | OK | BUY | 0.51 |
| 2026-09-22 | ZYDUSLIFE | repeat | OK | BUY | 0.97 |

## Repeated-input consistency

| Date | Ticker | Primary | Repeat | Same action |
| --- | --- | --- | --- | --- |
| 2026-03-25 | ZYDUSLIFE | BUY | BUY | yes |
| 2026-05-13 | ZYDUSLIFE | BUY | BUY | yes |
| 2026-06-29 | ZYDUSLIFE | BUY | BUY | yes |
| 2026-08-10 | ZYDUSLIFE | BUY | BUY | yes |
| 2026-09-22 | ZYDUSLIFE | BUY | BUY | yes |

## Schema check

Every successful row has one of BUY, HOLD, SELL, NO_ACTION.

The `confidence` column is the probability Jev assigned to the chosen action. The raw answer also contains its own `confidence` field, which is not that probability. Both are kept. The column was not rewritten.

The first stored row is the earlier card-block error. The example below is a successful call from this rerun: VEDL on 2026-06-29.

## Raw response example

```json
{
  "model": "typesafe-ai/jev",
  "answers": {
    "action": {
      "type": "choice",
      "choice": "NO_ACTION",
      "probabilities": {
        "HOLD": 0,
        "NO_ACTION": 0.6900000000000001,
        "SELL": 0,
        "BUY": 0.31
      },
      "confidence": 0.58
    }
  },
  "usage": {
    "inputTokens": 1155,
    "outputTokens": 48
  }
}
```

