import { describe, expect, it } from "vitest"
import type { FeatureRow } from "../src/features/indicators"
import { parseDecision } from "../src/jev/client"
import { canonicalJson, inputHash } from "../src/jev/hash"
import { selectSample } from "../src/jev/sample"
import { heldTickers, marketState, portfolioState } from "../src/jev/state"

function row(partial: Partial<FeatureRow> & Pick<FeatureRow, "date" | "ticker">): FeatureRow {
  return {
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1_000,
    return_1d: 0,
    return_5d: 0,
    return_20d: 0.1,
    return_60d: 0,
    sma_20: 100,
    sma_50: 100,
    sma_200: 100,
    above_sma20: true,
    above_sma50: true,
    above_sma200: true,
    rsi_14: 50,
    volatility_20d: 0.01,
    volume_avg_20d: 1_000,
    volume_ratio_20d: 1,
    high_52w: 110,
    distance_from_52w_high: -0.1,
    drawdown_20d: -0.01,
    nifty_return_1d: 0,
    nifty_return_5d: 0,
    nifty_return_20d: 0,
    relative_return_5d: 0,
    relative_return_20d: 0,
    decision_ready: true,
    ...partial,
  }
}

describe("decision parsing", () => {
  it("keeps a native probability distribution", () => {
    const parsed = parseDecision({
      answers: {
        action: {
          type: "choice",
          choice: "HOLD",
          probabilities: { BUY: 0.1, HOLD: 0.7, SELL: 0.05, NO_ACTION: 0.15 },
        },
      },
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.action).toBe("HOLD")
      expect(parsed.confidence).toBe(0.7)
    }
  })

  it("rejects an action outside the four choices", () => {
    const parsed = parseDecision({ answers: { action: { choice: "STRONG_BUY", probabilities: {} } } })
    expect(parsed.ok).toBe(false)
  })

  it("does not invent probabilities when Jev omits them", () => {
    const parsed = parseDecision({ answers: { action: { type: "choice", choice: "NO_ACTION" } } })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.probabilities).toBeNull()
  })
})

describe("state and hash", () => {
  it("nulls position fields when the mock book does not hold the stock", () => {
    const state = portfolioState(row({ date: "2026-04-01", ticker: "INFY" }), false)
    expect(state.currently_held).toBe(false)
    expect(state.entry_price).toBeNull()
    expect(state.holding_days).toBeNull()
  })

  it("hashes the same state regardless of key order", () => {
    const market = marketState(row({ date: "2026-04-01", ticker: "INFY" }))
    const portfolio = portfolioState(row({ date: "2026-04-01", ticker: "INFY", close: 110 }), true)
    const left = inputHash({ market, portfolio, promptVersion: "decision_schema_v1", model: "typesafe-ai/jev" })
    const right = inputHash({
      model: "typesafe-ai/jev",
      promptVersion: "decision_schema_v1",
      portfolio: JSON.parse(canonicalJson(portfolio)),
      market: JSON.parse(canonicalJson(market)),
    })
    expect(left).toBe(right)
    expect(portfolio.entry_price).toBeCloseTo(100)
  })

  it("holds the first two tickers alphabetically", () => {
    expect(heldTickers(["WIPRO", "INFY", "TCS", "SBIN", "ITC"])).toEqual(["INFY", "ITC"])
  })
})

describe("sample selection", () => {
  it("is deterministic and covers five archetypes", () => {
    const dates = Array.from({ length: 12 }, (_, index) => `2026-04-${String(index + 1).padStart(2, "0")}`)
    const tickers = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]
    const rows: FeatureRow[] = []
    for (const date of dates) {
      tickers.forEach((ticker, index) => {
        rows.push(
          row({
            date,
            ticker,
            distance_from_52w_high: -0.01 * (index + 1),
            rsi_14: 20 + index * 10,
            return_60d: (index - 2) * 0.05,
            return_20d: (index - 3) * 0.002,
            above_sma200: index >= 3,
          }),
        )
      })
      for (let extra = 0; extra < 84; extra += 1) {
        rows.push(row({ date, ticker: `Z${String(extra).padStart(2, "0")}`, rsi_14: 50, return_60d: 0, above_sma200: true }))
      }
    }
    const first = selectSample(rows)
    const second = selectSample(rows)
    expect(first.dates).toEqual(second.dates)
    expect(first.dates).toHaveLength(5)
    expect(first.stocks.map((stock) => stock.archetype)).toEqual(["near_high", "oversold", "uptrend", "downtrend", "sideways"])
    expect(new Set(first.stocks.map((stock) => stock.ticker)).size).toBe(5)
    expect(first.cases).toHaveLength(25)
    expect(first.stocks.map((stock) => stock.ticker)).toEqual(second.stocks.map((stock) => stock.ticker))
  })
})
