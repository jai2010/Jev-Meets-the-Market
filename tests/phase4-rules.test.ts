import { describe, expect, it } from "vitest"
import {
  benchmarkValues,
  buyShares,
  emptyBook,
  executePlan,
  markToMarket,
  momentumSignals,
  planTrades,
  portfolioAction,
  randomTargets,
} from "../src/phase4/rules"

describe("phase 4 portfolio rules", () => {
  it("translates Jev actions without adding to a held position", () => {
    expect(portfolioAction("BUY", false)).toBe("BUY_CANDIDATE")
    expect(portfolioAction("BUY", true)).toBe("MAINTAIN")
    expect(portfolioAction("HOLD", true)).toBe("MAINTAIN")
    expect(portfolioAction("HOLD", false)).toBe("NONE")
    expect(portfolioAction("SELL", true)).toBe("SELL")
    expect(portfolioAction("SELL", false)).toBe("NONE")
    expect(portfolioAction("NO_ACTION", true)).toBe("NONE")
    expect(portfolioAction("DECISION_ERROR", false)).toBe("NONE")
  })

  it("sells before it sizes buys, and ranks buys by chosen-action probability then ticker", () => {
    const book = {
      cash: 400_000,
      positions: [{ ticker: "BBB", shares: 100, entryPrice: 100, entryDate: "d0" }],
    }
    const plan = planTrades({
      book,
      portfolioValue: 1_000_000,
      closes: { BBB: 100 },
      signals: [
        { ticker: "BBB", action: "SELL", chosenProbability: 0.4 },
        { ticker: "CCC", action: "BUY", chosenProbability: 0.7 },
        { ticker: "AAA", action: "BUY", chosenProbability: 0.7 },
        { ticker: "DDD", action: "BUY", chosenProbability: 0.9 },
        { ticker: "EEE", action: "BUY", chosenProbability: 0.2 },
        { ticker: "FFF", action: "BUY", chosenProbability: 0.1 },
        { ticker: "GGG", action: "HOLD", chosenProbability: 0.99 },
      ],
    })
    expect(plan.sells).toEqual(["BBB"])
    expect(plan.buys.map((order) => order.ticker)).toEqual(["DDD", "AAA", "CCC", "EEE", "FFF"])
    expect(plan.buys[0].notional).toBeLessThanOrEqual(200_000)
    expect(new Set(plan.buys.map((order) => order.notional)).size).toBe(1)
  })

  it("executes at the next open, keeps cash non-negative, and uses whole shares", () => {
    const plan = planTrades({
      book: emptyBook(1_000_000),
      portfolioValue: 1_000_000,
      closes: {},
      signals: [{ ticker: "AAA", action: "BUY", chosenProbability: 0.8 }],
    })
    plan.decisionDate = "d1"
    const { book, trades } = executePlan({
      book: emptyBook(1_000_000),
      plan,
      executionDate: "d2",
      opens: { AAA: 500 },
    })
    expect(trades[0].decisionDate).toBe("d1")
    expect(trades[0].executionDate).toBe("d2")
    expect(trades[0].executionDate > trades[0].decisionDate).toBe(true)
    expect(Number.isInteger(trades[0].shares)).toBe(true)
    expect(book.cash).toBeGreaterThanOrEqual(-1e-6)
    expect(trades[0].shares).toBe(buyShares(500, plan.buys[0].notional, 1_000_000))
    expect(plan.buys[0].notional).toBeLessThanOrEqual(200_000)
    const marked = markToMarket(book, { AAA: 510 })
    expect(marked.portfolioValue).toBeCloseTo(marked.cash + marked.marketValue, 6)
    expect(book.positions).toHaveLength(1)
  })

  it("does not free a buy slot when a planned sell cannot execute", () => {
    const book = {
      cash: 0,
      positions: [
        { ticker: "AAA", shares: 10, entryPrice: 100, entryDate: "d0" },
        { ticker: "BBB", shares: 10, entryPrice: 100, entryDate: "d0" },
        { ticker: "CCC", shares: 10, entryPrice: 100, entryDate: "d0" },
        { ticker: "DDD", shares: 10, entryPrice: 100, entryDate: "d0" },
        { ticker: "EEE", shares: 10, entryPrice: 100, entryDate: "d0" },
      ],
    }
    const plan = planTrades({
      book,
      portfolioValue: 1_000_000,
      closes: { AAA: 100, BBB: 100, CCC: 100, DDD: 100, EEE: 100 },
      signals: [
        { ticker: "AAA", action: "SELL", chosenProbability: 0.9 },
        { ticker: "FFF", action: "BUY", chosenProbability: 0.99 },
      ],
    })
    plan.decisionDate = "d1"
    const { book: next, trades } = executePlan({
      book,
      plan,
      executionDate: "d2",
      opens: { FFF: 100 },
    })
    expect(trades.some((trade) => trade.action === "SELL" && trade.ticker === "AAA")).toBe(false)
    expect(trades.some((trade) => trade.action === "BUY" && trade.ticker === "FFF")).toBe(false)
    expect(next.positions).toHaveLength(5)
    expect(next.positions.map((position) => position.ticker)).toEqual(["AAA", "BBB", "CCC", "DDD", "EEE"])
  })

  it("does not buy when Jev says BUY and the stock is already held", () => {
    const book = {
      cash: 800_000,
      positions: [{ ticker: "AAA", shares: 10, entryPrice: 100, entryDate: "d1" }],
    }
    const plan = planTrades({
      book,
      portfolioValue: 1_000_000,
      closes: { AAA: 100 },
      signals: [{ ticker: "AAA", action: "BUY", chosenProbability: 0.99 }],
    })
    expect(plan.buys).toEqual([])
    expect(plan.sells).toEqual([])
  })

  it("starts the benchmark at the initial capital and keeps momentum to five names", () => {
    expect(benchmarkValues([100, 110, 90])[0]).toBe(1_000_000)
    expect(benchmarkValues([100, 110])[1]).toBeCloseTo(1_100_000)
    const signals = momentumSignals(
      [
        { ticker: "BBB", return20d: 0.2 },
        { ticker: "AAA", return20d: 0.2 },
        { ticker: "CCC", return20d: 0.1 },
        { ticker: "DDD", return20d: 0.05 },
        { ticker: "EEE", return20d: 0.01 },
        { ticker: "FFF", return20d: -0.1 },
      ],
      [],
    )
    expect(signals.filter((signal) => signal.action === "BUY").map((signal) => signal.ticker).sort()).toEqual([
      "AAA",
      "BBB",
      "CCC",
      "DDD",
      "EEE",
    ])
    expect(randomTargets(["A", "B", "C", "D", "E", "F", "G"], "2026-04-01")).toEqual(
      randomTargets(["G", "A", "C", "B", "F", "E", "D"], "2026-04-01"),
    )
    expect(randomTargets(["A", "B", "C", "D", "E", "F", "G"], "2026-04-01")).toHaveLength(5)
  })
})
