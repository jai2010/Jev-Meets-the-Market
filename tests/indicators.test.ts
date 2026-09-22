import { describe, expect, it } from "vitest"
import {
  computeStockFeatures,
  isDecisionReady,
  lagReturn,
  rollingMax,
  rollingMean,
  rsiSeries,
  sampleStdev,
  volatilityAt,
  type Bar,
} from "../src/features/indicators"
import { validateFeatures } from "../src/features/validate"

function bar(close: number, high = close + 1, low = close - 1, volume = 1_000): Bar {
  return { open: close, high, low, close, volume }
}

describe("returns, averages, and risk", () => {
  it("computes a lag return from earlier closes only", () => {
    const closes = [100, 110, 121]
    expect(lagReturn(closes, 2, 1)).toBeCloseTo(0.1)
    expect(lagReturn(closes, 2, 2)).toBeCloseTo(0.21)
    expect(lagReturn(closes, 1, 5)).toBeNull()
  })

  it("refuses a moving average that would skip a hole", () => {
    expect(rollingMean([1, null, 3, 4], 3, 3)).toBeNull()
    expect(rollingMean([2, 4, 6], 2, 3)).toBe(4)
  })

  it("uses the sample standard deviation of complete one-day returns", () => {
    const closes = [10, 12, 9, 11, 13]
    const returns = [0.2, -0.25, 11 / 9 - 1, 13 / 11 - 1]
    expect(volatilityAt(closes, 4, 4)).toBeCloseTo(sampleStdev(returns) ?? 0)
    expect(volatilityAt([10, null, 12, 13, 14], 4, 3)).toBeNull()
  })

  it("sets the 52-week high and drawdown from the trailing window", () => {
    const highs = [5, 9, 7]
    expect(rollingMax(highs, 2, 3)).toBe(9)
    const dates = ["d0", "d1", "d2"]
    const rows = computeStockFeatures({
      ticker: "TEST",
      dates,
      bars: [bar(10, 11, 9), bar(12, 13, 11), bar(9, 10, 8)],
      benchmarkBars: [bar(100, 101, 99), bar(100, 101, 99), bar(100, 101, 99)],
    })
    expect(rows[2].drawdown_20d).toBeNull()
    const dates20 = Array.from({ length: 20 }, (_, index) => `p${index}`)
    const path = dates20.map((_, index) => {
      const close = index === 10 ? 120 : index === 19 ? 90 : 100
      return bar(close, close + 1, close - 1)
    })
    const drawdown = computeStockFeatures({
      ticker: "TEST",
      dates: dates20,
      bars: path,
      benchmarkBars: dates20.map(() => bar(1000, 1001, 999)),
    })
    expect(drawdown[19].drawdown_20d).toBeCloseTo(90 / 120 - 1)
  })

  it("computes volume ratio from the 20-session mean including the session", () => {
    const dates = Array.from({ length: 20 }, (_, index) => `d${index}`)
    const bars = dates.map((_, index) => bar(100 + index, 101 + index, 99 + index, index === 19 ? 2_000 : 1_000))
    const benchmark = dates.map(() => bar(1000, 1001, 999))
    const rows = computeStockFeatures({ ticker: "TEST", dates, bars, benchmarkBars: benchmark })
    const expectedAvg = (19 * 1000 + 2000) / 20
    expect(rows[19].volume_avg_20d).toBeCloseTo(expectedAvg)
    expect(rows[19].volume_ratio_20d).toBeCloseTo(2000 / expectedAvg)
    expect(rows[18].volume_ratio_20d).toBeNull()
  })
})

describe("RSI", () => {
  it("matches a hand-worked 14-change Wilder seed", () => {
    const closes = [10, 11, 12, 11, 12, 13, 12, 13, 14, 13, 14, 15, 14, 15, 16]
    const rsi = rsiSeries(closes)
    expect(rsi[14]).toBeCloseTo(100 * (5 / 7), 8)
    expect(rsi[13]).toBeNull()
  })

  it("does not carry the average across a missing close", () => {
    const closes = [10, 11, 12, 11, 12, 13, 12, 13, 14, 13, 14, 15, 14, 15, 16, null, 16, 17]
    const rsi = rsiSeries(closes)
    expect(rsi[14]).toBeCloseTo(100 * (5 / 7), 8)
    expect(rsi[16]).toBeNull()
    expect(rsi[17]).toBeNull()
  })
})

describe("point in time", () => {
  it("keeps earlier features unchanged when later prices are removed or altered", () => {
    const dates = Array.from({ length: 280 }, (_, index) => `2024-01-${String(index + 1).padStart(2, "0")}`)
    const bars = dates.map((_, index) => bar(100 + index * 0.4, 102 + index * 0.4, 99 + index * 0.4, 5_000 + index))
    const benchmark = dates.map((_, index) => bar(1_000 + index, 1_002 + index, 999 + index, 1))
    const full = computeStockFeatures({ ticker: "TEST", dates, bars, benchmarkBars: benchmark })
    const cut = 240
    const partial = computeStockFeatures({
      ticker: "TEST",
      dates: dates.slice(0, cut),
      bars: bars.slice(0, cut),
      benchmarkBars: benchmark.slice(0, cut),
    })
    expect(partial).toEqual(full.slice(0, cut))

    const altered = bars.map((item, index) => (index === 270 ? bar(10_000, 10_001, 9_999, 9_000) : item))
    const afterAlteration = computeStockFeatures({ ticker: "TEST", dates, bars: altered, benchmarkBars: benchmark })
    expect(afterAlteration.slice(0, 260)).toEqual(full.slice(0, 260))
    expect(afterAlteration[270].close).toBe(10_000)
  })

  it("fails validation when a stored feature disagrees with the causal value", () => {
    const dates = ["d0", "d1", "d2"]
    const bars = [bar(10), bar(11), bar(12)]
    const benchmark = [bar(100), bar(101), bar(102)]
    const rows = computeStockFeatures({ ticker: "TEST", dates, bars, benchmarkBars: benchmark })
    rows[2].return_1d = 5
    const violations = validateFeatures({
      calendar: dates,
      benchmarkBars: benchmark,
      stocks: [{ ticker: "TEST", bars, rows }],
    })
    expect(violations.some((item) => item.rule === "feature_mismatch")).toBe(true)
  })
})

describe("decision_ready", () => {
  it("stays false until the required long windows exist", () => {
    const dates = Array.from({ length: 260 }, (_, index) => `d${index}`)
    const bars = dates.map((_, index) => bar(100 + index, 101 + index, 99 + index))
    const benchmark = dates.map((_, index) => bar(1_000 + index, 1_001 + index, 999 + index))
    const rows = computeStockFeatures({ ticker: "TEST", dates, bars, benchmarkBars: benchmark })
    expect(rows[250].decision_ready).toBe(false)
    expect(rows[251].decision_ready).toBe(true)
    expect(isDecisionReady(rows[250])).toBe(false)
    expect(rows[10].sma_200).toBeNull()
    expect(rows[199].sma_200).not.toBeNull()
  })
})
