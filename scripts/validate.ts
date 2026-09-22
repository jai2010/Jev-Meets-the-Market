import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DuckDBInstance } from "@duckdb/node-api"
import { DB_PATH } from "../src/features/constants"
import type { FeatureRow } from "../src/features/indicators"
import { alignBars, readBars, readCalendar, readUniverse } from "../src/features/load"
import { validateFeatures } from "../src/features/validate"

async function main() {
  const root = fileURLToPath(new URL("..", import.meta.url))
  const universe = readUniverse(root)
  const calendar = readCalendar(root)
  const benchmarkBars = alignBars(calendar, readBars(resolve(root, universe.benchmark.cache_file)))
  const instance = await DuckDBInstance.create(resolve(root, DB_PATH))
  const connection = await instance.connect()
  const result = await connection.run("SELECT * FROM stock_features ORDER BY ticker, date")
  const stored = (await result.getRowObjectsJson()) as FeatureRow[]
  connection.closeSync()
  instance.closeSync()

  const byTicker = new Map<string, FeatureRow[]>()
  for (const row of stored) {
    const list = byTicker.get(row.ticker) ?? []
    list.push(row)
    byTicker.set(row.ticker, list)
  }

  const stocks = universe.symbols.map((symbol) => ({
    ticker: symbol.nse_symbol,
    bars: alignBars(calendar, readBars(resolve(root, "data/raw/ohlcv", `${symbol.nse_symbol}.csv`))),
    rows: byTicker.get(symbol.nse_symbol) ?? [],
  }))

  const violations = validateFeatures({ calendar, benchmarkBars, stocks })
  writeFileSync(
    resolve(root, "results/phase2_validation.json"),
    `${JSON.stringify({ ok: violations.length === 0, count: violations.length, violations: violations.slice(0, 50) }, null, 2)}\n`,
  )
  if (violations.length > 0) {
    const first = violations[0]
    console.error(`FAIL ${violations.length} violation(s). First: ${first.ticker} ${first.date} ${first.rule} ${first.detail}`)
    process.exit(1)
  }
  console.log(`PASS ${stored.length} feature rows, ${universe.symbols.length} stocks, ${calendar.length} sessions`)
}

main()
