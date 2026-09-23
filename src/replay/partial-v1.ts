import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { benchmarkCloses, loadCells, tradingDates, type Cell } from "../phase4/data"
import { INTERRUPTED_PHASE4_DB } from "../phase4/decisions"
import { PHASE4_DB, START_DATE } from "../phase4/paths"
import { EXPERIMENT_ID, INITIAL_CAPITAL, type Signal } from "../phase4/rules"
import { simulateAll, type DayRecord } from "../phase4/simulate"
import type { ReplayAction, ReplayDataset, ReplayDecision, ReplaySnapshot } from "./types"

/** Interrupted V1 artifact run id. Independent of the live Phase 4 experiment id. */
const INTERRUPTED_RUN_ID = "JEV-20260922-V1"

type StoredRow = {
  decision_date: string
  ticker: string
  action: string | null
  chosen_action_probability: number | null
  raw_confidence: number | null
  probabilities: Partial<Record<ReplayAction, number>> | null
  status: string
}

const ACTIONS: ReplayAction[] = ["BUY", "HOLD", "SELL", "NO_ACTION"]

/** Prefer the in-progress V2 decision log; fall back to the interrupted V1 artifact. */
export async function buildPartialV1Dataset(root: string): Promise<ReplayDataset | null> {
  return (
    (await buildPartialDataset(root, {
      dbRelativePath: PHASE4_DB,
      runId: EXPERIMENT_ID,
    })) ??
    (await buildPartialDataset(root, {
      dbRelativePath: INTERRUPTED_PHASE4_DB,
      runId: INTERRUPTED_RUN_ID,
    }))
  )
}

async function buildPartialDataset(
  root: string,
  input: { dbRelativePath: string; runId: string },
): Promise<ReplayDataset | null> {
  const sourceDb = resolve(root, input.dbRelativePath)
  if (!existsSync(sourceDb)) return null

  const tempDir = mkdtempSync(join(tmpdir(), "jev-partial-replay-"))
  const copyDb = join(tempDir, "jev_experiment.duckdb")
  try {
    copyFileSync(sourceDb, copyDb)
    const sourceWal = `${sourceDb}.wal`
    if (existsSync(sourceWal)) copyFileSync(sourceWal, `${copyDb}.wal`)

    const rows = await readDecisionRows(copyDb, input.runId)
    if (rows.length === 0) return null

    const byKey = new Map<string, StoredRow>()
    const datesWithDecisions = new Set<string>()
    for (const row of rows) {
      byKey.set(`${row.decision_date}|${row.ticker}`, row)
      datesWithDecisions.add(row.decision_date)
    }
    const lastDate = [...datesWithDecisions].sort().at(-1)!
    const dates = tradingDates(root, START_DATE, lastDate).filter((date) => date <= lastDate)
    if (dates.length === 0) return null

    const cells = await loadCells(root, START_DATE, lastDate)
    const benchmarks = benchmarkCloses(root, dates)
    const records = await simulateAll({
      dates,
      benchmarkCloses: benchmarks,
      openOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.open ?? null,
      closeOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.close ?? null,
      momentumEligible: () => [],
      randomEligible: () => [],
      resolveJev: async (date) => signalsForDate(date, cells, byKey),
    })

    return {
      mode: "partial",
      experiment: {
        id: input.runId,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        initialCapital: INITIAL_CAPITAL,
        universe: "NIFTY 100 (current)",
        maxPositions: 5,
        maxAllocation: 0.2,
        execution: "NEXT_OPEN",
        transactionCost: 0.001,
        slippage: 0.0005,
        model: "typesafe-ai/jev",
        promptVersion: "decision_schema_v1",
      },
      days: records.map((day) => snapshotFromRecord(day, dates, cells, byKey)),
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function readDecisionRows(copyDb: string, runId: string): Promise<StoredRow[]> {
  const instance = await DuckDBInstance.create(copyDb)
  const connection = await instance.connect()
  try {
    const result = await connection.run(
      `SELECT decision_date, ticker, action, chosen_action_probability, raw_confidence, probabilities_json, status
       FROM decisions
       WHERE run_id = ?
       ORDER BY decision_date, ticker`,
      [runId],
    )
    const rows = await result.getRowObjectsJson()
    return rows.map((row) => ({
      decision_date: String(row.decision_date),
      ticker: String(row.ticker),
      action: row.action == null ? null : String(row.action),
      chosen_action_probability: row.chosen_action_probability == null ? null : Number(row.chosen_action_probability),
      raw_confidence: row.raw_confidence == null ? null : Number(row.raw_confidence),
      probabilities: parseProbabilities(row.probabilities_json),
      status: String(row.status),
    }))
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}

function signalsForDate(date: string, cells: Map<string, Cell>, byKey: Map<string, StoredRow>): Signal[] {
  const tickers: string[] = []
  for (const [key, cell] of cells) {
    if (cell.ready && key.startsWith(`${date}|`)) tickers.push(key.slice(date.length + 1))
  }
  return tickers.sort().map((ticker) => {
    const row = byKey.get(`${date}|${ticker}`)
    if (!row || row.status !== "OK" || row.action == null) return { ticker, action: "DECISION_ERROR", chosenProbability: null }
    if (row.action !== "BUY" && row.action !== "HOLD" && row.action !== "SELL" && row.action !== "NO_ACTION") {
      return { ticker, action: "DECISION_ERROR", chosenProbability: null }
    }
    return { ticker, action: row.action, chosenProbability: row.chosen_action_probability }
  })
}

function snapshotFromRecord(
  day: DayRecord,
  dates: string[],
  cells: Map<string, Cell>,
  byKey: Map<string, StoredRow>,
): ReplaySnapshot {
  const index = dates.indexOf(day.date)
  const decisions = decisionsFor(day.date, index, dates, cells, byKey)
  const counts = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
  for (const decision of decisions) counts[decision.action] += 1
  return {
    date: day.date,
    dayNumber: day.dayNumber,
    stocksEvaluated: day.jev.signals.length,
    decisionCounts: counts,
    portfolioValue: day.jev.portfolioValue,
    cash: day.jev.cash,
    investedValue: day.jev.marketValue,
    benchmarkValue: day.benchmarkValue,
    positions: day.jev.positions.map((position) => {
      const close = cells.get(`${day.date}|${position.ticker}`)?.close ?? position.entryPrice
      return {
        ticker: position.ticker,
        value: position.shares * close,
        returnPct: position.entryPrice > 0 ? close / position.entryPrice - 1 : 0,
        daysHeld: Math.max(1, dates.indexOf(day.date) - dates.indexOf(position.entryDate) + 1),
      }
    }),
    highlightedDecisions: highlight(decisions),
    decisions,
    tradesExecuted: day.jev.trades.map((trade) => ({
      decisionDate: trade.decisionDate,
      executionDate: trade.executionDate,
      ticker: trade.ticker,
      action: trade.action,
      executionPrice: trade.executionPrice,
      shares: trade.shares,
      value: trade.netValue,
    })),
  }
}

function decisionsFor(
  date: string,
  index: number,
  dates: string[],
  cells: Map<string, Cell>,
  byKey: Map<string, StoredRow>,
): ReplayDecision[] {
  const decisions: ReplayDecision[] = []
  for (const [key, row] of byKey) {
    if (!key.startsWith(`${date}|`)) continue
    if (row.status !== "OK" || row.action == null) continue
    if (row.action !== "BUY" && row.action !== "HOLD" && row.action !== "SELL" && row.action !== "NO_ACTION") continue
    const cell = cells.get(key)
    decisions.push({
      ticker: row.ticker,
      action: row.action,
      price: cell?.close ?? 0,
      confidence: row.chosen_action_probability,
      rawConfidence: row.raw_confidence,
      probabilities: row.probabilities ?? undefined,
      rationale: null,
      return20d: cell?.features.return_20d ?? null,
      sparkline: sparkline(dates, cells, row.ticker, index),
    })
  }
  return decisions.sort((a, b) => a.ticker.localeCompare(b.ticker))
}

function highlight(decisions: ReplayDecision[]): ReplayDecision[] {
  const picked: ReplayDecision[] = []
  for (const action of ACTIONS) {
    const best = decisions
      .filter((decision) => decision.action === action)
      .sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1) || a.ticker.localeCompare(b.ticker))[0]
    if (best) picked.push(best)
  }
  return picked.slice(0, 4)
}

function sparkline(dates: string[], cells: Map<string, Cell>, ticker: string, index: number): number[] {
  const values: number[] = []
  for (let cursor = Math.max(0, index - 11); cursor <= index; cursor += 1) {
    const close = cells.get(`${dates[cursor]}|${ticker}`)?.close
    if (close != null && close > 0) values.push(close)
  }
  return values
}

function parseProbabilities(value: unknown): Partial<Record<ReplayAction, number>> | null {
  if (value == null || value === "") return null
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as Partial<Record<ReplayAction, number>>
  } catch {
    return null
  }
}
