import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Bar } from "./indicators"

export type UniverseFile = {
  label: string
  symbols: { nse_symbol: string; yahoo_symbol: string; name: string }[]
  benchmark: { yahoo_symbol: string; cache_file: string }
}

export function readUniverse(root: string): UniverseFile {
  return JSON.parse(readFileSync(join(root, "config/universe.json"), "utf8")) as UniverseFile
}

export function readCalendar(root: string): string[] {
  const file = JSON.parse(readFileSync(join(root, "data/universe/trading_calendar.json"), "utf8")) as {
    trading_dates: string[]
  }
  return file.trading_dates
}

export function readBars(path: string): Map<string, Bar> {
  const lines = readFileSync(path, "utf8").trim().split("\n")
  const header = lines[0].split(",")
  const byDate = new Map<string, Bar>()
  for (const line of lines.slice(1)) {
    const cells = line.split(",")
    const record = Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]))
    const num = (name: string) => (record[name] === "" ? null : Number(record[name]))
    byDate.set(record.date, {
      open: num("open"),
      high: num("high"),
      low: num("low"),
      close: num("close"),
      volume: num("volume"),
    })
  }
  return byDate
}

export function alignBars(calendar: string[], byDate: Map<string, Bar>): (Bar | null)[] {
  return calendar.map((date) => byDate.get(date) ?? null)
}
