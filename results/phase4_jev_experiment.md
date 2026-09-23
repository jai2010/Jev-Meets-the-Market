# Phase 4 Jev experiment

Experiment ID: JEV-20260922-V2

This report records what the frozen methodology produced. It does not judge whether the result was good or bad, and it is not an investment recommendation.

## Experiment configuration

- Status: FROZEN before the first Jev call. The manifest was not edited afterward.
- Window: 2026-03-10 to 2026-08-31
- Universe: current NIFTY 100 list from Phase 1. Membership was not changed.
- Capital: ₹10,00,000. Maximum 5 positions. Purchase notional capped at 20% of the decision-day portfolio value.
- Buys on names already held do not add shares.
- Sells are applied before new buys. Execution is the next session open. Marks use the session close.
- Transaction cost: 10 bps. Slippage: 5 bps.
- Model: typesafe-ai/jev. Prompt: decision_schema_v1.
- An unresolved Jev call stops the run. It is not stored and it is not treated as NO_ACTION.
- Benchmark: NIFTY 100 close, scaled so the start date equals ₹10,00,000.
- Momentum baseline: top 5 decision-ready names by 20-day return, equal weight, same costs and execution. One random baseline, seed 20260922.
- Price drift after purchase is not trimmed back to 20%.

## Data quality

Features are the Phase 2 point-in-time set. `close` is used, not `adj_close`. Names that are not decision-ready on a date are not sent to Jev. A held name with no decision that day is left unchanged.

The universe is the current NIFTY 100, applied backward. That is survivorship bias. It was not corrected during the run.

Yahoo Finance is the price source. One known traded gap remains in that cache: Vedanta on 2026-04-30, where the close fell about 65% and no split was recorded.

## Execution summary

- Trading sessions: 118
- Jev calls stored: 10299
- Successful calls: 10299
- Failed calls: 0
- Calls with more than one attempt: 752
- Mean latency of successful calls: 545 ms

Latency is recorded as an operational fact. It is not a score.

## Portfolio result

- Starting capital: ₹10,00,000
- Final value: ₹11,22,525
- Total return: 12.25%
- Max drawdown: -3.65%
- Trades: 19
- Average holding period: 44.3 sessions
- Mean cash invested fraction: 89.75%

## Benchmark

- NIFTY 100 final value: ₹10,11,109
- NIFTY 100 return: 1.11%
- Momentum baseline final value: ₹10,00,000
- Momentum baseline return: 0.00%
- Random baseline final value: ₹10,00,000
- Random baseline return: 0.00%
- Difference, Jev minus NIFTY 100: 11.14 percentage points

## Decision statistics

- BUY: 4284
- HOLD: 529
- SELL: 7
- NO_ACTION: 5479
- Mean chosen-action probability: 0.701

Chosen-action probability is the probability on the action Jev selected. The raw confidence field is stored separately and is not this number.

## BUY analysis

Subsequent close-to-close returns after a BUY decision. These were not available to Jev.

| Horizon | Decisions with a later close | Mean return |
| --- | ---: | ---: |
| 1 session | 4249 | 0.06% |
| 5 session | 4100 | 0.38% |
| 20 session | 3497 | 0.88% |

## SELL analysis

Subsequent close-to-close returns after a SELL decision.

| Horizon | Decisions with a later close | Mean return |
| --- | ---: | ---: |
| 1 session | 7 | -0.14% |
| 5 session | 7 | 0.12% |
| 20 session | 7 | 2.76% |

## Confidence buckets

Buckets use the chosen-action probability of BUY decisions. The cell is the mean subsequent 20-session return. Empty buckets are reported as empty. This is not a calibration test.

| Chosen-action probability | BUY decisions | Mean 20-session return |
| --- | ---: | ---: |
| <0.40 | 0 | n/a |
| 0.40–0.49 | 0 | n/a |
| 0.50–0.59 | 1169 | 1.39% |
| 0.60–0.69 | 1613 | 0.77% |
| 0.70–0.79 | 1295 | 0.42% |
| 0.80–0.89 | 200 | 1.19% |
| 0.90–1.00 | 7 | 15.64% |

## Limitations

- The current NIFTY 100 universe introduces survivorship bias.
- Six months is a short historical period.
- Yahoo Finance is an experimental data source.
- Transaction cost and slippage are flat assumptions.
- This is a historical simulation, not live trading.
- Historical results do not establish future performance.

