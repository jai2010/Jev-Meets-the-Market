import type { FeatureRow } from "./indicators"
import type { Violation } from "./validate"

const MAJOR = [
  "return_1d",
  "return_5d",
  "return_20d",
  "return_60d",
  "rsi_14",
  "volatility_20d",
  "volume_ratio_20d",
  "distance_from_52w_high",
  "drawdown_20d",
  "nifty_return_20d",
  "relative_return_20d",
] as const

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function fmt(value: number | null): string {
  if (value == null || Number.isNaN(value)) return ""
  return String(Math.round(value * 1e6) / 1e6)
}

export function summarize(rows: FeatureRow[], violations: Violation[]) {
  const ready = rows.filter((row) => row.decision_ready)
  const readyDates = ready.map((row) => row.date).sort()
  const byTicker = new Map<string, number>()
  for (const row of rows) byTicker.set(row.ticker, 0)
  for (const row of ready) byTicker.set(row.ticker, (byTicker.get(row.ticker) ?? 0) + 1)
  const insufficient = [...byTicker.entries()]
    .filter(([, count]) => count === 0)
    .map(([ticker]) => ticker)
    .sort()

  const nullCounts: Record<string, number> = {}
  for (const field of MAJOR) nullCounts[field] = rows.filter((row) => row[field] == null).length

  const jumps = ready
    .filter((row) => row.return_1d != null && Math.abs(row.return_1d) >= 0.2)
    .sort((a, b) => Math.abs(b.return_1d ?? 0) - Math.abs(a.return_1d ?? 0))
    .map((row) => ({ date: row.date, ticker: row.ticker, close: row.close, return_1d: row.return_1d, volume: row.volume }))

  const fieldStats = MAJOR.map((field) => {
    const values = ready.map((row) => row[field]).filter((value): value is number => value != null)
    return {
      field,
      min: values.length ? Math.min(...values) : null,
      median: median(values),
      max: values.length ? Math.max(...values) : null,
    }
  })

  return {
    stocks: byTicker.size,
    trading_days: rows.length / Math.max(byTicker.size, 1),
    feature_rows: rows.length,
    decision_ready_rows: ready.length,
    first_decision_ready_date: readyDates[0] ?? null,
    last_decision_ready_date: readyDates.at(-1) ?? null,
    insufficient_history: insufficient,
    null_counts: nullCounts,
    field_stats: fieldStats,
    large_one_day_moves: jumps,
    violations: violations.length,
    validation: violations.length === 0 ? "pass" : "fail",
  }
}

export function renderMarkdown(input: {
  generatedAt: string
  summary: ReturnType<typeof summarize>
  violations: Violation[]
  samples: FeatureRow[]
  database: string
}): string {
  const { summary } = input
  const lines: string[] = []
  lines.push("# Phase 2 feature quality")
  lines.push("")
  lines.push(`Generated: ${input.generatedAt}`)
  lines.push("")
  lines.push("Jev was not called. No portfolio was simulated.")
  lines.push("")
  lines.push("## Coverage")
  lines.push("")
  lines.push(`- Stocks: ${summary.stocks}`)
  lines.push(`- Trading sessions: ${summary.trading_days}`)
  lines.push(`- Feature rows: ${summary.feature_rows}`)
  lines.push(`- Decision-ready rows: ${summary.decision_ready_rows}`)
  lines.push(`- First decision-ready date: ${summary.first_decision_ready_date ?? "none"}`)
  lines.push(`- Last decision-ready date: ${summary.last_decision_ready_date ?? "none"}`)
  lines.push(`- Database: \`${input.database}\``)
  lines.push("")
  lines.push("## Formulas")
  lines.push("")
  lines.push("Features on date D use only trading sessions on or before D. `close` is the raw Yahoo close, not `adj_close`. A stock session with missing prices, a non-positive price, or volume of 0 is stored and then treated as missing inside every window. A window with any missing session is null. Nothing is forward-filled.")
  lines.push("")
  lines.push("- Returns are close / close N sessions earlier − 1.")
  lines.push("- SMA is the mean of that many closes, including D.")
  lines.push("- `above_sma*` is true only when close is strictly above that average.")
  lines.push("- RSI is Wilder's 14-period RSI. A missing session starts a new average.")
  lines.push("- `volatility_20d` is the sample standard deviation of 20 one-day returns. It is not annualized.")
  lines.push("- `volume_ratio_20d` is volume / the 20-session mean volume, including D.")
  lines.push("- `high_52w` is the maximum high over 252 trading sessions. Distance is close / high_52w − 1.")
  lines.push("- `drawdown_20d` is close / the 20-session maximum close − 1.")
  lines.push("- NIFTY returns use the NIFTY 100 close. Relative return is the stock return minus the NIFTY return of the same horizon.")
  lines.push("- A row is decision-ready only when return_20d, return_60d, sma_50, sma_200, rsi_14, volatility_20d, volume_ratio_20d, the 52-week high, and all three NIFTY returns exist.")
  lines.push("")
  lines.push("The cached `close` is already split-adjusted as of the Yahoo download. That can change the rupee level of a session that precedes a later split. `adj_close` is not used, because it also embeds later dividends.")
  lines.push("")
  lines.push("## Missing values")
  lines.push("")
  lines.push("| Field | Null rows |")
  lines.push("| --- | ---: |")
  for (const [field, count] of Object.entries(summary.null_counts)) lines.push(`| ${field} | ${count} |`)
  lines.push("")
  lines.push("## Decision-ready distribution")
  lines.push("")
  lines.push("| Field | Min | Median | Max |")
  lines.push("| --- | ---: | ---: | ---: |")
  for (const stat of summary.field_stats) {
    lines.push(`| ${stat.field} | ${fmt(stat.min)} | ${fmt(stat.median)} | ${fmt(stat.max)} |`)
  }
  lines.push("")
  lines.push("## Stocks with no decision-ready session")
  lines.push("")
  if (summary.insufficient_history.length === 0) lines.push("Every stock has at least one decision-ready session.")
  else lines.push(summary.insufficient_history.join(", "))
  lines.push("")
  lines.push("These names do not have 252 valid sessions after their first usable bar, or a later hole breaks the 52-week window before the sample ends. Their rows are left null. They are not filled.")
  lines.push("")
  lines.push("ITC is decision-ready before the rest of the universe because its 2025-03-18 bar is a real print. The other long-history names have a flat zero-volume print that day, so their 252-session window starts later.")
  lines.push("")
  lines.push("## Large one-day moves on decision-ready rows")
  lines.push("")
  lines.push("These are closes that passed the bar check and moved at least 20% versus the prior usable close. They are not removed. A move this large with no split in the Yahoo event file is a corporate-action gap inside `close`.")
  lines.push("")
  if (summary.large_one_day_moves.length === 0) lines.push("None.")
  else {
    lines.push("| Date | Ticker | Close | 1-day return | Volume |")
    lines.push("| --- | --- | ---: | ---: | ---: |")
    for (const move of summary.large_one_day_moves) {
      lines.push(`| ${move.date} | ${move.ticker} | ${move.close} | ${fmt(move.return_1d)} | ${move.volume} |`)
    }
  }
  lines.push("")
  lines.push("## Validation")
  lines.push("")
  lines.push(`Result: **${summary.validation}**. Violations: ${summary.violations}.`)
  lines.push("")
  lines.push("Validation recomputes each row from prices on or before that date, then recomputes again on histories cut at 25%, 50%, and 75% of the calendar. A cut that changes an earlier row is a future-data failure and stops the run.")
  lines.push("")
  if (input.violations.length) {
    lines.push("| Ticker | Date | Rule | Detail |")
    lines.push("| --- | --- | --- | --- |")
    for (const item of input.violations.slice(0, 50)) {
      lines.push(`| ${item.ticker} | ${item.date} | ${item.rule} | ${item.detail.replaceAll("|", "/")} |`)
    }
    lines.push("")
  }
  lines.push("## Sample rows")
  lines.push("")
  for (const sample of input.samples) {
    lines.push(`### ${sample.ticker} ${sample.date} decision_ready=${sample.decision_ready}`)
    lines.push("")
    lines.push("```json")
    lines.push(JSON.stringify(sample, null, 2))
    lines.push("```")
    lines.push("")
  }
  return `${lines.join("\n")}\n`
}
