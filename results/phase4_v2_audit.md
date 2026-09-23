# Phase 4 V2 independent audit — JEV-20260922-V2

Read-only audit. The live experiment database was copied before reading. Decisions, methodology, and production result files were not modified.

Overall: **PASS**

## Audit scorecard

| Audit | Result |
| --- | --- |
| 1. Trade-level | **PASS** |
| 2. Portfolio accounting | **PASS** |
| 3. Constraints | **PASS** |
| 4. Market-data (Yahoo raw OPEN) | **PASS** |
| 5. Benchmark | **PASS** |

## Scope

- Run ID: JEV-20260922-V2
- OK decisions loaded: 10299
- Sessions audited: 2026-03-10 → 2026-08-31 (118)
- Executed trades: 19
- Slippage rate: 0.0005
- Transaction cost rate: 0.001

## 1. Trade-level audit

Trades are not stored as a table in DuckDB. They were reconstructed from stored OK decisions using the frozen Phase 4 execution rules, then checked independently against raw OPENs and timing.

BUY execution price must equal `OPEN × (1 + 0.0005)`. SELL execution price must equal `OPEN × (1 − 0.0005)`. Execution date must be the next trading session after the decision date.

| Decision | Execution | Ticker | Side | Jev action | P(chosen) | Raw OPEN | Exec price | Expected | Qty | Gross | Cost | Net cash | Timing | Price |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 2026-03-12 | 2026-03-13 | ITC | BUY | BUY | 0.5700000000000001 | 304 | 304.152 | 304.152 | 656 | 1,99,424 | 199.523712 | -1,99,723.235712 | PASS | PASS |
| 2026-03-19 | 2026-03-20 | ITC | SELL | SELL | 0.45 | 301.05 | 300.899475 | 300.899475 | 656 | 1,97,488.8 | 197.390056 | 1,97,192.665544 | PASS | PASS |
| 2026-03-23 | 2026-03-24 | ITC | BUY | BUY | 0.55 | 295.95 | 296.097975 | 296.097975 | 673 | 1,99,174.35 | 199.273937 | -1,99,473.211112 | PASS | PASS |
| 2026-03-25 | 2026-03-27 | SUNPHARMA | BUY | BUY | 0.98 | 1,785 | 1,785.8925 | 1,785.8925 | 111 | 1,98,135 | 198.234068 | -1,98,432.301568 | PASS | PASS |
| 2026-03-25 | 2026-03-27 | ADANIPOWER | BUY | BUY | 0.97 | 153.5 | 153.57675 | 153.57675 | 1297 | 1,99,089.5 | 199.189045 | -1,99,388.233795 | PASS | PASS |
| 2026-03-25 | 2026-03-27 | CUMMINSIND | BUY | BUY | 0.96 | 4,730.6001 | 4,732.9654 | 4,732.9654 | 42 | 1,98,685.2042 | 198.784547 | -1,98,983.331349 | PASS | PASS |
| 2026-03-25 | 2026-03-27 | DRREDDY | BUY | BUY | 0.95 | 1,297 | 1,297.6485 | 1,297.6485 | 153 | 1,98,441 | 198.540221 | -1,98,738.760721 | PASS | PASS |
| 2026-04-01 | 2026-04-02 | DRREDDY | SELL | SELL | 0.44 | 1,187.5 | 1,186.90625 | 1,186.90625 | 153 | 1,81,687.5 | 181.596656 | 1,81,415.059594 | PASS | PASS |
| 2026-04-01 | 2026-04-02 | ONGC | BUY | BUY | 0.71 | 288.5 | 288.64425 | 288.64425 | 636 | 1,83,486 | 183.577743 | -1,83,761.320743 | PASS | PASS |
| 2026-04-02 | 2026-04-06 | SUNPHARMA | SELL | SELL | 0.45 | 1,684.3 | 1,683.45785 | 1,683.45785 | 111 | 1,86,957.3 | 186.863821 | 1,86,676.957529 | PASS | PASS |
| 2026-04-02 | 2026-04-06 | DMART | BUY | BUY | 0.8 | 4,450 | 4,452.225 | 4,452.225 | 41 | 1,82,450 | 182.541225 | -1,82,723.766225 | PASS | PASS |
| 2026-04-16 | 2026-04-17 | ADANIPOWER | SELL | SELL | 0.56 | 196.45 | 196.351775 | 196.351775 | 1297 | 2,54,795.65 | 254.668252 | 2,54,413.583923 | PASS | PASS |
| 2026-04-16 | 2026-04-17 | CGPOWER | BUY | BUY | 0.82 | 760 | 760.38 | 760.38 | 271 | 2,05,960 | 206.06298 | -2,06,269.04298 | PASS | PASS |
| 2026-05-20 | 2026-05-21 | DMART | SELL | SELL | 0.56 | 4,167.3999 | 4,165.3162 | 4,165.3162 | 41 | 1,70,863.3959 | 170.777964 | 1,70,607.186238 | PASS | PASS |
| 2026-05-20 | 2026-05-21 | APOLLOHOSP | BUY | BUY | 0.81 | 8,198.5 | 8,202.59925 | 8,202.59925 | 26 | 2,13,161 | 213.26758 | -2,13,480.84808 | PASS | PASS |
| 2026-05-27 | 2026-05-29 | ITC | SELL | SELL | 0.48 | 292 | 291.854 | 291.854 | 673 | 1,96,516 | 196.417742 | 1,96,221.324258 | PASS | PASS |
| 2026-05-27 | 2026-05-29 | ONGC | SELL | SELL | 0.44 | 275.95 | 275.812025 | 275.812025 | 636 | 1,75,504.2 | 175.416448 | 1,75,241.031452 | PASS | PASS |
| 2026-05-27 | 2026-05-29 | PIDILITIND | BUY | BUY | 0.83 | 1,474.2 | 1,474.9371 | 1,474.9371 | 128 | 1,88,697.6 | 188.791949 | -1,88,980.740749 | PASS | PASS |
| 2026-05-27 | 2026-05-29 | TORNTPHARM | BUY | BUY | 0.82 | 4,554.7998 | 4,557.0772 | 4,557.0772 | 41 | 1,86,746.7918 | 186.840165 | -1,87,027.005361 | PASS | PASS |

## 2. Portfolio accounting audit

Independent reconstruction starts at ₹10,00,000, applies trade net cash impacts in sell-then-buy order, and marks positions with session CLOSE.

No portfolio mismatches at or above ₹0.01.

Final independent portfolio value: **₹11,22,524.610143**
Stored/experiment-path portfolio value: **₹11,22,524.610143**
Absolute difference: **₹0**
Percentage difference: **0.00000000%**

## 3. Constraint audit

- PASS BUY-while-held and slot availability checked before each buy
- PASS final cash non-negative (4786.0101)
- PASS HOLD/NO_ACTION decisions did not generate trades
- PASS max positions observed 5 <= 5
- PASS no leverage observed (buys funded from cash only)
- PASS no short positions observed (share counts stayed positive)
- PASS SELL exits checked against full held quantity
- PASS sell-before-buy ordering checked on every execution session

## 4. Market-data audit

Each execution OPEN from the feature/cell path was compared to `data/raw/ohlcv/<TICKER>.csv`.

All execution OPENs matched the raw Yahoo cache.

External NSE reference CSV (does not replace experiment data): `/Users/jai/Documents/Playground/jevStock/results/phase4_v2_trades_nse_reference.csv`

## 5. Benchmark audit

| Field | Value |
| --- | ---: |
| Starting NIFTY 100 close | 24,957.8008 |
| Ending NIFTY 100 close | 25,235.0508 |
| Index return | 1.110875% |
| ₹10,00,000 equivalent | ₹10,11,108.751217 |
| Stored benchmark | ₹10,11,108.751217 |
| Difference | ₹0 |

## 6. Final reconciliation

| Item | Value |
| --- | ---: |
| Independent final portfolio | ₹11,22,524.610143 |
| Experiment-path final portfolio | ₹11,22,524.610143 |
| Absolute difference | ₹0 |
| Percentage difference | 0.00000000% |
| Final cash (independent) | ₹4,786.010143 |
| Final positions | 5 / 5 |

