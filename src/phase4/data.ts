import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import type { FeatureRow } from "../features/indicators"

export type Cell = {
  open: number | null
  close: number | null
  ready: boolean
  features: FeatureRow
}

export function tradingDates(root: string, start: string, end: string): string[] {
  const file = JSON.parse(readFileSync(resolve(root, "data/universe/trading_calendar.json"), "utf8")) as {
    trading_dates: string[]
  }
  return file.trading_dates.filter((date) => date >= start && date <= end)
}

export function benchmarkCloses(root: string, dates: string[]): number[] {
  const lines = readFileSync(resolve(root, "data/raw/ohlcv/CNX100.csv"), "utf8").trim().split("\n")
  const header = lines[0].split(",")
  const byDate = new Map<string, { close: number | null; high: number | null; low: number | null }>()
  for (const line of lines.slice(1)) {
    const cells = line.split(",")
    const record = Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]))
    const num = (name: string) => (record[name] === "" ? null : Number(record[name]))
    byDate.set(record.date, { close: num("close"), high: num("high"), low: num("low") })
  }
  return dates.map((date) => {
    const bar = byDate.get(date)
    if (!bar || bar.close == null || bar.high == null || bar.low == null || !(bar.high > bar.low) || !(bar.close > 0)) {
      throw new Error(`NIFTY 100 close is missing on ${date}`)
    }
    return bar.close
  })
}

export async function loadCells(root: string, start: string, end: string): Promise<Map<string, Cell>> {
  const instance = await DuckDBInstance.create(resolve(root, "data/processed/market.duckdb"), { access_mode: "READ_ONLY" })
  const connection = await instance.connect()
  try {
    const result = await connection.run(
      `SELECT * FROM stock_features WHERE date >= '${start}' AND date <= '${end}'`,
    )
    const rows = await result.getRowObjectsJson()
    const cells = new Map<string, Cell>()
    for (const row of rows) {
      const features = featureFrom(row)
      cells.set(`${features.date}|${features.ticker}`, {
        open: features.open,
        close: features.close,
        ready: row.decision_ready === true,
        features,
      })
    }
    return cells
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function bool(value: unknown): boolean | null {
  if (value === true || value === false) return value
  return null
}

function featureFrom(row: Record<string, unknown>): FeatureRow {
  return {
    date: String(row.date),
    ticker: String(row.ticker),
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close: num(row.close),
    volume: num(row.volume),
    return_1d: num(row.return_1d),
    return_5d: num(row.return_5d),
    return_20d: num(row.return_20d),
    return_60d: num(row.return_60d),
    sma_20: num(row.sma_20),
    sma_50: num(row.sma_50),
    sma_200: num(row.sma_200),
    above_sma20: bool(row.above_sma20),
    above_sma50: bool(row.above_sma50),
    above_sma200: bool(row.above_sma200),
    rsi_14: num(row.rsi_14),
    volatility_20d: num(row.volatility_20d),
    volume_avg_20d: num(row.volume_avg_20d),
    volume_ratio_20d: num(row.volume_ratio_20d),
    high_52w: num(row.high_52w),
    distance_from_52w_high: num(row.distance_from_52w_high),
    drawdown_20d: num(row.drawdown_20d),
    nifty_return_1d: num(row.nifty_return_1d),
    nifty_return_5d: num(row.nifty_return_5d),
    nifty_return_20d: num(row.nifty_return_20d),
    relative_return_5d: num(row.relative_return_5d),
    relative_return_20d: num(row.relative_return_20d),
    decision_ready: row.decision_ready === true,
  }
}
