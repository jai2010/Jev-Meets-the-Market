import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Cell } from "../src/phase4/data"
import { benchmarkCloses, loadCells, tradingDates } from "../src/phase4/data"
import {
  assertNotInterruptedDatabase,
  insertCompletedDecision,
  loadCompleteDecisions,
  openDecisionsDatabase,
  resolveEligibleDecisions,
  requestWithRetry,
  UnresolvedDecisionError,
} from "../src/phase4/decisions"
import { END_DATE, MANIFEST_PATH, PHASE4_DB, START_DATE } from "../src/phase4/paths"
import { publish } from "../src/phase4/publish"
import { EXPERIMENT_ID, INITIAL_CAPITAL } from "../src/phase4/rules"
import { simulateAll, type DayRecord } from "../src/phase4/simulate"
import { loadGatewayKey } from "../src/jev/client"
import { inputHash } from "../src/jev/hash"
import { ACTION_CRITERIA, DECISION_INSTRUCTIONS, MODEL, PROMPT_VERSION } from "../src/jev/schema"
import { marketState } from "../src/jev/state"

const root = fileURLToPath(new URL("..", import.meta.url))
const CONCURRENCY = 1

async function main() {
  const dbPath = resolve(root, PHASE4_DB)
  assertNotInterruptedDatabase(dbPath)
  const dates = tradingDates(root, START_DATE, END_DATE)
  const cells = await loadCells(root, START_DATE, END_DATE)
  const readyCount = [...cells.values()].filter((cell) => cell.ready).length
  if (dates[0] !== START_DATE || dates.at(-1) !== END_DATE) {
    throw new Error(`calendar bounds are ${dates[0]} to ${dates.at(-1)}`)
  }
  if (readyCount < 1000) throw new Error(`only ${readyCount} decision-ready rows; refusing to freeze`)
  const benchmarks = benchmarkCloses(root, dates)
  const manifest = ensureManifest(root)
  if (manifest.experiment_id !== EXPERIMENT_ID) {
    throw new Error(`manifest experiment_id is ${manifest.experiment_id}; expected ${EXPERIMENT_ID}`)
  }
  console.log(`frozen ${manifest.experiment_id} final_run=${Boolean(manifest.final_run)} sessions=${dates.length} ready_rows=${readyCount}`)
  console.log(`database ${PHASE4_DB}`)

  const db = await openDecisionsDatabase(dbPath)
  const saved = await loadCompleteDecisions(db.connection)
  if (saved.size > 0) {
    console.log(`[V2] RESUME | loaded ${saved.size} complete decisions | skipping stored keys`)
  } else {
    console.log("V2 database empty and ready")
  }
  const key = loadGatewayKey()
  let writes = Promise.resolve()
  const lock = <T>(fn: () => Promise<T>) => {
    const run = writes.then(fn, fn)
    writes = run.then(() => undefined, () => undefined)
    return run
  }
  const startedAt = Date.now()
  let unresolvedTotal = 0

  const records = await simulateAll({
    dates,
    benchmarkCloses: benchmarks,
    openOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.open ?? null,
    closeOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.close ?? null,
    momentumEligible: (date) => eligible(cells, date).flatMap((ticker) => {
      const value = cells.get(`${date}|${ticker}`)?.features.return_20d
      return value == null ? [] : [{ ticker, return20d: value }]
    }),
    randomEligible: (date) => eligible(cells, date),
    resolveJev: async (date, book, portfolioValue) => {
      const tickers = eligible(cells, date)
      const session = dates.indexOf(date) + 1
      let completedThisSession = tickers.length - tickers.filter((ticker) => !saved.has(`${date}|${ticker}`)).length
      const signals = await resolveEligibleDecisions({
        date,
        tickers,
        saved,
        concurrency: CONCURRENCY,
        call: async (ticker) => {
          const cell = cells.get(`${date}|${ticker}`)
          if (!cell) throw new Error(`missing cell ${ticker} ${date}`)
          const market = marketState(cell.features)
          const portfolio = portfolioPayload(book, ticker, dates, date, portfolioValue, cell.close)
          const hashed = inputHash({ market, portfolio, promptVersion: PROMPT_VERSION, model: MODEL })
          const outcome = await requestWithRetry({ market, portfolio }, key, {
            onBackoff: ({ attempt, maxAttempts, delayMs, status }) => {
              console.log(
                `[V2] ${date} | waiting on ${status} retry | attempt ${attempt}/${maxAttempts} | backoff ${Math.round(delayMs / 1000)}s`,
              )
            },
          })
          if (!outcome.ok) {
            unresolvedTotal += 1
            return outcome
          }
          completedThisSession += 1
          if (completedThisSession % 30 === 0) {
            console.log(
              `[V2] ${date} | ${completedThisSession}/${tickers.length} decisions | last response ${(outcome.latencyMs / 1000).toFixed(1)}s | unresolved ${unresolvedTotal}`,
            )
          }
          return { ok: true as const, decision: { ...outcome, market, portfolio, inputHash: hashed } }
        },
        persist: (ticker, decision) => lock(() => insertCompletedDecision(db.connection, {
          date,
          ticker,
          market: decision.market,
          portfolio: decision.portfolio,
          inputHash: decision.inputHash,
          decision,
        })),
      })
      const elapsedMs = Date.now() - startedAt
      const done = saved.size
      const remaining = Math.max(0, readyCount - done)
      const perDecision = done > 0 ? elapsedMs / done : 0
      const eta = perDecision > 0 ? ` | ETA ~${formatDuration(remaining * perDecision)}` : ""
      console.log(
        `[V2] ${date} | session ${session}/${dates.length} | decisions ${tickers.length}/${tickers.length} | total ${done}/${readyCount} | unresolved ${unresolvedTotal} | portfolio ${inr(portfolioValue)} | positions ${book.positions.length}/5 | elapsed ${formatDuration(elapsedMs)}${eta}`,
      )
      return signals
    },
  })

  const problems = accountingProblems(records)
  if (problems.length > 0) {
    writeFileSync(resolve(root, "results/phase4_validation_failure.json"), JSON.stringify(problems.slice(0, 50), null, 2))
    throw new Error(`accounting validation failed: ${problems[0]}`)
  }
  publish({ root, dates, cells, records, saved, manifest })
  db.close()
  const last = records.at(-1)!
  console.log(
    `complete ${EXPERIMENT_ID} final=${inr(last.jev.portfolioValue)} cash=${inr(last.jev.cash)} positions=${last.jev.positions.length} benchmark=${inr(last.benchmarkValue)}`,
  )
}

function eligible(cells: Map<string, Cell>, date: string): string[] {
  const tickers: string[] = []
  for (const [key, cell] of cells) {
    if (cell.ready && key.startsWith(`${date}|`)) tickers.push(key.slice(date.length + 1))
  }
  return tickers.sort()
}

function portfolioPayload(
  book: { cash: number; positions: { ticker: string; shares: number; entryPrice: number; entryDate: string }[] },
  ticker: string,
  dates: string[],
  today: string,
  portfolioValue: number,
  close: number | null,
) {
  const position = book.positions.find((item) => item.ticker === ticker)
  const held = Boolean(position)
  const entryIndex = position ? dates.indexOf(position.entryDate) : -1
  const todayIndex = dates.indexOf(today)
  return {
    currently_held: held,
    entry_price: held ? position!.entryPrice : null,
    holding_days: held && entryIndex >= 0 && todayIndex >= entryIndex ? todayIndex - entryIndex + 1 : 0,
    unrealized_return: held && position && close != null && position.entryPrice > 0 ? close / position.entryPrice - 1 : 0,
    portfolio_cash: book.cash,
    portfolio_value: portfolioValue,
    number_of_positions: book.positions.length,
    max_positions: 5,
  }
}

function accountingProblems(records: DayRecord[]): string[] {
  const problems: string[] = []
  if (records[0]?.date !== START_DATE) problems.push("first date")
  if (records.at(-1)?.date !== END_DATE) problems.push("last date")
  if (Math.abs((records[0]?.benchmarkValue ?? 0) - INITIAL_CAPITAL) > 0.01) problems.push("benchmark start")
  for (const day of records) {
    const sum = day.jev.cash + day.jev.marketValue
    if (Math.abs(sum - day.jev.portfolioValue) > 0.05) problems.push(`${day.date} accounting`)
    if (day.jev.positions.length > 5) problems.push(`${day.date} positions ${day.jev.positions.length}`)
    if (day.jev.cash < -0.05) problems.push(`${day.date} negative cash`)
    if (day.jev.positions.some((position) => position.shares <= 0)) problems.push(`${day.date} short`)
    for (const trade of day.jev.trades) {
      if (!(trade.executionDate > trade.decisionDate)) problems.push(`${trade.ticker} execution order`)
    }
  }
  return problems
}

function ensureManifest(base: string) {
  const path = resolve(base, MANIFEST_PATH)
  mkdirSync(dirname(path), { recursive: true })
  const body = manifestBody(base)
  const sha = createHash("sha256").update(JSON.stringify(body)).digest("hex")
  const manifest = { ...body, manifest_sha256: sha }
  if (!existsSync(path)) {
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest
  }
  const existing = JSON.parse(readFileSync(path, "utf8")) as typeof manifest
  if (existing.manifest_sha256 !== sha) {
    throw new Error("manifest is frozen and no longer matches the methodology hashes; refusing to continue this run id")
  }
  return existing
}

function manifestBody(base: string) {
  const prompt = { instructions: DECISION_INSTRUCTIONS, criteria: ACTION_CRITERIA, model: MODEL, version: PROMPT_VERSION }
  const rules = {
    buy_rank: "chosen_action_probability descending, ticker ascending",
    unavailable_decision_policy: "NO_ACTION",
    held_buy_does_not_add: true,
    sizing: "equal notional across accepted buys: min(0.20 * eod portfolio value, projected cash after sells / n)",
    projected_sell_uses: "decision-date close, 5 bps slippage, 10 bps transaction cost",
    mark_price: "close",
    weight_cap: "applied to the purchase notional; later price drift is not trimmed",
    momentum: "each day, decision-ready names ranked by return_20d descending then ticker, hold the top 5, equal weight, same costs and next-open execution",
    random: "one stream, seed 20260922 reseeded per date, five names, same costs and execution",
  }
  return {
    experiment_id: EXPERIMENT_ID,
    status: "FROZEN",
    final_run: true,
    initial_capital: INITIAL_CAPITAL,
    start_date: START_DATE,
    end_date: END_DATE,
    universe: "NIFTY100_CURRENT",
    max_positions: 5,
    max_position_weight: 0.2,
    leverage: false,
    shorting: false,
    decision_time: "EOD",
    execution: "NEXT_SESSION_OPEN",
    transaction_cost_bps: 10,
    slippage_bps: 5,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    benchmark: "NIFTY100_BUY_AND_HOLD",
    phase3_run_id: "JEV-20260922-V1-PHASE3-TEST",
    unavailable_decision_policy: "NO_ACTION",
    portfolio_rules: rules,
    hashes: {
      universe: shaFile(base, "config/universe.json"),
      constituent_list: shaFile(base, "data/universe/ind_nifty100list.csv"),
      trading_calendar: shaFile(base, "data/universe/trading_calendar.json"),
      feature_dataset: shaFile(base, "data/processed/market.duckdb"),
      decision_prompt: createHash("sha256").update(JSON.stringify(prompt)).digest("hex"),
      portfolio_rules: createHash("sha256").update(JSON.stringify(rules)).digest("hex"),
    },
  }
}

function shaFile(base: string, path: string) {
  return createHash("sha256").update(readFileSync(resolve(base, path))).digest("hex")
}

function inr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`
  if (minutes > 0) {
    const seconds = totalSec % 60
    return seconds > 0 ? `${minutes}m${String(seconds).padStart(2, "0")}s` : `${minutes}m`
  }
  return `${totalSec}s`
}

main().catch((error) => {
  if (error instanceof UnresolvedDecisionError) {
    console.error(
      `[V2] STOP unresolved call | ticker=${error.ticker} | date=${error.date} | status=${error.httpStatus ?? "n/a"} | error=${error.message} | retries=${error.attempts}`,
    )
    console.error(JSON.stringify({
      date: error.date,
      ticker: error.ticker,
      httpStatus: error.httpStatus,
      attempts: error.attempts,
      error: error.message,
      blocked: error.blocked,
      raw: error.raw,
    }))
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exit(1)
})
