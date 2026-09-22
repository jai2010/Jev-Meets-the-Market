# Phase 1 data quality report

Generated: 22/9/2026, 20:56:58 IST

## Observed

- Data source: Yahoo Finance chart API, client yahoo-finance2 4.0.2.
- Universe label: Fixed current NIFTY 100 universe.
- Constituent file: data/universe/ind_nifty100list.csv, captured 2026-09-22.
- Stocks requested: 100.
- Stocks cached: 100.
- Stocks failed: 0.
- Requested window: 2025-03-03 through the session before 2026-09-23.
- Benchmark: ^CNX100.
- Raw benchmark rows: 389.
- Rows treated as Yahoo placeholders, not trading sessions: 2026-01-15, 2026-05-01, 2026-05-28, 2026-06-26, 2026-09-14.
- Trading sessions after that filter: 384.
- First / last trading session: 2025-03-03 / 2026-09-22.
- Cache directory: `data/raw/ohlcv/` and `data/raw/events/`.
- Trading calendar: `data/universe/trading_calendar.json`.

## Missing and unusable bars

A trading session is a date where the NIFTY 100 bar has a high-low range, or at least one stock has a bar with volume above zero. Dates where every stock is empty or a flat zero-volume print, and the index bar is empty, stay in the raw cache and are left off the trading calendar.

Benchmark bar missing on a day stocks traded: 2026-01-01.

Unusable stock prints on trading sessions:

- 2025-03-18: flat zero-volume 96 symbols, real bars only in ITC. Open, high, low and close equal the previous session close, and volume is 0. The NIFTY 100 bar on this date is a normal traded session.
- 2025-04-11: flat zero-volume ETERNAL. Flat print with volume 0 on a session the rest of the universe traded.
- 2025-04-15: flat zero-volume ETERNAL. Flat print with volume 0 on a session the rest of the universe traded.
- 2025-09-08: flat zero-volume M&M. Flat print with volume 0 on a session the rest of the universe traded.

History starts after the first trading session. The dates before the first real bar are not holes:

| Symbol | First real session | Trading sessions before that |
| --- | --- | ---: |
| ENRIN | 2025-06-19 | 72 |
| TATACAP | 2025-10-13 | 151 |
| TMCV | 2025-11-12 | 171 |

Symbols with a bad or missing bar after their first real session: 96.

## Adjustment finding

Yahoo reported 9 split events. Overnight close ratios classify 9 as already split-adjusted and 0 as unadjusted traded prices. Dividend events: 259. Symbols where adj_close differs from close: 95. A split-adjusted history downloaded on 2026-09-22 embeds split factors whose ex-date is after a simulated decision date. That changes the rupee level, not the split-adjusted return. `adj_close` also embeds later dividends and is not a point-in-time price.

## Sample raw rows

### RELIANCE.NS

| date | open | high | low | close | adj_close | volume |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-03-03 | 1204 | 1206.45 | 1156 | 1171.25 | 1161.2217 | 17944938 |
| 2025-03-04 | 1162.2 | 1174 | 1159.55 | 1161.9 | 1151.9518 | 11377373 |
| 2025-03-05 | 1161 | 1183 | 1157 | 1175.6 | 1165.5345 | 8664095 |
| 2026-09-18 | 1245 | 1247.3 | 1226.4 | 1226.4 | 1226.4 | 15122715 |
| 2026-09-21 | 1234.1 | 1249.1 | 1232.5 | 1247.4 | 1247.4 | 10007218 |
| 2026-09-22 | 1247.6 | 1251.9 | 1237.4 | 1240.4 | 1240.4 | 10681733 |

### HDFCBANK.NS

| date | open | high | low | close | adj_close | volume |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-03-03 | 869.9 | 871.525 | 847.05 | 850.775 | 825.7708 | 21205364 |
| 2025-03-04 | 849 | 857.15 | 846.625 | 855 | 829.8715 | 19920958 |
| 2025-03-05 | 850.975 | 855.4 | 844.125 | 845 | 820.1654 | 21583872 |
| 2026-09-18 | 715.25 | 733.8 | 715.25 | 731 | 731 | 39400710 |
| 2026-09-21 | 731 | 742.65 | 729.05 | 739.5 | 739.5 | 35482683 |
| 2026-09-22 | 738.85 | 749.3 | 738.6 | 738.6 | 738.6 | 35473028 |

### INFY.NS

| date | open | high | low | close | adj_close | volume |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-03-03 | 1692.3 | 1728.6 | 1692.3 | 1708.6 | 1624.3387 | 7504969 |
| 2025-03-04 | 1695 | 1699 | 1670 | 1688.3 | 1605.0399 | 6759673 |
| 2025-03-05 | 1692.45 | 1732.95 | 1692.45 | 1711.5 | 1627.0958 | 8180782 |
| 2026-09-18 | 1061.9 | 1061.9 | 1038 | 1051.4 | 1051.4 | 22124953 |
| 2026-09-21 | 1041.5 | 1044.5 | 1030.3 | 1038.5 | 1038.5 | 6074358 |
| 2026-09-22 | 1037.7 | 1041 | 1019.2 | 1029.4 | 1029.4 | 9338840 |

## What this file is not

No features were calculated. No portfolio was simulated. Jev was not called.

