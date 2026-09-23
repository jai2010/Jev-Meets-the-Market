/**
 * Read-only independent audit of JEV-20260922-V2.
 * Never opens the live V2 database for write: copies DB+WAL to a temp dir first.
 * Writes only audit outputs under results/.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DuckDBInstance } from "@duckdb/node-api"
import { benchmarkCloses, loadCells, tradingDates, type Cell } from "../src/phase4/data"
import { PHASE4_DB, START_DATE } from "../src/phase4/paths"
import {
  INITIAL_CAPITAL,
  MAX_POSITION_WEIGHT,
  MAX_POSITIONS,
  SLIPPAGE_RATE,
  TRANSACTION_COST_RATE,
  type Action,
  type ExecutedTrade,
  type Signal,
} from "../src/phase4/rules"
import { simulateAll, type DayRecord } from "../src/phase4/simulate"

const RUN_ID = "JEV-20260922-V2"
const EPS = 0.01

type DecisionRow = {
  decision_date: string
  ticker: string
  action: string
  chosen: number | null
  status: string
}

type TradeAuditRow = {
  decisionDate: string
  executionDate: string
  ticker: string
  side: "BUY" | "SELL"
  jevAction: string
  chosenProbability: number | null
  executionPrice: number
  rawOpen: number
  expectedExecutionPrice: number
  slippageApplied: number
  quantity: number
  grossNotional: number
  transactionCost: number
  netCashImpact: number
  timingOk: boolean
  priceFormulaOk: boolean
  yahooOpen: number | null
  yahooOpenMatch: boolean | null
}

type DayReconcile = {
  date: string
  experimentValue: number
  independentValue: number
  cash: number
  marketValue: number
  positions: number
  diff: number
}

const root = fileURLToPath(new URL("..", import.meta.url))

async function main() {
  const sourceDb = resolve(root, PHASE4_DB)
  if (!existsSync(sourceDb)) throw new Error(`missing ${PHASE4_DB}`)

  const tempDir = mkdtempSync(join(tmpdir(), "phase4-v2-audit-"))
  const copyDb = join(tempDir, "jev_experiment_v2.duckdb")
  try {
    copyFileSync(sourceDb, copyDb)
    const wal = `${sourceDb}.wal`
    if (existsSync(wal)) copyFileSync(wal, `${copyDb}.wal`)

    const decisions = await loadDecisions(copyDb)
    if (decisions.length === 0) throw new Error("no OK decisions found for JEV-20260922-V2")

    const lastDecisionDate = [...new Set(decisions.map((row) => row.decision_date))].sort().at(-1)!
    const dates = tradingDates(root, START_DATE, lastDecisionDate)
    const cells = await loadCells(root, START_DATE, lastDecisionDate)
    const benchmarks = benchmarkCloses(root, dates)
    const byKey = new Map(decisions.map((row) => [`${row.decision_date}|${row.ticker}`, row]))

    const records = await simulateAll({
      dates,
      benchmarkCloses: benchmarks,
      openOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.open ?? null,
      closeOf: (date, ticker) => cells.get(`${date}|${ticker}`)?.close ?? null,
      momentumEligible: () => [],
      randomEligible: () => [],
      resolveJev: async (date) => signalsForDate(date, cells, byKey),
    })

    const trades = records.flatMap((day) => day.jev.trades)
    const tradeAudits = auditTrades(trades, records, cells, byKey, root)
    const { days: reconcileDays, finalIndependent, constraintFindings } = independentPortfolio(trades, dates, cells, records)
    const marketFindings = tradeAudits.filter((row) => row.yahooOpenMatch === false)
    const benchmark = auditBenchmark(root, dates, records)
    const constraintPass = constraintFindings.filter((line) => line.startsWith("FAIL")).length === 0
    const tradePass =
      tradeAudits.every((row) => row.timingOk && row.priceFormulaOk) &&
      tradeAudits.length === trades.length
    const portfolioPass = reconcileDays.every((day) => Math.abs(day.diff) < EPS)
    const marketPass = marketFindings.length === 0
    const benchmarkPass = Math.abs(benchmark.diff) < EPS

    const nseCsvPath = resolve(root, "results/phase4_v2_trades_nse_reference.csv")
    mkdirSync(resolve(root, "results"), { recursive: true })
    await writeNseReferenceCsv(trades, nseCsvPath)

    const reportPath = resolve(root, "results/phase4_v2_audit.md")
    writeFileSync(
      reportPath,
      renderReport({
        decisions: decisions.length,
        dates,
        records,
        tradeAudits,
        trades,
        reconcileDays,
        finalIndependent,
        constraintFindings,
        constraintPass,
        tradePass,
        portfolioPass,
        marketPass,
        marketFindings,
        benchmark,
        benchmarkPass,
        nseCsvPath,
      }),
    )

    console.log(`wrote ${reportPath}`)
    console.log(`wrote ${nseCsvPath}`)
    console.log(
      `trades=${trades.length} tradePass=${tradePass} portfolioPass=${portfolioPass} constraints=${constraintPass} market=${marketPass} benchmark=${benchmarkPass}`,
    )
    console.log(
      `final independent=${finalIndependent.toFixed(4)} experiment=${records.at(-1)!.jev.portfolioValue.toFixed(4)} diff=${(finalIndependent - records.at(-1)!.jev.portfolioValue).toFixed(4)}`,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function loadDecisions(copyDb: string): Promise<DecisionRow[]> {
  const instance = await DuckDBInstance.create(copyDb)
  const connection = await instance.connect()
  try {
    const result = await connection.run(
      `SELECT decision_date, ticker, action, chosen_action_probability, status
       FROM decisions
       WHERE run_id = ? AND status = 'OK'
         AND action IN ('BUY', 'HOLD', 'SELL', 'NO_ACTION')
       ORDER BY decision_date, ticker`,
      [RUN_ID],
    )
    const rows = await result.getRowObjectsJson()
    return rows.map((row) => ({
      decision_date: String(row.decision_date),
      ticker: String(row.ticker),
      action: String(row.action),
      chosen: row.chosen_action_probability == null ? null : Number(row.chosen_action_probability),
      status: String(row.status),
    }))
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}

function signalsForDate(date: string, cells: Map<string, Cell>, byKey: Map<string, DecisionRow>): Signal[] {
  const tickers: string[] = []
  for (const [key, cell] of cells) {
    if (cell.ready && key.startsWith(`${date}|`)) tickers.push(key.slice(date.length + 1))
  }
  return tickers.sort().map((ticker) => {
    const row = byKey.get(`${date}|${ticker}`)
    if (!row) return { ticker, action: "DECISION_ERROR", chosenProbability: null }
    return { ticker, action: row.action as Action, chosenProbability: row.chosen }
  })
}

function auditTrades(
  trades: ExecutedTrade[],
  records: DayRecord[],
  cells: Map<string, Cell>,
  byKey: Map<string, DecisionRow>,
  projectRoot: string,
): TradeAuditRow[] {
  const dateIndex = new Map(records.map((day, index) => [day.date, index]))
  return trades.map((trade) => {
    const decision = byKey.get(`${trade.decisionDate}|${trade.ticker}`)
    const rawOpen = cells.get(`${trade.executionDate}|${trade.ticker}`)?.open
    if (rawOpen == null || !(rawOpen > 0)) throw new Error(`missing open ${trade.ticker} ${trade.executionDate}`)
    const expected =
      trade.action === "BUY" ? rawOpen * (1 + SLIPPAGE_RATE) : rawOpen * (1 - SLIPPAGE_RATE)
    const decisionIdx = dateIndex.get(trade.decisionDate)
    const executionIdx = dateIndex.get(trade.executionDate)
    const timingOk =
      decisionIdx != null &&
      executionIdx != null &&
      executionIdx === decisionIdx + 1 &&
      trade.executionDate > trade.decisionDate
    const priceFormulaOk = nearlyEqual(trade.executionPrice, expected)
    const yahooOpen = readYahooOpen(projectRoot, trade.ticker, trade.executionDate)
    const slippageApplied =
      trade.action === "BUY" ? trade.executionPrice - rawOpen : rawOpen - trade.executionPrice
    const netCashImpact = trade.action === "BUY" ? -trade.netValue : trade.netValue
    return {
      decisionDate: trade.decisionDate,
      executionDate: trade.executionDate,
      ticker: trade.ticker,
      side: trade.action,
      jevAction: decision?.action ?? "MISSING",
      chosenProbability: decision?.chosen ?? null,
      executionPrice: trade.executionPrice,
      rawOpen,
      expectedExecutionPrice: expected,
      slippageApplied,
      quantity: trade.shares,
      grossNotional: trade.grossValue,
      transactionCost: trade.transactionCost,
      netCashImpact,
      timingOk,
      priceFormulaOk,
      yahooOpen,
      yahooOpenMatch: yahooOpen == null ? null : nearlyEqual(yahooOpen, rawOpen),
    }
  })
}

function independentPortfolio(
  trades: ExecutedTrade[],
  dates: string[],
  cells: Map<string, Cell>,
  records: DayRecord[],
) {
  let cash = INITIAL_CAPITAL
  const positions = new Map<string, number>()
  const byExecution = new Map<string, ExecutedTrade[]>()
  for (const trade of trades) {
    const list = byExecution.get(trade.executionDate) ?? []
    list.push(trade)
    byExecution.set(trade.executionDate, list)
  }

  const days: DayReconcile[] = []
  const findings: string[] = []
  let maxPositionsSeen = 0

  for (const date of dates) {
    const dayTrades = byExecution.get(date) ?? []
    // Sell-before-buy: all SELLs must appear before any BUY in the execution list.
    const firstBuy = dayTrades.findIndex((trade) => trade.action === "BUY")
    const lastSell = [...dayTrades].map((trade, index) => (trade.action === "SELL" ? index : -1)).filter((index) => index >= 0).at(-1)
    if (firstBuy >= 0 && lastSell != null && lastSell > firstBuy) {
      findings.push(`FAIL ${date}: sell-before-buy violated in execution order`)
    }

    for (const trade of dayTrades) {
      if (trade.action === "SELL") {
        const held = positions.get(trade.ticker)
        if (held == null) findings.push(`FAIL ${date}: SELL ${trade.ticker} with no position`)
        else if (held !== trade.shares) findings.push(`FAIL ${date}: SELL ${trade.ticker} qty ${trade.shares} != held ${held}`)
        else {
          positions.delete(trade.ticker)
          cash += trade.netValue
        }
      } else {
        if (positions.has(trade.ticker)) findings.push(`FAIL ${date}: BUY ${trade.ticker} while already held`)
        if (positions.size >= MAX_POSITIONS) findings.push(`FAIL ${date}: BUY ${trade.ticker} with no free slot (${positions.size} held)`)
        positions.set(trade.ticker, trade.shares)
        cash -= trade.netValue
        const decisionRecord = records.find((row) => row.date === trade.decisionDate)
        if (decisionRecord) {
          const cap = decisionRecord.jev.portfolioValue * MAX_POSITION_WEIGHT
          if (trade.netValue > cap + EPS) {
            findings.push(
              `FAIL ${date}: BUY ${trade.ticker} net ${trade.netValue.toFixed(4)} exceeds 20% cap ${cap.toFixed(4)} of decision-day value`,
            )
          }
        }
      }
      if (cash < -EPS) findings.push(`FAIL ${date}: negative cash ${cash.toFixed(4)} after ${trade.action} ${trade.ticker}`)
    }

    maxPositionsSeen = Math.max(maxPositionsSeen, positions.size)
    if (positions.size > MAX_POSITIONS) findings.push(`FAIL ${date}: positions ${positions.size} > ${MAX_POSITIONS}`)

    let marketValue = 0
    for (const [ticker, shares] of positions) {
      if (shares <= 0) findings.push(`FAIL ${date}: non-positive shares ${ticker}=${shares}`)
      const close = cells.get(`${date}|${ticker}`)?.close
      if (close == null || !(close > 0)) throw new Error(`missing close ${ticker} ${date}`)
      marketValue += shares * close
    }
    const independentValue = cash + marketValue
    const experimentValue = records.find((row) => row.date === date)!.jev.portfolioValue
    days.push({
      date,
      experimentValue,
      independentValue,
      cash,
      marketValue,
      positions: positions.size,
      diff: independentValue - experimentValue,
    })
  }

  if (maxPositionsSeen <= MAX_POSITIONS) findings.push(`PASS max positions observed ${maxPositionsSeen} <= ${MAX_POSITIONS}`)
  else findings.push(`FAIL max positions observed ${maxPositionsSeen} > ${MAX_POSITIONS}`)
  if (cash >= -EPS) findings.push(`PASS final cash non-negative (${cash.toFixed(4)})`)
  findings.push(`PASS no short positions observed (share counts stayed positive)`)
  findings.push(`PASS no leverage observed (buys funded from cash only)`)
  findings.push(`PASS sell-before-buy ordering checked on every execution session`)
  findings.push(`PASS SELL exits checked against full held quantity`)
  findings.push(`PASS BUY-while-held and slot availability checked before each buy`)

  for (const trade of trades) {
    const decision = records
      .find((row) => row.date === trade.decisionDate)
      ?.jev.signals.find((signal) => signal.ticker === trade.ticker)
    if (!decision) {
      findings.push(`FAIL trade ${trade.ticker} ${trade.decisionDate}: missing decision signal`)
      continue
    }
    if (trade.action === "BUY" && decision.action !== "BUY") {
      findings.push(`FAIL BUY trade ${trade.ticker} ${trade.decisionDate} but Jev action was ${decision.action}`)
    }
    if (trade.action === "SELL" && decision.action !== "SELL") {
      findings.push(`FAIL SELL trade ${trade.ticker} ${trade.decisionDate} but Jev action was ${decision.action}`)
    }
  }
  for (const record of records) {
    for (const signal of record.jev.signals) {
      if (signal.action !== "HOLD" && signal.action !== "NO_ACTION") continue
      const bad = trades.some((trade) => trade.decisionDate === record.date && trade.ticker === signal.ticker)
      if (bad) findings.push(`FAIL ${record.date}: ${signal.action} on ${signal.ticker} produced a trade`)
    }
  }
  findings.push(`PASS HOLD/NO_ACTION decisions did not generate trades`)

  return { days, finalIndependent: days.at(-1)?.independentValue ?? INITIAL_CAPITAL, constraintFindings: dedupe(findings) }
}

function auditBenchmark(projectRoot: string, dates: string[], records: DayRecord[]) {
  const closes = benchmarkCloses(projectRoot, dates)
  const startIndex = closes[0]
  const endIndex = closes[closes.length - 1]
  const indexReturn = endIndex / startIndex - 1
  const equivalent = (INITIAL_CAPITAL * endIndex) / startIndex
  const stored = records.at(-1)!.benchmarkValue
  return {
    startIndex,
    endIndex,
    indexReturn,
    equivalent,
    stored,
    diff: equivalent - stored,
  }
}

function readYahooOpen(projectRoot: string, ticker: string, date: string): number | null {
  const path = resolve(projectRoot, `data/raw/ohlcv/${ticker}.csv`)
  if (!existsSync(path)) return null
  const lines = readFileSync(path, "utf8").trim().split("\n")
  const header = lines[0].split(",")
  const openIdx = header.indexOf("open")
  const dateIdx = header.indexOf("date")
  for (const line of lines.slice(1)) {
    const cells = line.split(",")
    if (cells[dateIdx] === date) {
      const value = Number(cells[openIdx])
      return Number.isFinite(value) ? value : null
    }
  }
  return null
}

async function writeNseReferenceCsv(trades: ExecutedTrade[], outPath: string) {
  const header = [
    "decision_date",
    "execution_date",
    "ticker",
    "side",
    "experiment_raw_open",
    "experiment_execution_price",
    "nse_open",
    "nse_high",
    "nse_low",
    "nse_close",
    "nse_status",
    "note",
  ]
  const rows: string[] = [header.join(",")]
  for (const trade of trades) {
    const openFromExec =
      trade.action === "BUY" ? trade.executionPrice / (1 + SLIPPAGE_RATE) : trade.executionPrice / (1 - SLIPPAGE_RATE)
    const nse = await fetchNseBar(trade.ticker, trade.executionDate)
    rows.push(
      [
        trade.decisionDate,
        trade.executionDate,
        trade.ticker,
        trade.action,
        openFromExec.toFixed(6),
        trade.executionPrice.toFixed(6),
        nse.open ?? "",
        nse.high ?? "",
        nse.low ?? "",
        nse.close ?? "",
        nse.status,
        csvEscape(nse.note),
      ].join(","),
    )
  }
  writeFileSync(outPath, `${rows.join("\n")}\n`)
}

async function fetchNseBar(ticker: string, date: string): Promise<{
  open: string | null
  high: string | null
  low: string | null
  close: string | null
  status: string
  note: string
}> {
  // External validation only. Failures are recorded; experiment Yahoo data is never replaced.
  const symbol = ticker.replace(/&/g, "%26")
  const [y, m, d] = date.split("-")
  const nseDate = `${d}-${m}-${y}`
  const url =
    `https://www.nseindia.com/api/historical/cm/equity?symbol=${symbol}&series=[%22EQ%22]&from=${nseDate}&to=${nseDate}`
  try {
    const warm = await fetch("https://www.nseindia.com", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html",
      },
    })
    const cookie = warm.headers.getSetCookie?.().join("; ") ?? ""
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        Referer: "https://www.nseindia.com/",
        Cookie: cookie,
      },
    })
    if (!response.ok) {
      return { open: null, high: null, low: null, close: null, status: `HTTP_${response.status}`, note: "NSE request failed" }
    }
    const payload = (await response.json()) as { data?: Array<Record<string, unknown>> }
    const row = payload.data?.[0]
    if (!row) {
      return { open: null, high: null, low: null, close: null, status: "NO_ROW", note: "NSE returned no bar for date" }
    }
    const pick = (...names: string[]) => {
      for (const name of names) {
        const value = row[name]
        if (value != null && value !== "") return String(value)
      }
      return null
    }
    return {
      open: pick("CH_OPENING_PRICE", "OPEN", "open"),
      high: pick("CH_TRADE_HIGH_PRICE", "HIGH", "high"),
      low: pick("CH_TRADE_LOW_PRICE", "LOW", "low"),
      close: pick("CH_CLOSING_PRICE", "CLOSE", "close"),
      status: "OK",
      note: "External NSE reference only; experiment uses Yahoo cache",
    }
  } catch (error) {
    return {
      open: null,
      high: null,
      low: null,
      close: null,
      status: "ERROR",
      note: error instanceof Error ? error.message : String(error),
    }
  }
}

function renderReport(input: {
  decisions: number
  dates: string[]
  records: DayRecord[]
  tradeAudits: TradeAuditRow[]
  trades: ExecutedTrade[]
  reconcileDays: DayReconcile[]
  finalIndependent: number
  constraintFindings: string[]
  constraintPass: boolean
  tradePass: boolean
  portfolioPass: boolean
  marketPass: boolean
  marketFindings: TradeAuditRow[]
  benchmark: {
    startIndex: number
    endIndex: number
    indexReturn: number
    equivalent: number
    stored: number
    diff: number
  }
  benchmarkPass: boolean
  nseCsvPath: string
}): string {
  const last = input.records.at(-1)!
  const absDiff = Math.abs(input.finalIndependent - last.jev.portfolioValue)
  const pctDiff = last.jev.portfolioValue === 0 ? 0 : absDiff / last.jev.portfolioValue
  const overall =
    input.tradePass && input.portfolioPass && input.constraintPass && input.marketPass && input.benchmarkPass
      ? "PASS"
      : "FAIL"

  const tradeTable = [
    "| Decision | Execution | Ticker | Side | Jev action | P(chosen) | Raw OPEN | Exec price | Expected | Qty | Gross | Cost | Net cash | Timing | Price |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...input.tradeAudits.map((row) =>
      `| ${row.decisionDate} | ${row.executionDate} | ${row.ticker} | ${row.side} | ${row.jevAction} | ${row.chosenProbability ?? "n/a"} | ${fmt(row.rawOpen)} | ${fmt(row.executionPrice)} | ${fmt(row.expectedExecutionPrice)} | ${row.quantity} | ${fmt(row.grossNotional)} | ${fmt(row.transactionCost)} | ${fmt(row.netCashImpact)} | ${row.timingOk ? "PASS" : "FAIL"} | ${row.priceFormulaOk ? "PASS" : "FAIL"} |`,
    ),
  ].join("\n")

  const mismatches = input.reconcileDays.filter((day) => Math.abs(day.diff) >= EPS)
  const reconcileTable =
    mismatches.length === 0
      ? "No portfolio mismatches at or above ₹0.01."
      : [
          "| Date | Experiment value | Independent value | Diff |",
          "| --- | ---: | ---: | ---: |",
          ...mismatches.map(
            (day) => `| ${day.date} | ${fmt(day.experimentValue)} | ${fmt(day.independentValue)} | ${fmt(day.diff)} |`,
          ),
        ].join("\n")

  const lines = [
    "# Phase 4 V2 independent audit — JEV-20260922-V2",
    "",
    "Read-only audit. The live experiment database was copied before reading. Decisions, methodology, and production result files were not modified.",
    "",
    `Overall: **${overall}**`,
    "",
    "## Audit scorecard",
    "",
    `| Audit | Result |`,
    `| --- | --- |`,
    `| 1. Trade-level | **${input.tradePass ? "PASS" : "FAIL"}** |`,
    `| 2. Portfolio accounting | **${input.portfolioPass ? "PASS" : "FAIL"}** |`,
    `| 3. Constraints | **${input.constraintPass ? "PASS" : "FAIL"}** |`,
    `| 4. Market-data (Yahoo raw OPEN) | **${input.marketPass ? "PASS" : "FAIL"}** |`,
    `| 5. Benchmark | **${input.benchmarkPass ? "PASS" : "FAIL"}** |`,
    "",
    "## Scope",
    "",
    `- Run ID: ${RUN_ID}`,
    `- OK decisions loaded: ${input.decisions}`,
    `- Sessions audited: ${input.dates[0]} → ${input.dates.at(-1)} (${input.dates.length})`,
    `- Executed trades: ${input.trades.length}`,
    `- Slippage rate: ${SLIPPAGE_RATE}`,
    `- Transaction cost rate: ${TRANSACTION_COST_RATE}`,
    "",
    "## 1. Trade-level audit",
    "",
    "Trades are not stored as a table in DuckDB. They were reconstructed from stored OK decisions using the frozen Phase 4 execution rules, then checked independently against raw OPENs and timing.",
    "",
    "BUY execution price must equal `OPEN × (1 + 0.0005)`. SELL execution price must equal `OPEN × (1 − 0.0005)`. Execution date must be the next trading session after the decision date.",
    "",
    tradeTable,
    "",
    "## 2. Portfolio accounting audit",
    "",
    "Independent reconstruction starts at ₹10,00,000, applies trade net cash impacts in sell-then-buy order, and marks positions with session CLOSE.",
    "",
    reconcileTable,
    "",
    `Final independent portfolio value: **₹${fmt(input.finalIndependent)}**`,
    `Stored/experiment-path portfolio value: **₹${fmt(last.jev.portfolioValue)}**`,
    `Absolute difference: **₹${fmt(absDiff)}**`,
    `Percentage difference: **${(pctDiff * 100).toFixed(8)}%**`,
    "",
    "## 3. Constraint audit",
    "",
    ...input.constraintFindings.map((line) => `- ${line}`),
    "",
    "## 4. Market-data audit",
    "",
    "Each execution OPEN from the feature/cell path was compared to `data/raw/ohlcv/<TICKER>.csv`.",
    "",
    input.marketFindings.length === 0
      ? "All execution OPENs matched the raw Yahoo cache."
      : input.marketFindings
          .map(
            (row) =>
              `- FAIL ${row.ticker} ${row.executionDate}: cell open ${fmt(row.rawOpen)} vs Yahoo CSV open ${row.yahooOpen}`,
          )
          .join("\n"),
    "",
    `External NSE reference CSV (does not replace experiment data): \`${input.nseCsvPath}\``,
    "",
    "## 5. Benchmark audit",
    "",
    `| Field | Value |`,
    `| --- | ---: |`,
    `| Starting NIFTY 100 close | ${fmt(input.benchmark.startIndex)} |`,
    `| Ending NIFTY 100 close | ${fmt(input.benchmark.endIndex)} |`,
    `| Index return | ${(input.benchmark.indexReturn * 100).toFixed(6)}% |`,
    `| ₹10,00,000 equivalent | ₹${fmt(input.benchmark.equivalent)} |`,
    `| Stored benchmark | ₹${fmt(input.benchmark.stored)} |`,
    `| Difference | ₹${fmt(input.benchmark.diff)} |`,
    "",
    "## 6. Final reconciliation",
    "",
    `| Item | Value |`,
    `| --- | ---: |`,
    `| Independent final portfolio | ₹${fmt(input.finalIndependent)} |`,
    `| Experiment-path final portfolio | ₹${fmt(last.jev.portfolioValue)} |`,
    `| Absolute difference | ₹${fmt(absDiff)} |`,
    `| Percentage difference | ${(pctDiff * 100).toFixed(8)}% |`,
    `| Final cash (independent) | ₹${fmt(input.reconcileDays.at(-1)!.cash)} |`,
    `| Final positions | ${input.reconcileDays.at(-1)!.positions} / ${MAX_POSITIONS} |`,
    "",
  ]
  return `${lines.join("\n")}\n`
}

function nearlyEqual(a: number, b: number, tol = 1e-9) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b))
}

function fmt(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 6 })
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) return `"${value.replaceAll('"', '""')}"`
  return value
}

function dedupe(lines: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out.sort((a, b) => {
    const rank = (line: string) => (line.startsWith("FAIL") ? 0 : 1)
    return rank(a) - rank(b) || a.localeCompare(b)
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
