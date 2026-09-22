import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { maxDrawdown, returnFrom } from "../replay/engine"
import type { ReplayAction, ReplayDataset, ReplayDecision } from "../replay/types"
import type { Cell } from "./data"
import { EXPERIMENT_JSON, REPORT_PATH } from "./paths"
import type { ResumeDecision as Saved } from "./decisions"
import { EXPERIMENT_ID, INITIAL_CAPITAL } from "./rules"
import type { DayRecord } from "./simulate"

const ACTIONS: ReplayAction[] = ["BUY", "HOLD", "SELL", "NO_ACTION"]

export function publish(input: {
  root: string
  dates: string[]
  cells: Map<string, Cell>
  records: DayRecord[]
  saved: Map<string, Saved>
  manifest: unknown
}) {
  const dataset = toReplayDataset(input)
  mkdirSync(dirname(resolve(input.root, EXPERIMENT_JSON)), { recursive: true })
  writeFileSync(resolve(input.root, EXPERIMENT_JSON), `${JSON.stringify(dataset, null, 2)}\n`)
  writeFileSync(resolve(input.root, REPORT_PATH), renderReport(input, dataset))
}

function toReplayDataset(input: {
  dates: string[]
  cells: Map<string, Cell>
  records: DayRecord[]
  saved: Map<string, Saved>
}): ReplayDataset & { snapshots: unknown[]; equityCurve: unknown[] } {
  const days = input.records.map((day) => {
    const decisions = decisionsFor(day, input)
    const counts = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
    for (const decision of decisions) {
      if (decision.action === "BUY" || decision.action === "HOLD" || decision.action === "SELL" || decision.action === "NO_ACTION") {
        counts[decision.action] += 1
      }
    }
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
        const close = input.cells.get(`${day.date}|${position.ticker}`)?.close ?? position.entryPrice
        return {
          ticker: position.ticker,
          value: position.shares * close,
          returnPct: position.entryPrice > 0 ? close / position.entryPrice - 1 : 0,
          daysHeld: Math.max(1, input.dates.indexOf(day.date) - input.dates.indexOf(position.entryDate) + 1),
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
  })
  return {
    mode: "recorded",
    experiment: {
      id: EXPERIMENT_ID,
      startDate: input.dates[0],
      endDate: input.dates[input.dates.length - 1],
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
    days,
    snapshots: days,
    equityCurve: input.records.map((day) => ({
      date: day.date,
      jev_portfolio_value: day.jev.portfolioValue,
      nifty100_value: day.benchmarkValue,
      momentum_value: day.momentumValue,
      random_value: day.randomValue,
    })),
  }
}

function decisionsFor(day: DayRecord, input: { dates: string[]; cells: Map<string, Cell>; saved: Map<string, Saved> }): ReplayDecision[] {
  const index = input.dates.indexOf(day.date)
  return day.jev.signals
    .filter((signal) => signal.action !== "DECISION_ERROR")
    .map((signal) => {
      const saved = input.saved.get(`${day.date}|${signal.ticker}`)
      const cell = input.cells.get(`${day.date}|${signal.ticker}`)
      return {
        ticker: signal.ticker,
        action: signal.action as ReplayAction,
        price: cell?.close ?? 0,
        confidence: saved?.chosen ?? null,
        rawConfidence: saved?.rawConfidence ?? null,
        probabilities: saved?.probabilities ?? undefined,
        rationale: null,
        return20d: cell?.features.return_20d ?? null,
        sparkline: sparkline(input, signal.ticker, index),
      }
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
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

function sparkline(input: { dates: string[]; cells: Map<string, Cell> }, ticker: string, index: number): number[] {
  const values: number[] = []
  for (let cursor = Math.max(0, index - 11); cursor <= index; cursor += 1) {
    const close = input.cells.get(`${input.dates[cursor]}|${ticker}`)?.close
    if (close != null && close > 0) values.push(close)
  }
  return values
}

function renderReport(input: { dates: string[]; cells: Map<string, Cell>; records: DayRecord[]; saved: Map<string, Saved> }, dataset: ReplayDataset): string {
  const last = input.records[input.records.length - 1]
  const values = input.records.map((day) => day.jev.portfolioValue)
  const drawdown = maxDrawdown(values)
  const trades = input.records.flatMap((day) => day.jev.trades)
  const savedRows = [...input.saved.values()]
  const ok = savedRows.filter((row) => row.status === "OK")
  const failed = savedRows.filter((row) => row.status !== "OK")
  const latencies = ok.map((row) => row.latencyMs).filter((value) => value > 0)
  const counts = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
  for (const row of ok) {
    if (row.action === "BUY" || row.action === "HOLD" || row.action === "SELL" || row.action === "NO_ACTION") counts[row.action] += 1
  }
  const chosen = ok.map((row) => row.chosen).filter((value): value is number => value != null)
  const utilization = input.records.map((day) => (day.jev.portfolioValue === 0 ? 0 : day.jev.marketValue / day.jev.portfolioValue))
  const holding = holdingPeriods(input.records)
  const lines = [
    "# Phase 4 Jev experiment",
    "",
    `Experiment ID: ${dataset.experiment.id}`,
    "",
    "This report records what the frozen methodology produced. It does not judge whether the result was good or bad, and it is not an investment recommendation.",
    "",
    "## Experiment configuration",
    "",
    "- Status: FROZEN before the first Jev call. The manifest was not edited afterward.",
    `- Window: ${input.dates[0]} to ${input.dates[input.dates.length - 1]}`,
    "- Universe: current NIFTY 100 list from Phase 1. Membership was not changed.",
    "- Capital: ₹10,00,000. Maximum 5 positions. Purchase notional capped at 20% of the decision-day portfolio value.",
    "- Buys on names already held do not add shares.",
    "- Sells are applied before new buys. Execution is the next session open. Marks use the session close.",
    "- Transaction cost: 10 bps. Slippage: 5 bps.",
    "- Model: typesafe-ai/jev. Prompt: decision_schema_v1.",
    "- An unresolved Jev call stops the run. It is not stored and it is not treated as NO_ACTION.",
    "- Benchmark: NIFTY 100 close, scaled so the start date equals ₹10,00,000.",
    "- Momentum baseline: top 5 decision-ready names by 20-day return, equal weight, same costs and execution. One random baseline, seed 20260922.",
    "- Price drift after purchase is not trimmed back to 20%.",
    "",
    "## Data quality",
    "",
    "Features are the Phase 2 point-in-time set. `close` is used, not `adj_close`. Names that are not decision-ready on a date are not sent to Jev. A held name with no decision that day is left unchanged.",
    "",
    "The universe is the current NIFTY 100, applied backward. That is survivorship bias. It was not corrected during the run.",
    "",
    "Yahoo Finance is the price source. One known traded gap remains in that cache: Vedanta on 2026-04-30, where the close fell about 65% and no split was recorded.",
    "",
    "## Execution summary",
    "",
    `- Trading sessions: ${input.records.length}`,
    `- Jev calls stored: ${input.saved.size}`,
    `- Successful calls: ${ok.length}`,
    `- Failed calls: ${failed.length}`,
    `- Calls with more than one attempt: ${savedRows.filter((row) => row.attempts > 1).length}`,
    `- Mean latency of successful calls: ${latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : "n/a"} ms`,
    "",
    "Latency is recorded as an operational fact. It is not a score.",
    "",
    "## Portfolio result",
    "",
    `- Starting capital: ₹${fmt(INITIAL_CAPITAL)}`,
    `- Final value: ₹${fmt(last.jev.portfolioValue)}`,
    `- Total return: ${pct(returnFrom(INITIAL_CAPITAL, last.jev.portfolioValue))}`,
    `- Max drawdown: ${pct(drawdown)}`,
    `- Trades: ${trades.length}`,
    `- Average holding period: ${holding.length ? (holding.reduce((sum, value) => sum + value, 0) / holding.length).toFixed(1) : "n/a"} sessions`,
    `- Mean cash invested fraction: ${pct(mean(utilization))}`,
    "",
    "## Benchmark",
    "",
    `- NIFTY 100 final value: ₹${fmt(last.benchmarkValue)}`,
    `- NIFTY 100 return: ${pct(returnFrom(INITIAL_CAPITAL, last.benchmarkValue))}`,
    `- Momentum baseline final value: ₹${fmt(last.momentumValue)}`,
    `- Momentum baseline return: ${pct(returnFrom(INITIAL_CAPITAL, last.momentumValue))}`,
    `- Random baseline final value: ₹${fmt(last.randomValue)}`,
    `- Random baseline return: ${pct(returnFrom(INITIAL_CAPITAL, last.randomValue))}`,
    `- Difference, Jev minus NIFTY 100: ${((returnFrom(INITIAL_CAPITAL, last.jev.portfolioValue) - returnFrom(INITIAL_CAPITAL, last.benchmarkValue)) * 100).toFixed(2)} percentage points`,
    "",
    "## Decision statistics",
    "",
    `- BUY: ${counts.BUY}`,
    `- HOLD: ${counts.HOLD}`,
    `- SELL: ${counts.SELL}`,
    `- NO_ACTION: ${counts.NO_ACTION}`,
    `- Mean chosen-action probability: ${chosen.length ? mean(chosen).toFixed(3) : "n/a"}`,
    "",
    "Chosen-action probability is the probability on the action Jev selected. The raw confidence field is stored separately and is not this number.",
    "",
    "## BUY analysis",
    "",
    "Subsequent close-to-close returns after a BUY decision. These were not available to Jev.",
    "",
    forwardTable(input, "BUY"),
    "",
    "## SELL analysis",
    "",
    "Subsequent close-to-close returns after a SELL decision.",
    "",
    forwardTable(input, "SELL"),
    "",
    "## Confidence buckets",
    "",
    "Buckets use the chosen-action probability of BUY decisions. The cell is the mean subsequent 20-session return. Empty buckets are reported as empty. This is not a calibration test.",
    "",
    bucketTable(input),
    "",
    "## Limitations",
    "",
    "- The current NIFTY 100 universe introduces survivorship bias.",
    "- Six months is a short historical period.",
    "- Yahoo Finance is an experimental data source.",
    "- Transaction cost and slippage are flat assumptions.",
    "- This is a historical simulation, not live trading.",
    "- Historical results do not establish future performance.",
    "",
  ]
  return `${lines.join("\n")}\n`
}

function forwardTable(input: { dates: string[]; cells: Map<string, Cell>; saved: Map<string, Saved> }, action: string): string {
  const horizons = [1, 5, 20]
  const rows = horizons.map((horizon) => {
    const values = forwardValues(input, action, horizon)
    return `| ${horizon} session | ${values.length} | ${values.length ? pct(mean(values)) : "n/a"} |`
  })
  return ["| Horizon | Decisions with a later close | Mean return |", "| --- | ---: | ---: |", ...rows].join("\n")
}

function bucketTable(input: { dates: string[]; cells: Map<string, Cell>; saved: Map<string, Saved> }): string {
  const buckets = [
    [0, 0.4, "<0.40"],
    [0.4, 0.5, "0.40–0.49"],
    [0.5, 0.6, "0.50–0.59"],
    [0.6, 0.7, "0.60–0.69"],
    [0.7, 0.8, "0.70–0.79"],
    [0.8, 0.9, "0.80–0.89"],
    [0.9, 1.01, "0.90–1.00"],
  ] as const
  const lines = ["| Chosen-action probability | BUY decisions | Mean 20-session return |", "| --- | ---: | ---: |"]
  for (const [low, high, label] of buckets) {
    const sample = [...input.saved.entries()].filter(([, row]) => {
      return row.status === "OK" && row.action === "BUY" && row.chosen != null && row.chosen >= low && row.chosen < high
    })
    const returns = sample.flatMap(([key]) => {
      const [date, ticker] = key.split("|")
      const value = forwardOne(input, ticker, date, 20)
      return value == null ? [] : [value]
    })
    lines.push(`| ${label} | ${sample.length} | ${returns.length ? pct(mean(returns)) : "n/a"} |`)
  }
  return lines.join("\n")
}

function forwardValues(input: { dates: string[]; cells: Map<string, Cell>; saved: Map<string, Saved> }, action: string, horizon: number): number[] {
  const values: number[] = []
  for (const [key, row] of input.saved) {
    if (row.status !== "OK" || row.action !== action) continue
    const [date, ticker] = key.split("|")
    const value = forwardOne(input, ticker, date, horizon)
    if (value != null) values.push(value)
  }
  return values
}

function forwardOne(input: { dates: string[]; cells: Map<string, Cell> }, ticker: string, date: string, horizon: number): number | null {
  const index = input.dates.indexOf(date)
  if (index < 0 || index + horizon >= input.dates.length) return null
  const start = input.cells.get(`${date}|${ticker}`)?.close
  const end = input.cells.get(`${input.dates[index + horizon]}|${ticker}`)?.close
  if (start == null || end == null || start <= 0 || end <= 0) return null
  return end / start - 1
}

function holdingPeriods(records: DayRecord[]): number[] {
  const opened = new Map<string, number>()
  const periods: number[] = []
  records.forEach((day, index) => {
    for (const trade of day.jev.trades) {
      if (trade.action === "BUY") opened.set(trade.ticker, index)
      if (trade.action === "SELL" && opened.has(trade.ticker)) {
        periods.push(index - (opened.get(trade.ticker) as number))
        opened.delete(trade.ticker)
      }
    }
  })
  for (const start of opened.values()) periods.push(records.length - 1 - start)
  return periods
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString("en-IN")
}
