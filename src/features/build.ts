import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { DB_PATH, PARQUET_PATH, REPORT_PATH, SUMMARY_PATH } from "./constants"
import { computeStockFeatures, type FeatureRow } from "./indicators"
import { alignBars, readBars, readCalendar, readUniverse } from "./load"
import { renderMarkdown, summarize } from "./report"
import { validateFeatures } from "./validate"

const COLUMNS = [
  "date",
  "ticker",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "return_1d",
  "return_5d",
  "return_20d",
  "return_60d",
  "sma_20",
  "sma_50",
  "sma_200",
  "above_sma20",
  "above_sma50",
  "above_sma200",
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
  "decision_ready",
] as const

function sqlPath(path: string): string {
  return path.replaceAll("'", "''")
}

async function writeDatabase(root: string, rows: FeatureRow[]) {
  const dbPath = join(root, DB_PATH)
  const parquetPath = join(root, PARQUET_PATH)
  mkdirSync(dirname(dbPath), { recursive: true })
  rmSync(dbPath, { force: true })
  rmSync(`${dbPath}.wal`, { force: true })

  const instance = await DuckDBInstance.create(dbPath)
  const connection = await instance.connect()
  await connection.run(`
    CREATE TABLE stock_features (
      date VARCHAR,
      ticker VARCHAR,
      open DOUBLE,
      high DOUBLE,
      low DOUBLE,
      close DOUBLE,
      volume DOUBLE,
      return_1d DOUBLE,
      return_5d DOUBLE,
      return_20d DOUBLE,
      return_60d DOUBLE,
      sma_20 DOUBLE,
      sma_50 DOUBLE,
      sma_200 DOUBLE,
      above_sma20 BOOLEAN,
      above_sma50 BOOLEAN,
      above_sma200 BOOLEAN,
      rsi_14 DOUBLE,
      volatility_20d DOUBLE,
      volume_avg_20d DOUBLE,
      volume_ratio_20d DOUBLE,
      high_52w DOUBLE,
      distance_from_52w_high DOUBLE,
      drawdown_20d DOUBLE,
      nifty_return_1d DOUBLE,
      nifty_return_5d DOUBLE,
      nifty_return_20d DOUBLE,
      relative_return_5d DOUBLE,
      relative_return_20d DOUBLE,
      decision_ready BOOLEAN
    )
  `)
  const appender = await connection.createAppender("stock_features")
  for (const row of rows) {
    for (const column of COLUMNS) {
      const value = row[column]
      if (typeof value === "boolean") appender.appendBoolean(value)
      else if (typeof value === "string") appender.appendVarchar(value)
      else if (value == null) appender.appendNull()
      else appender.appendDouble(value)
    }
    appender.endRow()
  }
  appender.closeSync()
  await connection.run(`COPY stock_features TO '${sqlPath(parquetPath)}' (FORMAT PARQUET)`)
  const check = await connection.run("SELECT count(*) AS n, count(*) FILTER (WHERE decision_ready) AS ready FROM stock_features")
  const [count] = await check.getRowObjectsJson()
  connection.closeSync()
  instance.closeSync()
  return { rows: Number(count.n), ready: Number(count.ready) }
}

function sampleRows(rows: FeatureRow[]): FeatureRow[] {
  const picks: FeatureRow[] = []
  const readyReliance = rows.find((row) => row.ticker === "RELIANCE" && row.decision_ready)
  const readyHdfc = rows.find((row) => row.ticker === "HDFCBANK" && row.decision_ready)
  const early = rows.find((row) => row.ticker === "RELIANCE" && row.date === rows.find((item) => item.ticker === "RELIANCE")?.date)
  if (early) picks.push(early)
  if (readyReliance) picks.push(readyReliance)
  if (readyHdfc) picks.push(readyHdfc)
  return picks
}

export async function buildFeatures(root: string) {
  const universe = readUniverse(root)
  const calendar = readCalendar(root)
  const benchmark = alignBars(calendar, readBars(join(root, universe.benchmark.cache_file)))
  const stocks = universe.symbols.map((symbol) => {
    const bars = alignBars(calendar, readBars(join(root, "data/raw/ohlcv", `${symbol.nse_symbol}.csv`)))
    const rows = computeStockFeatures({
      ticker: symbol.nse_symbol,
      dates: calendar,
      bars,
      benchmarkBars: benchmark,
    })
    return { ticker: symbol.nse_symbol, bars, rows }
  })
  const rows = stocks.flatMap((stock) => stock.rows)
  const violations = validateFeatures({ calendar, benchmarkBars: benchmark, stocks })
  const summary = summarize(rows, violations)
  const generatedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })

  let databaseNote = "not written"
  if (violations.length === 0) {
    const stored = await writeDatabase(root, rows)
    if (stored.rows !== rows.length || stored.ready !== summary.decision_ready_rows) {
      throw new Error(`DuckDB count ${stored.rows}/${stored.ready} does not match computed ${rows.length}/${summary.decision_ready_rows}`)
    }
    databaseNote = DB_PATH
  }

  const markdown = renderMarkdown({
    generatedAt,
    summary,
    violations,
    samples: sampleRows(rows),
    database: databaseNote,
  })
  mkdirSync(join(root, "results"), { recursive: true })
  writeFileSync(join(root, REPORT_PATH), markdown)
  writeFileSync(
    join(root, SUMMARY_PATH),
    `${JSON.stringify(
      {
        phase: 2,
        generated_at_ist: generatedAt,
        jev_called: false,
        universe_label: universe.label,
        database: databaseNote,
        parquet: violations.length === 0 ? PARQUET_PATH : null,
        price_field: "close",
        adj_close_used: false,
        high_52w_sessions: 252,
        ...summary,
        violation_sample: violations.slice(0, 20),
      },
      null,
      2,
    )}\n`,
  )
  return { summary, violations, database: databaseNote }
}
