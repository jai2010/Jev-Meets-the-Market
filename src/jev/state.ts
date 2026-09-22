import type { FeatureRow } from "../features/indicators"

export type MarketState = {
  ticker: string
  decision_date: string
  close: number | null
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
  distance_from_52w_high: number | null
  drawdown_20d: number | null
  nifty_return_1d: number | null
  nifty_return_5d: number | null
  nifty_return_20d: number | null
  relative_return_5d: number | null
  relative_return_20d: number | null
}

export type PortfolioState = {
  currently_held: boolean
  entry_price: number | null
  holding_days: number | null
  unrealized_return: number | null
  portfolio_cash: number
  portfolio_value: number
  number_of_positions: number
  max_positions: number
}

/** Synthetic book used only to give Jev a position context. Not the ₹10L simulation. */
export const MOCK_PORTFOLIO = {
  portfolio_cash: 600_000,
  portfolio_value: 1_000_000,
  number_of_positions: 2,
  max_positions: 5,
} as const

export function marketState(row: FeatureRow): MarketState {
  return {
    ticker: row.ticker,
    decision_date: row.date,
    close: row.close,
    return_1d: row.return_1d,
    return_5d: row.return_5d,
    return_20d: row.return_20d,
    return_60d: row.return_60d,
    sma_20: row.sma_20,
    sma_50: row.sma_50,
    sma_200: row.sma_200,
    above_sma20: row.above_sma20,
    above_sma50: row.above_sma50,
    above_sma200: row.above_sma200,
    rsi_14: row.rsi_14,
    volatility_20d: row.volatility_20d,
    volume_avg_20d: row.volume_avg_20d,
    volume_ratio_20d: row.volume_ratio_20d,
    distance_from_52w_high: row.distance_from_52w_high,
    drawdown_20d: row.drawdown_20d,
    nifty_return_1d: row.nifty_return_1d,
    nifty_return_5d: row.nifty_return_5d,
    nifty_return_20d: row.nifty_return_20d,
    relative_return_5d: row.relative_return_5d,
    relative_return_20d: row.relative_return_20d,
  }
}

export function portfolioState(row: FeatureRow, currentlyHeld: boolean): PortfolioState {
  if (!currentlyHeld) {
    return {
      currently_held: false,
      entry_price: null,
      holding_days: null,
      unrealized_return: null,
      ...MOCK_PORTFOLIO,
    }
  }
  const entry =
    row.close != null && row.return_20d != null && row.return_20d !== -1 ? row.close / (1 + row.return_20d) : null
  return {
    currently_held: true,
    entry_price: entry,
    holding_days: 20,
    unrealized_return: row.return_20d,
    ...MOCK_PORTFOLIO,
  }
}

export function heldTickers(tickers: string[]): string[] {
  return [...tickers].sort().slice(0, 2)
}
