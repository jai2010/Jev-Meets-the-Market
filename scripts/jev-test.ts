import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DuckDBInstance } from "@duckdb/node-api"
import { DB_PATH } from "../src/features/constants"
import type { FeatureRow } from "../src/features/indicators"
import { loadGatewayKey, requestDecision } from "../src/jev/client"
import { inputHash } from "../src/jev/hash"
import { selectSample } from "../src/jev/sample"
import { MODEL, PROMPT_VERSION, RUN_ID } from "../src/jev/schema"
import { heldTickers, marketState, portfolioState } from "../src/jev/state"
import { DECISION_DB, openDecisionDb, type StoredDecision } from "../src/jev/store"

const root = fileURLToPath(new URL("..", import.meta.url))

async function main() {
  const key = loadGatewayKey()
  const features = await DuckDBInstance.create(resolve(root, DB_PATH))
  const featureConn = await features.connect()
  const featureResult = await featureConn.run("SELECT * FROM stock_features WHERE decision_ready ORDER BY date, ticker")
  const ready = (await featureResult.getRowObjectsJson()) as FeatureRow[]
  featureConn.closeSync()
  features.closeSync()

  const sample = selectSample(ready)
  const held = new Set(heldTickers(sample.stocks.map((stock) => stock.ticker)))
  const cases = sample.cases.map((item) => {
    const market = marketState(item.row)
    const portfolio = portfolioState(item.row, held.has(item.ticker))
    const hash = inputHash({ market, portfolio, promptVersion: PROMPT_VERSION, model: MODEL })
    return { ...item, market, portfolio, hash }
  })

  const db = await openDecisionDb(resolve(root, DECISION_DB))
  const saved: StoredDecision[] = []
  let aborted: string | null = null

  const runCall = async (item: (typeof cases)[number], callKind: "primary" | "repeat") => {
    if (await db.hasOk(RUN_ID, item.hash, callKind)) return
    const result = await requestDecision({ market: item.market, portfolio: item.portfolio }, key)
    const row: StoredDecision = {
      id: randomUUID(),
      runId: RUN_ID,
      decisionDate: item.date,
      ticker: item.ticker,
      action: result.action,
      confidence: result.confidence,
      probabilities: result.probabilities,
      marketState: item.market,
      portfolioState: item.portfolio,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      createdAt: new Date().toISOString(),
      inputHash: item.hash,
      raw: result.raw,
      status: result.status,
      callKind,
      latencyMs: result.latencyMs,
      error: result.error,
    }
    await db.insert(row)
    saved.push(row)
    console.log(`${callKind} ${item.date} ${item.ticker} ${result.status} ${result.action ?? result.error}`)
    if (result.blocked) aborted = "customer_verification_required"
  }

  for (const item of cases) {
    await runCall(item, "primary")
    if (aborted) break
  }
  if (!aborted) {
    for (const item of cases.filter((_, index) => index % 5 === 0)) {
      await runCall(item, "repeat")
      if (aborted) break
    }
  }

  const all = await db.rows(RUN_ID)
  db.close()
  writeReport(sample, cases.map((item) => ({ date: item.date, ticker: item.ticker, archetype: item.archetype, held: held.has(item.ticker), hash: item.hash })), all, aborted)
  const ok = all.filter((row) => row.status === "OK" && row.call_kind === "primary").length
  console.log(`stored=${all.length} primary_ok=${ok} aborted=${aborted ?? "no"}`)
  if (aborted || ok < 25) process.exit(1)
}

function writeReport(
  sample: ReturnType<typeof selectSample>,
  plan: { date: string; ticker: string; archetype: string; held: boolean; hash: string }[],
  rows: Record<string, unknown>[],
  aborted: string | null,
) {
  const ok = rows.filter((row) => row.status === "OK")
  const errors = rows.filter((row) => row.status === "ERROR")
  const primary = rows.filter((row) => row.call_kind === "primary")
  const repeats = rows.filter((row) => row.call_kind === "repeat")
  const latencies = ok.map((row) => Number(row.latency_ms)).filter((value) => Number.isFinite(value))
  const averageLatency = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null
  const consistency = repeats.map((repeat) => {
    const original = primary.find((row) => row.input_hash === repeat.input_hash && row.status === "OK")
    return {
      ticker: repeat.ticker,
      date: repeat.decision_date,
      primary: original?.action ?? null,
      repeat: repeat.action ?? null,
      same: original?.action != null && original.action === repeat.action,
    }
  })
  const lines = [
    "# Phase 3 Jev decision test",
    "",
    `Run: ${RUN_ID}`,
    `Model: ${MODEL}`,
    `Prompt: ${PROMPT_VERSION}`,
    "",
    "This is an integration sample. It is not the six-month portfolio experiment. No profitability was calculated.",
    "",
    "## Sample rule",
    "",
    "Dates are the 0, 25, 50, 75, and 100 percent positions among sessions where at least 90 stocks are decision-ready.",
    "Stocks are chosen on the middle of those dates, one ticker each, in this order: nearest the 52-week high, lowest RSI, strongest 60-day return above the 200-day average, weakest 60-day return below that average, then smallest absolute 20-day return with RSI between 40 and 60. Ties use the ticker name.",
    "The first two selected tickers in alphabetical order are marked held in a synthetic portfolio. Cash is ₹6,00,000, portfolio value is ₹10,00,000, two positions, maximum five. Entry price for a held name is the close 20 sessions earlier. This is not the portfolio engine.",
    "",
    `Dates: ${sample.dates.join(", ")}`,
    "",
    "| Ticker | Archetype on the middle date | Held in the mock book |",
    "| --- | --- | --- |",
    ...sample.stocks.map((stock) => `| ${stock.ticker} | ${stock.archetype} | ${heldTickers(sample.stocks.map((item) => item.ticker)).includes(stock.ticker) ? "yes" : "no"} |`),
    "",
    "## Calls",
    "",
    `- Planned primary decisions: ${plan.length}`,
    `- Stored rows: ${rows.length}`,
    `- Successful calls: ${ok.length}`,
    `- Failed calls: ${errors.length}`,
    `- Repeated-input calls: ${repeats.length}`,
    `- Average latency of successful calls: ${averageLatency == null ? "n/a" : `${Math.round(averageLatency)} ms`}`,
    `- Account block: ${aborted ?? "none"}`,
    "",
    "Latency is recorded only so a hung client is visible. It is not a score.",
    "",
  ]
  if (aborted) {
    lines.push("The Gateway rejected the call before a decision was returned. The remaining sample was not sent.")
    lines.push("")
  }
  lines.push("## Decisions", "", "| Date | Ticker | Call | Status | Action | Confidence |", "| --- | --- | --- | --- | --- | ---: |")
  for (const row of rows) {
    lines.push(`| ${row.decision_date} | ${row.ticker} | ${row.call_kind} | ${row.status} | ${row.action ?? ""} | ${row.confidence ?? ""} |`)
  }
  lines.push("", "## Repeated-input consistency", "")
  if (consistency.length === 0) lines.push("No repeat calls were completed.")
  else {
    lines.push("| Date | Ticker | Primary | Repeat | Same action |", "| --- | --- | --- | --- | --- |")
    for (const item of consistency) lines.push(`| ${item.date} | ${item.ticker} | ${item.primary ?? ""} | ${item.repeat ?? ""} | ${item.same ? "yes" : "no"} |`)
  }
  lines.push("", "## Schema check", "")
  const invalid = ok.filter((row) => !["BUY", "HOLD", "SELL", "NO_ACTION"].includes(String(row.action)))
  lines.push(
    ok.length === 0
      ? "No successful decision was returned, so the action schema was not exercised."
      : invalid.length === 0
        ? "Every successful row has one of BUY, HOLD, SELL, NO_ACTION."
        : `${invalid.length} successful rows have an unexpected action.`,
  )
  lines.push("", "## Raw response example", "")
  const example = rows.find((row) => row.status === "OK") ?? rows[0]
  lines.push(example ? ["```json", JSON.stringify(example.raw_response_json ? JSON.parse(String(example.raw_response_json)) : null, null, 2), "```"].join("\n") : "No response was stored.")
  lines.push("")
  lines.push("The `confidence` column is the probability Jev assigned to the chosen action. The raw answer also contains its own `confidence` field, which is not that probability. Both are kept. The column was not rewritten.")
  lines.push("")
  writeFileSync(resolve(root, "results/phase3_jev_test.md"), `${lines.join("\n")}\n`)
  writeFileSync(
    resolve(root, "results/phase3_summary.json"),
    `${JSON.stringify({ run_id: RUN_ID, model: MODEL, prompt_version: PROMPT_VERSION, dates: sample.dates, stocks: sample.stocks, successful: ok.length, failed: errors.length, aborted, average_latency_ms: averageLatency, consistency }, null, 2)}\n`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
