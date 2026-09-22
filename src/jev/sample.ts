import type { FeatureRow } from "../features/indicators"

export type Archetype = "near_high" | "oversold" | "uptrend" | "downtrend" | "sideways"

export type SelectedStock = { ticker: string; archetype: Archetype }

/**
 * Dates are five quantiles of sessions where at least 90 names are decision-ready.
 * Stocks are chosen on the middle date, each ticker at most once, in this order:
 * near_high, oversold, uptrend, downtrend, sideways. Ties break by ticker.
 */
export function selectSample(rows: FeatureRow[]): {
  dates: string[]
  stocks: SelectedStock[]
  cases: { date: string; ticker: string; archetype: Archetype; row: FeatureRow }[]
} {
  const ready = rows.filter((row) => row.decision_ready)
  const byDate = new Map<string, FeatureRow[]>()
  for (const row of ready) {
    const list = byDate.get(row.date) ?? []
    list.push(row)
    byDate.set(row.date, list)
  }
  const eligibleDates = [...byDate.keys()].filter((date) => (byDate.get(date)?.length ?? 0) >= 90).sort()
  const dates = quantileDates(eligibleDates)
  const common = tickersReadyOnEveryDate(ready, dates)
  const referenceDate = dates[2]
  const reference = ready.filter((row) => row.date === referenceDate && common.has(row.ticker))
  const stocks = pickStocks(reference)
  const rowByKey = new Map(ready.map((row) => [`${row.date}|${row.ticker}`, row]))
  const cases = dates.flatMap((date) =>
    stocks.map((stock) => {
      const row = rowByKey.get(`${date}|${stock.ticker}`)
      if (!row) throw new Error(`missing decision-ready row ${stock.ticker} ${date}`)
      return { date, ticker: stock.ticker, archetype: stock.archetype, row }
    }),
  )
  return { dates, stocks, cases }
}

function quantileDates(dates: string[]): string[] {
  if (dates.length < 5) throw new Error(`need 5 eligible dates, found ${dates.length}`)
  const indexes = [0, 0.25, 0.5, 0.75, 1].map((point) => Math.round((dates.length - 1) * point))
  const picked = [...new Set(indexes.map((index) => dates[index]))]
  if (picked.length !== 5) throw new Error(`date quantiles collapsed to ${picked.join(", ")}`)
  return picked
}

function tickersReadyOnEveryDate(rows: FeatureRow[], dates: string[]): Set<string> {
  const counts = new Map<string, number>()
  const wanted = new Set(dates)
  for (const row of rows) {
    if (!wanted.has(row.date)) continue
    counts.set(row.ticker, (counts.get(row.ticker) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count === dates.length).map(([ticker]) => ticker))
}

function pickStocks(rows: FeatureRow[]): SelectedStock[] {
  const chosen = new Set<string>()
  const take = (archetype: Archetype, pool: FeatureRow[], score: (row: FeatureRow) => number, direction: "asc" | "desc") => {
    const ranked = pool
      .filter((row) => !chosen.has(row.ticker))
      .sort((a, b) => {
        const delta = score(a) - score(b)
        if (delta !== 0) return direction === "asc" ? delta : -delta
        return a.ticker.localeCompare(b.ticker)
      })
    const winner = ranked[0]
    if (!winner) throw new Error(`no stock matched archetype ${archetype}`)
    chosen.add(winner.ticker)
    return { ticker: winner.ticker, archetype }
  }

  const nearHigh = take("near_high", rows, (row) => row.distance_from_52w_high ?? -Infinity, "desc")
  const oversold = take("oversold", rows, (row) => row.rsi_14 ?? Infinity, "asc")
  const upPool = rows.filter((row) => row.above_sma200 === true && (row.return_60d ?? 0) > 0)
  const uptrend = take("uptrend", upPool.length ? upPool : rows, (row) => row.return_60d ?? -Infinity, "desc")
  const downPool = rows.filter((row) => row.above_sma200 === false)
  const downtrend = take("downtrend", downPool.length ? downPool : rows, (row) => row.return_60d ?? Infinity, "asc")
  const sidePool = rows.filter((row) => row.rsi_14 != null && row.rsi_14 >= 40 && row.rsi_14 <= 60)
  const sideways = take(
    "sideways",
    sidePool.length ? sidePool : rows,
    (row) => Math.abs(row.return_20d ?? Number.POSITIVE_INFINITY),
    "asc",
  )
  return [nearHigh, oversold, uptrend, downtrend, sideways]
}
