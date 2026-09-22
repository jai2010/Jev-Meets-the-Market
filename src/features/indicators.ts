import { WINDOWS } from "./constants"

export type Bar = {
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

export type FeatureRow = {
  date: string
  ticker: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  return_1d: number | null
  return_5d: number | null
  return_20d: number | null
  return_60d: number | null
  sma_20: number | null
  sma_50: number | null
  sma_200: number | null
  above_sma20: boolean | null
  above_sma50: boolean | null
  above_sma200: boolean | null
  rsi_14: number | null
  volatility_20d: number | null
  volume_avg_20d: number | null
  volume_ratio_20d: number | null
  high_52w: number | null
  distance_from_52w_high: number | null
  drawdown_20d: number | null
  nifty_return_1d: number | null
  nifty_return_5d: number | null
  nifty_return_20d: number | null
  relative_return_5d: number | null
  relative_return_20d: number | null
  decision_ready: boolean
}

/**
 * A stock bar can enter a feature only when it has a positive price and volume.
 * Flat zero-volume Yahoo prints stay in the raw columns and are ignored by every window.
 */
export function isValidStockBar(bar: Bar | null): boolean {
  if (!bar) return false
  const { open, high, low, close, volume } = bar
  if (open == null || high == null || low == null || close == null || volume == null) return false
  if (![open, high, low, close, volume].every((value) => Number.isFinite(value))) return false
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume <= 0) return false
  if (high < low) return false
  if (high < Math.max(open, close) || low > Math.min(open, close)) return false
  return true
}

/** The index often has volume 0 on a real session. A range is enough. */
export function isValidBenchmarkBar(bar: Bar | null): boolean {
  if (!bar) return false
  const { open, high, low, close } = bar
  if (open == null || high == null || low == null || close == null) return false
  if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) return false
  return high > low
}

export function usableClose(bar: Bar | null, kind: "stock" | "benchmark"): number | null {
  if (kind === "stock") return isValidStockBar(bar) ? bar!.close : null
  return isValidBenchmarkBar(bar) ? bar!.close : null
}

export function usableHigh(bar: Bar | null): number | null {
  return isValidStockBar(bar) ? bar!.high : null
}

export function usableVolume(bar: Bar | null): number | null {
  return isValidStockBar(bar) ? bar!.volume : null
}

export function lagReturn(values: (number | null)[], index: number, lag: number): number | null {
  if (lag <= 0 || index - lag < 0) return null
  const now = values[index]
  const then = values[index - lag]
  if (now == null || then == null || then === 0) return null
  return now / then - 1
}

/** Mean of a complete window ending at index. One missing session makes the result null. */
export function rollingMean(values: (number | null)[], index: number, window: number): number | null {
  if (window <= 0 || index - window + 1 < 0) return null
  let sum = 0
  for (let i = index - window + 1; i <= index; i += 1) {
    const value = values[i]
    if (value == null) return null
    sum += value
  }
  return sum / window
}

export function rollingMax(values: (number | null)[], index: number, window: number): number | null {
  if (window <= 0 || index - window + 1 < 0) return null
  let max = -Infinity
  for (let i = index - window + 1; i <= index; i += 1) {
    const value = values[i]
    if (value == null) return null
    if (value > max) max = value
  }
  return max
}

export function sampleStdev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const squareSum = values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
  return Math.sqrt(squareSum / (values.length - 1))
}

export function volatilityAt(closes: (number | null)[], index: number, window: number = WINDOWS.volatility): number | null {
  if (index - window < 0) return null
  const returns: number[] = []
  for (let i = index - window + 1; i <= index; i += 1) {
    const value = lagReturn(closes, i, 1)
    if (value == null) return null
    returns.push(value)
  }
  return sampleStdev(returns)
}

function rsiFromAverages(avgGain: number, avgLoss: number): number | null {
  if (avgGain === 0 && avgLoss === 0) return null
  if (avgLoss === 0) return 100
  const relativeStrength = avgGain / avgLoss
  return 100 - 100 / (1 + relativeStrength)
}

/**
 * Wilder RSI. A missing close ends the segment. The average does not jump the gap,
 * because that gap is not a one-day return that was knowable as a single print.
 */
export function rsiSeries(closes: (number | null)[], period = WINDOWS.rsi): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null)
  const flush = (start: number, end: number) => {
    if (end - start < period) return
    let avgGain = 0
    let avgLoss = 0
    for (let i = start + 1; i <= start + period; i += 1) {
      const diff = (closes[i] as number) - (closes[i - 1] as number)
      avgGain += Math.max(diff, 0)
      avgLoss += Math.max(-diff, 0)
    }
    avgGain /= period
    avgLoss /= period
    out[start + period] = rsiFromAverages(avgGain, avgLoss)
    for (let i = start + period + 1; i <= end; i += 1) {
      const diff = (closes[i] as number) - (closes[i - 1] as number)
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
      out[i] = rsiFromAverages(avgGain, avgLoss)
    }
  }

  let segmentStart = 0
  for (let i = 0; i <= closes.length; i += 1) {
    if (i === closes.length || closes[i] == null) {
      if (i > segmentStart) flush(segmentStart, i - 1)
      segmentStart = i + 1
    }
  }
  return out
}

function above(close: number | null, average: number | null): boolean | null {
  if (close == null || average == null) return null
  return close > average
}

function subtract(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null
  return left - right
}

export function isDecisionReady(row: Omit<FeatureRow, "decision_ready" | "ticker" | "date">): boolean {
  return (
    row.return_20d != null &&
    row.return_60d != null &&
    row.sma_50 != null &&
    row.sma_200 != null &&
    row.rsi_14 != null &&
    row.volatility_20d != null &&
    row.volume_ratio_20d != null &&
    row.high_52w != null &&
    row.distance_from_52w_high != null &&
    row.nifty_return_1d != null &&
    row.nifty_return_5d != null &&
    row.nifty_return_20d != null
  )
}

export function computeStockFeatures(input: {
  ticker: string
  dates: string[]
  bars: (Bar | null)[]
  benchmarkBars: (Bar | null)[]
}): FeatureRow[] {
  const { ticker, dates, bars, benchmarkBars } = input
  if (dates.length !== bars.length || dates.length !== benchmarkBars.length) {
    throw new Error(`${ticker}: dates, bars, and benchmark bars must be aligned`)
  }

  const closes = bars.map((bar) => usableClose(bar, "stock"))
  const highs = bars.map((bar) => usableHigh(bar))
  const volumes = bars.map((bar) => usableVolume(bar))
  const niftyCloses = benchmarkBars.map((bar) => usableClose(bar, "benchmark"))
  const rsi = rsiSeries(closes)

  return dates.map((date, index) => {
    const bar = bars[index]
    const close = closes[index]
    const sma20 = rollingMean(closes, index, WINDOWS.sma20)
    const sma50 = rollingMean(closes, index, WINDOWS.sma50)
    const sma200 = rollingMean(closes, index, WINDOWS.sma200)
    const high52 = rollingMax(highs, index, WINDOWS.high52)
    const peak20 = rollingMax(closes, index, WINDOWS.drawdown)
    const volumeAvg = rollingMean(volumes, index, WINDOWS.volume)
    const return5 = lagReturn(closes, index, WINDOWS.return5)
    const return20 = lagReturn(closes, index, WINDOWS.return20)
    const nifty1 = lagReturn(niftyCloses, index, WINDOWS.return1)
    const nifty5 = lagReturn(niftyCloses, index, WINDOWS.return5)
    const nifty20 = lagReturn(niftyCloses, index, WINDOWS.return20)
    const row = {
      open: bar?.open ?? null,
      high: bar?.high ?? null,
      low: bar?.low ?? null,
      close: bar?.close ?? null,
      volume: bar?.volume ?? null,
      return_1d: lagReturn(closes, index, WINDOWS.return1),
      return_5d: return5,
      return_20d: return20,
      return_60d: lagReturn(closes, index, WINDOWS.return60),
      sma_20: sma20,
      sma_50: sma50,
      sma_200: sma200,
      above_sma20: above(close, sma20),
      above_sma50: above(close, sma50),
      above_sma200: above(close, sma200),
      rsi_14: rsi[index],
      volatility_20d: volatilityAt(closes, index),
      volume_avg_20d: volumeAvg,
      volume_ratio_20d: volumeAvg != null && volumeAvg !== 0 && volumes[index] != null ? volumes[index]! / volumeAvg : null,
      high_52w: high52,
      distance_from_52w_high: high52 != null && close != null && high52 !== 0 ? close / high52 - 1 : null,
      drawdown_20d: peak20 != null && close != null && peak20 !== 0 ? close / peak20 - 1 : null,
      nifty_return_1d: nifty1,
      nifty_return_5d: nifty5,
      nifty_return_20d: nifty20,
      relative_return_5d: subtract(return5, nifty5),
      relative_return_20d: subtract(return20, nifty20),
    }
    return { date, ticker, ...row, decision_ready: isDecisionReady(row) }
  })
}
