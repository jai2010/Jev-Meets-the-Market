import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { buildDemoDataset, weekdayDates } from "./demo"
import { RECORDED_REPLAY_PATH, type ReplayDataset } from "./types"

const cache = new Map<string, Promise<ReplayDataset>>()

export function loadReplayDataset(root = process.cwd()): Promise<ReplayDataset> {
  const key = resolve(root)
  const hit = cache.get(key)
  if (hit) return hit
  const pending = loadUncached(key)
  cache.set(key, pending)
  return pending
}

/** Test helper so fixture roots are not poisoned by a previous load. */
export function clearReplayDatasetCache() {
  cache.clear()
}

async function loadUncached(root: string): Promise<ReplayDataset> {
  const recordedPath = resolve(root, RECORDED_REPLAY_PATH)
  if (existsSync(recordedPath)) {
    const parsed = JSON.parse(readFileSync(recordedPath, "utf8")) as ReplayDataset
    if (parsed?.mode === "recorded" && Array.isArray(parsed.days) && parsed.days.length > 0 && parsed.experiment) {
      return parsed
    }
  }
  const { buildPartialV1Dataset } = await import("./partial-v1")
  const partial = await buildPartialV1Dataset(root)
  if (partial) return partial

  return buildDemoDataset(calendarDates(root))
}

function calendarDates(root: string): string[] {
  const path = resolve(root, "data/universe/trading_calendar.json")
  if (!existsSync(path)) return weekdayDates("2026-03-10", "2026-09-22")
  const file = JSON.parse(readFileSync(path, "utf8")) as { trading_dates?: string[] }
  const dates = (file.trading_dates ?? []).filter((date) => date >= "2026-03-10" && date <= "2026-09-22")
  return dates.length > 0 ? dates : weekdayDates("2026-03-10", "2026-09-22")
}
