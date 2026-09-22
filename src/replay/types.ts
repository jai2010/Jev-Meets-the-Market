export type ReplayAction = "BUY" | "HOLD" | "SELL" | "NO_ACTION"

export type ReplayDecision = {
  ticker: string
  action: ReplayAction
  price: number
  /** Probability Jev assigned to the chosen action. Null when the response had none. */
  confidence: number | null
  rawConfidence?: number | null
  probabilities?: Partial<Record<ReplayAction, number>>
  /** Present only when a stored Jev response included one. The UI does not invent this. */
  rationale?: string | null
  return20d?: number | null
  sparkline?: number[]
}

export type ReplayPosition = {
  ticker: string
  value: number
  /** Decimal return, 0.08 = +8%. */
  returnPct: number
  daysHeld: number
}

export type ReplayTrade = {
  decisionDate: string
  executionDate: string
  ticker: string
  action: "BUY" | "SELL"
  executionPrice: number
  shares: number
  value: number
}

export type ReplaySnapshot = {
  date: string
  dayNumber: number
  stocksEvaluated: number
  decisionCounts: Record<ReplayAction, number>
  portfolioValue: number
  cash: number
  investedValue: number
  benchmarkValue: number
  positions: ReplayPosition[]
  highlightedDecisions: ReplayDecision[]
  decisions: ReplayDecision[]
  tradesExecuted: ReplayTrade[]
}

export type ReplayExperiment = {
  id: string
  startDate: string
  endDate: string
  initialCapital: number
  universe: string
  maxPositions: number
  maxAllocation: number
  execution: "NEXT_OPEN"
  /** Fraction of traded value, 0.001 = 0.10%. */
  transactionCost: number
  /** Fraction of traded value, 0.0005 = 0.05%. */
  slippage: number
  model: string
  promptVersion: string
}

export type ReplayDataset = {
  mode: "demo" | "recorded" | "partial"
  experiment: ReplayExperiment
  days: ReplaySnapshot[]
}

export const REPLAY_ACTIONS: ReplayAction[] = ["BUY", "HOLD", "SELL", "NO_ACTION"]
export const RECORDED_REPLAY_PATH = "data/processed/replay/experiment.json"
