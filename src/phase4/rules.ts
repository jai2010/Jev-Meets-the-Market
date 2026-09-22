export const EXPERIMENT_ID = "JEV-20260922-V2"
export const INITIAL_CAPITAL = 1_000_000
export const MAX_POSITIONS = 5
export const MAX_POSITION_WEIGHT = 0.2
export const TRANSACTION_COST_RATE = 0.001
export const SLIPPAGE_RATE = 0.0005
export const RANDOM_SEED = 20260922

export type Action = "BUY" | "HOLD" | "SELL" | "NO_ACTION" | "DECISION_ERROR"

export type Position = {
  ticker: string
  shares: number
  entryPrice: number
  entryDate: string
}

export type Book = {
  cash: number
  positions: Position[]
}

export type BuyOrder = { ticker: string; notional: number }

export type ExecutionPlan = {
  decisionDate: string
  sells: string[]
  buys: BuyOrder[]
}

export type Signal = {
  ticker: string
  action: Action
  /** Probability of the chosen action. Null when Jev did not return one. */
  chosenProbability: number | null
  /** Tie or baseline ordering. Higher is bought first. Jev does not use this. */
  priority?: number
}

export function emptyBook(cash = INITIAL_CAPITAL): Book {
  return { cash, positions: [] }
}

export function portfolioAction(action: Action, held: boolean): "SELL" | "BUY_CANDIDATE" | "MAINTAIN" | "NONE" {
  if (action === "SELL" && held) return "SELL"
  if (action === "BUY" && !held) return "BUY_CANDIDATE"
  if ((action === "BUY" || action === "HOLD") && held) return "MAINTAIN"
  return "NONE"
}

export function planTrades(input: {
  book: Book
  signals: Signal[]
  closes: Record<string, number>
  portfolioValue: number
  maxPositions?: number
  maxWeight?: number
  slippage?: number
  cost?: number
}): ExecutionPlan {
  const maxPositions = input.maxPositions ?? MAX_POSITIONS
  const maxWeight = input.maxWeight ?? MAX_POSITION_WEIGHT
  const slippage = input.slippage ?? SLIPPAGE_RATE
  const cost = input.cost ?? TRANSACTION_COST_RATE
  const held = new Set(input.book.positions.map((position) => position.ticker))
  const sells = input.book.positions
    .map((position) => position.ticker)
    .filter((ticker) => {
      const signal = input.signals.find((item) => item.ticker === ticker)
      return signal ? portfolioAction(signal.action, true) === "SELL" : false
    })
    .sort()

  let projectedCash = input.book.cash
  for (const ticker of sells) {
    const position = input.book.positions.find((item) => item.ticker === ticker)
    const close = input.closes[ticker]
    if (!position || !(close > 0)) continue
    projectedCash += sellProceeds(position.shares, close, slippage, cost)
  }

  const freeSlots = maxPositions - (held.size - sells.length)
  const candidates = input.signals
    .filter((signal) => portfolioAction(signal.action, held.has(signal.ticker)) === "BUY_CANDIDATE")
    .sort((a, b) => {
      const probability = (b.chosenProbability ?? -1) - (a.chosenProbability ?? -1)
      if (probability !== 0) return probability
      const priority = (b.priority ?? 0) - (a.priority ?? 0)
      if (priority !== 0) return priority
      return a.ticker.localeCompare(b.ticker)
    })
  const accepted = candidates.slice(0, Math.max(0, freeSlots))
  const notional = accepted.length === 0 ? 0 : Math.min(maxWeight * input.portfolioValue, projectedCash / accepted.length)
  return {
    decisionDate: "",
    sells,
    buys: accepted.map((signal) => ({ ticker: signal.ticker, notional: Math.max(0, notional) })),
  }
}

export function sellProceeds(shares: number, price: number, slippage = SLIPPAGE_RATE, cost = TRANSACTION_COST_RATE): number {
  const execution = price * (1 - slippage)
  return shares * execution * (1 - cost)
}

export function buyShares(open: number, notional: number, cash: number, slippage = SLIPPAGE_RATE, cost = TRANSACTION_COST_RATE): number {
  const execution = open * (1 + slippage)
  const cashPerShare = execution * (1 + cost)
  if (!(open > 0) || !(cashPerShare > 0) || notional <= 0 || cash <= 0) return 0
  return Math.floor(Math.min(notional, cash) / cashPerShare)
}

export function executePlan(input: {
  book: Book
  plan: ExecutionPlan
  executionDate: string
  opens: Record<string, number>
  slippage?: number
  cost?: number
}): { book: Book; trades: ExecutedTrade[] } {
  const slippage = input.slippage ?? SLIPPAGE_RATE
  const cost = input.cost ?? TRANSACTION_COST_RATE
  const book = emptyBook(input.book.cash)
  book.positions = input.book.positions.map((position) => ({ ...position }))
  const trades: ExecutedTrade[] = []

  for (const ticker of input.plan.sells) {
    const index = book.positions.findIndex((position) => position.ticker === ticker)
    const open = input.opens[ticker]
    if (index < 0 || !(open > 0)) continue
    const position = book.positions[index]
    const executionPrice = open * (1 - slippage)
    const gross = position.shares * open
    const slippageValue = position.shares * open * slippage
    const transactionCost = position.shares * executionPrice * cost
    const net = position.shares * executionPrice - transactionCost
    const cashBefore = book.cash
    book.cash += net
    book.positions.splice(index, 1)
    trades.push({
      decisionDate: input.plan.decisionDate,
      executionDate: input.executionDate,
      ticker,
      action: "SELL",
      shares: position.shares,
      decisionPrice: null,
      executionPrice,
      grossValue: gross,
      slippage: slippageValue,
      transactionCost,
      netValue: net,
      cashBefore,
      cashAfter: book.cash,
    })
  }

  for (const order of input.plan.buys) {
    if (book.positions.length >= MAX_POSITIONS) break
    const open = input.opens[order.ticker]
    if (!(open > 0)) continue
    if (book.positions.some((position) => position.ticker === order.ticker)) continue
    const shares = buyShares(open, order.notional, book.cash, slippage, cost)
    if (shares <= 0) continue
    const executionPrice = open * (1 + slippage)
    const gross = shares * open
    const slippageValue = shares * open * slippage
    const transactionCost = shares * executionPrice * cost
    const net = shares * executionPrice + transactionCost
    const cashBefore = book.cash
    book.cash -= net
    book.positions.push({
      ticker: order.ticker,
      shares,
      entryPrice: executionPrice,
      entryDate: input.executionDate,
    })
    trades.push({
      decisionDate: input.plan.decisionDate,
      executionDate: input.executionDate,
      ticker: order.ticker,
      action: "BUY",
      shares,
      decisionPrice: null,
      executionPrice,
      grossValue: gross,
      slippage: slippageValue,
      transactionCost,
      netValue: net,
      cashBefore,
      cashAfter: book.cash,
    })
  }

  book.positions.sort((a, b) => a.ticker.localeCompare(b.ticker))
  return { book, trades }
}

export type ExecutedTrade = {
  decisionDate: string
  executionDate: string
  ticker: string
  action: "BUY" | "SELL"
  shares: number
  decisionPrice: number | null
  executionPrice: number
  grossValue: number
  slippage: number
  transactionCost: number
  netValue: number
  cashBefore: number
  cashAfter: number
}

export function markToMarket(book: Book, closes: Record<string, number>): { cash: number; marketValue: number; portfolioValue: number } {
  let marketValue = 0
  for (const position of book.positions) {
    const close = closes[position.ticker]
    if (!(close > 0)) throw new Error(`missing close for held position ${position.ticker}`)
    marketValue += position.shares * close
  }
  return { cash: book.cash, marketValue, portfolioValue: book.cash + marketValue }
}

export function benchmarkValues(closes: number[], initial = INITIAL_CAPITAL): number[] {
  const start = closes[0]
  if (!(start > 0)) throw new Error("benchmark start close is missing")
  return closes.map((close) => (initial * close) / start)
}

export function momentumSignals(eligible: { ticker: string; return20d: number }[], held: string[]): Signal[] {
  const ranked = [...eligible].sort((a, b) => b.return20d - a.return20d || a.ticker.localeCompare(b.ticker))
  const target = new Set(ranked.slice(0, MAX_POSITIONS).map((item) => item.ticker))
  const tickers = new Set([...eligible.map((item) => item.ticker), ...held])
  return [...tickers].sort().map((ticker) => {
    const isHeld = held.includes(ticker)
    const priority = eligible.find((item) => item.ticker === ticker)?.return20d
    if (isHeld && !target.has(ticker)) return { ticker, action: "SELL", chosenProbability: null }
    if (!isHeld && target.has(ticker)) return { ticker, action: "BUY", chosenProbability: null, priority }
    if (isHeld) return { ticker, action: "HOLD", chosenProbability: null }
    return { ticker, action: "NO_ACTION", chosenProbability: null }
  })
}

export function randomTargets(tickers: string[], date: string, seed = RANDOM_SEED): string[] {
  const copy = [...tickers].sort()
  const random = mulberry32(hashSeed(seed, date))
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const current = copy[index]
    copy[index] = copy[swap]
    copy[swap] = current
  }
  return copy.slice(0, MAX_POSITIONS).sort()
}

function hashSeed(seed: number, date: string): number {
  let hash = seed >>> 0
  for (const char of date) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return hash
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
