import {
  emptyBook,
  executePlan,
  markToMarket,
  momentumSignals,
  planTrades,
  randomTargets,
  type Book,
  type ExecutedTrade,
  type ExecutionPlan,
  type Signal,
} from "./rules"

export type DayRecord = {
  date: string
  dayNumber: number
  jev: {
    cash: number
    marketValue: number
    portfolioValue: number
    positions: Book["positions"]
    trades: ExecutedTrade[]
    signals: Signal[]
  }
  momentumValue: number
  randomValue: number
  benchmarkValue: number
}

export async function simulateAll(input: {
  dates: string[]
  benchmarkCloses: number[]
  openOf: (date: string, ticker: string) => number | null
  closeOf: (date: string, ticker: string) => number | null
  momentumEligible: (date: string) => { ticker: string; return20d: number }[]
  randomEligible: (date: string) => string[]
  resolveJev: (date: string, book: Book, portfolioValue: number) => Promise<Signal[]>
}): Promise<DayRecord[]> {
  const jev = emptyBook()
  const momentum = emptyBook()
  const random = emptyBook()
  let jevPlan: ExecutionPlan | null = null
  let momentumPlan: ExecutionPlan | null = null
  let randomPlan: ExecutionPlan | null = null
  const records: DayRecord[] = []
  const startClose = input.benchmarkCloses[0]

  for (let index = 0; index < input.dates.length; index += 1) {
    const date = input.dates[index]
    const jevTrades = apply(jev, jevPlan, date, input.openOf)
    const momentumTrades = apply(momentum, momentumPlan, date, input.openOf)
    const randomTrades = apply(random, randomPlan, date, input.openOf)
    void momentumTrades
    void randomTrades
    const jevMark = markBook(jev, date, input.closeOf)
    const momentumMark = markBook(momentum, date, input.closeOf)
    const randomMark = markBook(random, date, input.closeOf)
    const signals = await input.resolveJev(date, jev, jevMark.portfolioValue)
    const held = jev.positions.map((position) => position.ticker)
    jevPlan = planTrades({
      book: jev,
      signals,
      closes: closesFor(date, [...held, ...signals.map((signal) => signal.ticker)], input.closeOf),
      portfolioValue: jevMark.portfolioValue,
    })
    jevPlan.decisionDate = date
    const momentumHeld = momentum.positions.map((position) => position.ticker)
    const momentumList = input.momentumEligible(date)
    momentumPlan = planTrades({
      book: momentum,
      signals: momentumSignals(momentumList, momentumHeld),
      closes: closesFor(date, [...momentumHeld, ...momentumList.map((item) => item.ticker)], input.closeOf),
      portfolioValue: momentumMark.portfolioValue,
    })
    momentumPlan.decisionDate = date
    const randomHeld = random.positions.map((position) => position.ticker)
    const randomList = input.randomEligible(date)
    const target = new Set(randomTargets(randomList, date))
    randomPlan = planTrades({
      book: random,
      signals: [...new Set([...randomList, ...randomHeld])].map((ticker) => ({
        ticker,
        action: randomHeld.includes(ticker) && !target.has(ticker)
          ? "SELL"
          : !randomHeld.includes(ticker) && target.has(ticker)
            ? "BUY"
            : randomHeld.includes(ticker)
              ? "HOLD"
              : "NO_ACTION",
        chosenProbability: null,
      })),
      closes: closesFor(date, [...randomHeld, ...randomList], input.closeOf),
      portfolioValue: randomMark.portfolioValue,
    })
    randomPlan.decisionDate = date
    records.push({
      date,
      dayNumber: index + 1,
      jev: {
        cash: jevMark.cash,
        marketValue: jevMark.marketValue,
        portfolioValue: jevMark.portfolioValue,
        positions: jev.positions.map((position) => ({ ...position })),
        trades: jevTrades,
        signals,
      },
      momentumValue: momentumMark.portfolioValue,
      randomValue: randomMark.portfolioValue,
      benchmarkValue: (1_000_000 * input.benchmarkCloses[index]) / startClose,
    })
  }
  return records
}

function apply(book: Book, plan: ExecutionPlan | null, date: string, openOf: (date: string, ticker: string) => number | null): ExecutedTrade[] {
  if (!plan) return []
  const opens: Record<string, number> = {}
  for (const ticker of [...plan.sells, ...plan.buys.map((order) => order.ticker)]) {
    const open = openOf(date, ticker)
    if (open != null && open > 0) opens[ticker] = open
  }
  const executed = executePlan({ book, plan, executionDate: date, opens })
  book.cash = executed.book.cash
  book.positions = executed.book.positions
  return executed.trades
}

function markBook(book: Book, date: string, closeOf: (date: string, ticker: string) => number | null) {
  const closes: Record<string, number> = {}
  for (const position of book.positions) {
    const close = closeOf(date, position.ticker)
    if (close == null || !(close > 0)) throw new Error(`missing close for ${position.ticker} on ${date}`)
    closes[position.ticker] = close
  }
  return markToMarket(book, closes)
}

function closesFor(date: string, tickers: string[], closeOf: (date: string, ticker: string) => number | null) {
  const closes: Record<string, number> = {}
  for (const ticker of tickers) {
    const close = closeOf(date, ticker)
    if (close != null && close > 0) closes[ticker] = close
  }
  return closes
}
