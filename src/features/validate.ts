import { computeStockFeatures, type Bar, type FeatureRow } from "./indicators"

export type Violation = {
  ticker: string
  date: string
  rule: string
  detail: string
}

const FLOAT_FIELDS = [
  "return_1d",
  "return_5d",
  "return_20d",
  "return_60d",
  "sma_20",
  "sma_50",
  "sma_200",
  "rsi_14",
  "volatility_20d",
  "volume_avg_20d",
  "volume_ratio_20d",
  "high_52w",
  "distance_from_52w_high",
  "drawdown_20d",
  "nifty_return_1d",
  "nifty_return_5d",
  "nifty_return_20d",
  "relative_return_5d",
  "relative_return_20d",
] as const

const BOOL_FIELDS = ["above_sma20", "above_sma50", "above_sma200", "decision_ready"] as const

function closeEnough(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return left == null && right == null
  return Math.abs(left - right) <= 1e-8
}

function sameRow(actual: FeatureRow, expected: FeatureRow): string | null {
  if (actual.date !== expected.date || actual.ticker !== expected.ticker) {
    return `identity ${actual.ticker} ${actual.date} vs ${expected.ticker} ${expected.date}`
  }
  for (const field of FLOAT_FIELDS) {
    if (!closeEnough(actual[field], expected[field])) {
      return `${field} stored ${actual[field]} causal ${expected[field]}`
    }
  }
  for (const field of BOOL_FIELDS) {
    if (actual[field] !== expected[field]) return `${field} stored ${actual[field]} causal ${expected[field]}`
  }
  return null
}

/**
 * Recomputes every feature from prices on or before that row, and from a truncated
 * history that cannot see later sessions. A mismatch fails the run.
 */
export function validateFeatures(input: {
  calendar: string[]
  benchmarkBars: (Bar | null)[]
  stocks: { ticker: string; bars: (Bar | null)[]; rows: FeatureRow[] }[]
}): Violation[] {
  const violations: Violation[] = []
  const { calendar, benchmarkBars, stocks } = input
  if (benchmarkBars.length !== calendar.length) {
    violations.push({
      ticker: "NIFTY100",
      date: calendar[0] ?? "",
      rule: "benchmark_alignment",
      detail: `benchmark bars ${benchmarkBars.length} calendar ${calendar.length}`,
    })
    return violations
  }

  const cuts = [Math.floor(calendar.length * 0.25), Math.floor(calendar.length * 0.5), Math.floor(calendar.length * 0.75)]
    .filter((cut) => cut > 0 && cut < calendar.length)

  for (const stock of stocks) {
    if (stock.rows.length !== calendar.length || stock.bars.length !== calendar.length) {
      violations.push({
        ticker: stock.ticker,
        date: calendar[0] ?? "",
        rule: "panel_alignment",
        detail: `rows ${stock.rows.length} bars ${stock.bars.length} calendar ${calendar.length}`,
      })
      continue
    }

    for (let index = 0; index < stock.rows.length; index += 1) {
      const row = stock.rows[index]
      if (row.date !== calendar[index]) {
        violations.push({
          ticker: stock.ticker,
          date: row.date,
          rule: "invalid_date",
          detail: `row date ${row.date} is not calendar session ${calendar[index]}`,
        })
      }
      if (row.date > calendar[calendar.length - 1]) {
        violations.push({
          ticker: stock.ticker,
          date: row.date,
          rule: "future_data",
          detail: "feature date is after the last trading session",
        })
      }
      for (const field of ["open", "high", "low", "close"] as const) {
        const value = row[field]
        if (value != null && value <= 0) {
          violations.push({
            ticker: stock.ticker,
            date: row.date,
            rule: "negative_or_zero_price",
            detail: `${field}=${value}`,
          })
        }
      }
      if (row.rsi_14 != null && (row.rsi_14 < 0 || row.rsi_14 > 100)) {
        violations.push({
          ticker: stock.ticker,
          date: row.date,
          rule: "invalid_rsi",
          detail: `rsi_14=${row.rsi_14}`,
        })
      }
      if (row.volatility_20d != null && row.volatility_20d < 0) {
        violations.push({
          ticker: stock.ticker,
          date: row.date,
          rule: "invalid_volatility",
          detail: `volatility_20d=${row.volatility_20d}`,
        })
      }
      if (row.decision_ready && (row.volume == null || row.volume <= 0)) {
        violations.push({
          ticker: stock.ticker,
          date: row.date,
          rule: "invalid_volume",
          detail: `decision_ready with volume ${row.volume}`,
        })
      }
      if (row.high_52w != null && row.high != null && row.high > row.high_52w + 1e-6 && row.volume != null && row.volume > 0) {
        violations.push({
          ticker: stock.ticker,
          date: row.date,
          rule: "impossible_52w_high",
          detail: `high ${row.high} above high_52w ${row.high_52w}`,
        })
      }
    }

    const expected = computeStockFeatures({
      ticker: stock.ticker,
      dates: calendar,
      bars: stock.bars,
      benchmarkBars,
    })
    for (let index = 0; index < expected.length; index += 1) {
      const detail = sameRow(stock.rows[index], expected[index])
      if (detail) {
        violations.push({
          ticker: stock.ticker,
          date: stock.rows[index].date,
          rule: "feature_mismatch",
          detail,
        })
        break
      }
    }

    for (const cut of cuts) {
      const partial = computeStockFeatures({
        ticker: stock.ticker,
        dates: calendar.slice(0, cut),
        bars: stock.bars.slice(0, cut),
        benchmarkBars: benchmarkBars.slice(0, cut),
      })
      for (let index = 0; index < partial.length; index += 1) {
        const detail = sameRow(partial[index], expected[index])
        if (detail) {
          violations.push({
            ticker: stock.ticker,
            date: partial[index].date,
            rule: "future_data",
            detail: `truncation at ${calendar[cut]} changed an earlier feature: ${detail}`,
          })
          break
        }
      }
    }
  }

  return violations
}
