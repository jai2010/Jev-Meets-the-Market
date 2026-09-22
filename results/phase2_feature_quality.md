# Phase 2 feature quality

Generated: 22/9/2026, 21:46:43

Jev was not called. No portfolio was simulated.

## Coverage

- Stocks: 100
- Trading sessions: 384
- Feature rows: 38400
- Decision-ready rows: 11772
- First decision-ready date: 2026-03-10
- Last decision-ready date: 2026-09-22
- Database: `data/processed/market.duckdb`

## Formulas

Features on date D use only trading sessions on or before D. `close` is the raw Yahoo close, not `adj_close`. A stock session with missing prices, a non-positive price, or volume of 0 is stored and then treated as missing inside every window. A window with any missing session is null. Nothing is forward-filled.

- Returns are close / close N sessions earlier − 1.
- SMA is the mean of that many closes, including D.
- `above_sma*` is true only when close is strictly above that average.
- RSI is Wilder's 14-period RSI. A missing session starts a new average.
- `volatility_20d` is the sample standard deviation of 20 one-day returns. It is not annualized.
- `volume_ratio_20d` is volume / the 20-session mean volume, including D.
- `high_52w` is the maximum high over 252 trading sessions. Distance is close / high_52w − 1.
- `drawdown_20d` is close / the 20-session maximum close − 1.
- NIFTY returns use the NIFTY 100 close. Relative return is the stock return minus the NIFTY return of the same horizon.
- A row is decision-ready only when return_20d, return_60d, sma_50, sma_200, rsi_14, volatility_20d, volume_ratio_20d, the 52-week high, and all three NIFTY returns exist.

The cached `close` is already split-adjusted as of the Yahoo download. That can change the rupee level of a session that precedes a later split. `adj_close` is not used, because it also embeds later dividends.

## Missing values

| Field | Null rows |
| --- | ---: |
| return_1d | 691 |
| return_5d | 1092 |
| return_20d | 2496 |
| return_60d | 6494 |
| rsi_14 | 2881 |
| volatility_20d | 3488 |
| volume_ratio_20d | 3387 |
| distance_from_52w_high | 26628 |
| drawdown_20d | 3387 |
| nifty_return_20d | 2200 |
| relative_return_20d | 2696 |

## Decision-ready distribution

| Field | Min | Median | Max |
| --- | ---: | ---: | ---: |
| return_1d | -0.648979 | 0 | 0.122506 |
| return_5d | -0.630846 | -0.00047 | 0.276057 |
| return_20d | -0.595115 | 0.00207 | 0.555374 |
| return_60d | -0.669992 | 0.003178 | 0.85094 |
| rsi_14 | 14.706642 | 50.446267 | 90.242007 |
| volatility_20d | 0.005421 | 0.01662 | 0.152312 |
| volume_ratio_20d | 0.143195 | 0.820897 | 12.570049 |
| distance_from_52w_high | -0.681698 | -0.153317 | 0 |
| drawdown_20d | -0.655175 | -0.034677 | 0 |
| nifty_return_20d | -0.127783 | 0.00448 | 0.088326 |
| relative_return_20d | -0.673619 | 0.00232 | 0.483022 |

## Stocks with no decision-ready session

TATACAP, TMCV

These names do not have 252 valid sessions after their first usable bar, or a later hole breaks the 52-week window before the sample ends. Their rows are left null. They are not filled.

ITC is decision-ready before the rest of the universe because its 2025-03-18 bar is a real print. The other long-history names have a flat zero-volume print that day, so their 252-session window starts later.

## Large one-day moves on decision-ready rows

These are closes that passed the bar check and moved at least 20% versus the prior usable close. They are not removed. A move this large with no split in the Yahoo event file is a corporate-action gap inside `close`.

| Date | Ticker | Close | 1-day return | Volume |
| --- | --- | ---: | ---: | ---: |
| 2026-04-30 | VEDL | 271.55 | -0.648979 | 73870853 |

## Validation

Result: **pass**. Violations: 0.

Validation recomputes each row from prices on or before that date, then recomputes again on histories cut at 25%, 50%, and 75% of the calendar. A cut that changes an earlier row is a future-data failure and stops the run.

## Sample rows

### RELIANCE 2025-03-03 decision_ready=false

```json
{
  "date": "2025-03-03",
  "ticker": "RELIANCE",
  "open": 1204,
  "high": 1206.45,
  "low": 1156,
  "close": 1171.25,
  "volume": 17944938,
  "return_1d": null,
  "return_5d": null,
  "return_20d": null,
  "return_60d": null,
  "sma_20": null,
  "sma_50": null,
  "sma_200": null,
  "above_sma20": null,
  "above_sma50": null,
  "above_sma200": null,
  "rsi_14": null,
  "volatility_20d": null,
  "volume_avg_20d": null,
  "volume_ratio_20d": null,
  "high_52w": null,
  "distance_from_52w_high": null,
  "drawdown_20d": null,
  "nifty_return_1d": null,
  "nifty_return_5d": null,
  "nifty_return_20d": null,
  "relative_return_5d": null,
  "relative_return_20d": null,
  "decision_ready": false
}
```

### RELIANCE 2026-03-25 decision_ready=true

```json
{
  "date": "2026-03-25",
  "ticker": "RELIANCE",
  "open": 1420,
  "high": 1430.5,
  "low": 1408.4,
  "close": 1413.1,
  "volume": 19041331,
  "return_1d": 0.0009208103130755596,
  "return_5d": 0.0035508841701583638,
  "return_20d": -0.010988241881298988,
  "return_60d": -0.09370189840944088,
  "sma_20": 1396.2499999999995,
  "sma_50": 1415.3000000000006,
  "sma_200": 1448.5074999999995,
  "above_sma20": true,
  "above_sma50": false,
  "above_sma200": false,
  "rsi_14": 51.17187043578757,
  "volatility_20d": 0.014523407939651853,
  "volume_avg_20d": 19573624.05,
  "volume_ratio_20d": 0.9728055954972732,
  "high_52w": 1611.8,
  "distance_from_52w_high": -0.1232783223725028,
  "drawdown_20d": -0.007654494382022481,
  "nifty_return_1d": 0.017696254179613513,
  "nifty_return_5d": -0.021733168512668932,
  "nifty_return_20d": -0.08413878827946442,
  "relative_return_5d": 0.025284052682827296,
  "relative_return_20d": 0.07315054639816543,
  "decision_ready": true
}
```

### HDFCBANK 2026-03-25 decision_ready=true

```json
{
  "date": "2026-03-25",
  "ticker": "HDFCBANK",
  "open": 768.2,
  "high": 794.8,
  "low": 768.2,
  "close": 782.3,
  "volume": 59230640,
  "return_1d": 0.02274807164335213,
  "return_5d": -0.07205978293102422,
  "return_20d": -0.1408017572762219,
  "return_60d": -0.21147061788126198,
  "sma_20": 837.4825000000001,
  "sma_50": 891.9659999999998,
  "sma_200": 962.3272500000014,
  "above_sma20": false,
  "above_sma50": false,
  "above_sma200": false,
  "rsi_14": 33.67679004059504,
  "volatility_20d": 0.021648010445531357,
  "volume_avg_20d": 52416504.05,
  "volume_ratio_20d": 1.1299998172999102,
  "high_52w": 1020.5,
  "distance_from_52w_high": -0.23341499265066146,
  "drawdown_20d": -0.13805641251652723,
  "nifty_return_1d": 0.017696254179613513,
  "nifty_return_5d": -0.021733168512668932,
  "nifty_return_20d": -0.08413878827946442,
  "relative_return_5d": -0.05032661441835529,
  "relative_return_20d": -0.05666296899675749,
  "decision_ready": true
}
```

