import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { describe, expect, it } from "vitest"
import { loadReplayDataset } from "../src/replay/load"
import { benchmarkCloses, loadCells, tradingDates } from "../src/phase4/data"
import { MANIFEST_PATH, PHASE4_DB, START_DATE, END_DATE } from "../src/phase4/paths"
import { EXPERIMENT_ID, type Signal } from "../src/phase4/rules"
import { simulateAll } from "../src/phase4/simulate"

const root = resolve(import.meta.dirname, "..")

describe("phase 4 recorded experiment", () => {
  it("matches the frozen manifest, balances, and the replay file", async () => {
    const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST_PATH), "utf8")) as {
      status: string
      experiment_id: string
      start_date: string
      end_date: string
      manifest_sha256: string
    }
    const { manifest_sha256: sha, ...body } = manifest
    expect(manifest.status).toBe("FROZEN")
    expect(manifest.experiment_id).toBe(EXPERIMENT_ID)
    expect(manifest.start_date).toBe(START_DATE)
    expect(manifest.end_date).toBe(END_DATE)
    expect(sha).toBe(createHash("sha256").update(JSON.stringify(body)).digest("hex"))

    const replay = await loadReplayDataset(root)
    expect(replay.mode).toBe("recorded")
    expect(replay.experiment.id).toBe(EXPERIMENT_ID)
    expect(replay.days[0].date).toBe(START_DATE)
    expect(replay.days.at(-1)?.date).toBe(END_DATE)
    expect(replay.days[0].benchmarkValue).toBe(1_000_000)
    for (const day of replay.days) {
      expect(Math.abs(day.cash + day.investedValue - day.portfolioValue)).toBeLessThan(0.05)
      expect(day.positions.length).toBeLessThanOrEqual(5)
      expect(day.cash).toBeGreaterThanOrEqual(-0.05)
      for (const trade of day.tradesExecuted) expect(trade.executionDate > trade.decisionDate).toBe(true)
    }

    const dates = tradingDates(root, START_DATE, END_DATE)
    const cells = await loadCells(root, START_DATE, END_DATE)
    const signals = await loadSignals(resolve(root, PHASE4_DB))
    const records = await simulateAll({
      dates,
      benchmarkCloses: benchmarkCloses(root, dates),
      openOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.open ?? null,
      closeOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.close ?? null,
      momentumEligible: (date) =>
        [...cells.keys()].flatMap((key) => {
          if (!key.startsWith(`${date}|`)) return []
          const cell = cells.get(key)
          if (!cell?.ready || cell.features.return_20d == null) return []
          return [{ ticker: key.slice(date.length + 1), return20d: cell.features.return_20d }]
        }),
      randomEligible: (date) =>
        [...cells.keys()].flatMap((key) => (key.startsWith(`${date}|`) && cells.get(key)?.ready ? [key.slice(date.length + 1)] : [])),
      resolveJev: async (date) => signals.get(date) ?? [],
    })
    expect(records.at(-1)?.jev.portfolioValue).toBeCloseTo(replay.days.at(-1)!.portfolioValue, 2)
    expect(records[0].benchmarkValue).toBe(1_000_000)

    const phase3 = await DuckDBInstance.create(resolve(root, "data/processed/jev_decisions.duckdb"), { access_mode: "READ_ONLY" })
    const connection = await phase3.connect()
    const count = await (await connection.run("SELECT count(*) AS n FROM jev_decisions WHERE run_id = 'JEV-20260922-V1-PHASE3-TEST'")).getRowObjectsJson()
    connection.closeSync()
    phase3.closeSync()
    expect(Number(count[0].n)).toBe(31)
  }, 120000)
})

async function loadSignals(path: string): Promise<Map<string, Signal[]>> {
  const instance = await DuckDBInstance.create(path, { access_mode: "READ_ONLY" })
  const connection = await instance.connect()
  const rows = await (
    await connection.run(
      `SELECT decision_date, ticker, action, chosen_action_probability, status FROM decisions WHERE run_id = '${EXPERIMENT_ID}'`,
    )
  ).getRowObjectsJson()
  connection.closeSync()
  instance.closeSync()
  const grouped = new Map<string, Signal[]>()
  for (const row of rows) {
    const date = String(row.decision_date)
    const ticker = String(row.ticker)
    const status = String(row.status)
    const action = row.action == null ? null : String(row.action)
    const signal: Signal =
      status === "OK" && (action === "BUY" || action === "HOLD" || action === "SELL" || action === "NO_ACTION")
        ? { ticker, action, chosenProbability: row.chosen_action_probability == null ? null : Number(row.chosen_action_probability) }
        : { ticker, action: "DECISION_ERROR", chosenProbability: null }
    const list = grouped.get(date) ?? []
    list.push(signal)
    grouped.set(date, list)
  }
  for (const list of grouped.values()) list.sort((a, b) => a.ticker.localeCompare(b.ticker))
  return grouped
}
