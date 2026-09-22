import type { ReplayAction, ReplayDataset, ReplayDecision, ReplaySnapshot } from "./types"

const SAMPLE = ["RELIANCE", "HDFCBANK", "ITC", "INFY", "ADANIGREEN", "TCS", "SBIN", "LT"] as const

/** Deterministic preview series. Not a backtest and not a Jev response. */
export function demoPortfolioValue(index: number, initial: number): number {
  return Math.round(initial * (1 + 0.00035 * index))
}

export function demoBenchmarkValue(index: number, initial: number): number {
  return Math.round(initial * (1 + 0.00015 * index))
}

export function weekdayDates(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function buildDemoDataset(dates: string[]): ReplayDataset {
  if (dates.length === 0) throw new Error("demo replay needs at least one date")
  const initialCapital = 1_000_000
  const days: ReplaySnapshot[] = dates.map((date, index) => {
    const portfolioValue = demoPortfolioValue(index, initialCapital)
    const benchmarkValue = demoBenchmarkValue(index, initialCapital)
    const investedValue = Math.round(portfolioValue * 0.75)
    const cash = portfolioValue - investedValue
    const decisionCounts = countsFor(index)
    const decisions = decisionsFor(index)
    const next = dates[index + 1]
    return {
      date,
      dayNumber: index + 1,
      stocksEvaluated: 100,
      decisionCounts,
      portfolioValue,
      cash,
      investedValue,
      benchmarkValue,
      positions: positionsFor(index, investedValue),
      highlightedDecisions: decisions.slice(0, 4),
      decisions,
      tradesExecuted:
        next && index % 3 === 0
          ? [
              {
                decisionDate: date,
                executionDate: next,
                ticker: SAMPLE[index % SAMPLE.length],
                action: index % 2 === 0 ? "BUY" : "SELL",
                executionPrice: 1000 + index,
                shares: 10,
                value: (1000 + index) * 10,
              },
            ]
          : [],
    }
  })

  return {
    mode: "demo",
    experiment: {
      id: "DEMO-NOT-A-BACKTEST",
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      initialCapital,
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
  }
}

function countsFor(index: number): Record<ReplayAction, number> {
  const buy = 20 + (index % 11)
  const sell = 5 + (index % 7)
  const hold = 40 + (index % 5)
  const noAction = 100 - buy - sell - hold
  return { BUY: buy, HOLD: hold, SELL: sell, NO_ACTION: noAction }
}

function decisionsFor(index: number): ReplayDecision[] {
  const actions: ReplayAction[] = ["BUY", "HOLD", "SELL", "NO_ACTION"]
  return SAMPLE.map((ticker, offset) => {
    const action = actions[(index + offset) % actions.length]
    const confidence = 0.55 + ((index + offset * 3) % 40) / 100
    const price = 1000 + offset * 250 + index
    return {
      ticker,
      action,
      price,
      confidence,
      rawConfidence: null,
      rationale: null,
      return20d: ((index + offset) % 9 - 4) / 100,
      sparkline: spark(index * 8 + offset),
      probabilities: {
        BUY: action === "BUY" ? confidence : (1 - confidence) / 3,
        HOLD: action === "HOLD" ? confidence : (1 - confidence) / 3,
        SELL: action === "SELL" ? confidence : (1 - confidence) / 3,
        NO_ACTION: action === "NO_ACTION" ? confidence : (1 - confidence) / 3,
      },
    }
  })
}

function positionsFor(index: number, invested: number) {
  const names = [SAMPLE[index % SAMPLE.length], SAMPLE[(index + 1) % SAMPLE.length], SAMPLE[(index + 2) % SAMPLE.length]]
  const value = Math.round(invested / names.length)
  return names.map((ticker, offset) => ({
    ticker,
    value,
    returnPct: ((index + offset) % 7 - 2) / 100,
    daysHeld: 4 + ((index + offset) % 18),
  }))
}

function spark(seed: number): number[] {
  let value = 40 + (seed % 30)
  return Array.from({ length: 12 }, () => {
    value = 80 + ((value * 17 + seed) % 40)
    return value
  })
}
