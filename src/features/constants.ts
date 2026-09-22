/** Trading-session windows. A session is one date on the Phase 1 trading calendar. */
export const WINDOWS = {
  return1: 1,
  return5: 5,
  return20: 20,
  return60: 60,
  sma20: 20,
  sma50: 50,
  sma200: 200,
  rsi: 14,
  volatility: 20,
  volume: 20,
  /** 252 sessions is the usual stand-in for 52 weeks of NSE trading. */
  high52: 252,
  drawdown: 20,
} as const

export const DB_PATH = "data/processed/market.duckdb"
export const PARQUET_PATH = "data/processed/stock_features.parquet"
export const REPORT_PATH = "results/phase2_feature_quality.md"
export const SUMMARY_PATH = "results/phase2_summary.json"
