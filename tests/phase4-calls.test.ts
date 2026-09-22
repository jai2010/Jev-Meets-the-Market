import { readFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertNotInterruptedDatabase,
  insertCompletedDecision,
  INTERRUPTED_PHASE4_DB,
  loadCompleteDecisions,
  MAX_GATEWAY_ATTEMPTS,
  openDecisionsDatabase,
  requestWithRetry,
  resolveEligibleDecisions,
  retryDelayMs,
  UnresolvedDecisionError,
  type CompletedDecision,
  type GatewayOutcome,
} from "../src/phase4/decisions"
import { emptyBook, EXPERIMENT_ID, executePlan, planTrades } from "../src/phase4/rules"
import { simulateAll } from "../src/phase4/simulate"

const root = resolve(import.meta.dirname, "..")
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("phase 4 Jev calls", () => {
  it("retries 429 using Retry-After and stores only the valid decision", async () => {
    const delays: number[] = []
    const { fetchImpl, statuses } = scripted([
      { status: 429, body: { error: "rate_limit_exceeded" }, retryAfter: "2" },
      { status: 200, body: decisionBody("BUY") },
    ])
    const db = await tempDb()
    try {
      const saved = new Map()
      let completed = false
      const signals = await resolveEligibleDecisions({
        date: "2026-03-10",
        tickers: ["ITC"],
        saved,
        call: (ticker) => callTicker(ticker, fetchImpl, (ms) => delays.push(ms)),
        persist: (ticker, decision) => store(db.connection, "2026-03-10", ticker, decision),
        onBatchComplete: () => {
          completed = true
        },
      })
      expect(statuses).toEqual([429, 200])
      expect(delays).toEqual([2_000])
      expect(signals).toEqual([{ ticker: "ITC", action: "BUY", chosenProbability: 0.81 }])
      expect(completed).toBe(true)
      expect(await rows(db.connection)).toEqual([{ ticker: "ITC", action: "BUY", status: "OK", chosen: 0.81 }])
    } finally {
      db.close()
    }
  })

  it("retries 503 with exponential backoff and does not store the failure", async () => {
    const delays: number[] = []
    const { fetchImpl, statuses } = scripted([
      { status: 503, body: { error: "unavailable" } },
      { status: 200, body: decisionBody("HOLD") },
    ])
    const db = await tempDb()
    try {
      const signals = await resolveEligibleDecisions({
        date: "2026-03-11",
        tickers: ["ITC"],
        saved: new Map(),
        call: (ticker) => callTicker(ticker, fetchImpl, (ms) => delays.push(ms)),
        persist: (ticker, decision) => store(db.connection, "2026-03-11", ticker, decision),
      })
      expect(statuses).toEqual([503, 200])
      expect(delays).toEqual([1_000])
      expect(signals[0]).toMatchObject({ ticker: "ITC", action: "HOLD", chosenProbability: 0.81 })
      expect(await rows(db.connection)).toEqual([{ ticker: "ITC", action: "HOLD", status: "OK", chosen: 0.81 }])
    } finally {
      db.close()
    }
  })

  it("stops the batch when retries are exhausted and does not trade", async () => {
    const raw = { error: "rate_limit_exceeded", request_id: "req-429" }
    const { fetchImpl, statuses } = scripted(
      Array.from({ length: MAX_GATEWAY_ATTEMPTS }, () => ({ status: 429, body: raw })),
    )
    const db = await tempDb()
    const delays: number[] = []
    let completed = false
    const trades: string[] = []
    try {
      await expect(async () => {
        const signals = await resolveEligibleDecisions({
          date: "2026-03-25",
          tickers: ["AAA", "BBB"],
          saved: new Map(),
          concurrency: 1,
          call: (ticker) => callTicker(ticker, fetchImpl, (ms) => delays.push(ms)),
          persist: (ticker, decision) => store(db.connection, "2026-03-25", ticker, decision),
          onBatchComplete: () => {
            completed = true
          },
        })
        const plan = planTrades({
          book: emptyBook(),
          signals,
          closes: { AAA: 100, BBB: 100 },
          portfolioValue: 1_000_000,
        })
        plan.decisionDate = "2026-03-25"
        trades.push(...executePlan({ book: emptyBook(), plan, executionDate: "2026-03-26", opens: { AAA: 100, BBB: 100 } }).trades.map((trade) => trade.ticker))
      }).rejects.toMatchObject({
        name: "UnresolvedDecisionError",
        ticker: "AAA",
        httpStatus: 429,
        attempts: MAX_GATEWAY_ATTEMPTS,
        raw,
      })
      expect(statuses).toHaveLength(MAX_GATEWAY_ATTEMPTS)
      expect(statuses.every((status) => status === 429)).toBe(true)
      expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000])
      expect(completed).toBe(false)
      expect(trades).toEqual([])
      expect(await rows(db.connection)).toEqual([])
    } finally {
      db.close()
    }
  })

  it("does not execute a plan from an incomplete decision batch", async () => {
    const book = emptyBook()
    await expect(simulateAll({
      dates: ["2026-03-10", "2026-03-11"],
      benchmarkCloses: [100, 101],
      openOf: () => 50,
      closeOf: () => 50,
      momentumEligible: () => [],
      randomEligible: () => [],
      resolveJev: async (date) => {
        if (date === "2026-03-10") {
          throw new UnresolvedDecisionError({
            date,
            ticker: "ITC",
            httpStatus: 503,
            attempts: MAX_GATEWAY_ATTEMPTS,
            error: "http 503",
            raw: { error: "unavailable" },
            blocked: false,
          })
        }
        return [{ ticker: "ITC", action: "BUY", chosenProbability: 0.9 }]
      },
    })).rejects.toBeInstanceOf(UnresolvedDecisionError)
    expect(book.cash).toBe(1_000_000)
    expect(book.positions).toEqual([])
  })

  it("rejects a duplicate decision key and ignores stored errors on resume", async () => {
    const db = await tempDb()
    try {
      const decision = sampleDecision()
      await insertCompletedDecision(db.connection, {
        date: "2026-03-10",
        ticker: "AAA",
        market: { ticker: "AAA" },
        portfolio: {},
        inputHash: "a",
        decision,
      })
      await expect(insertCompletedDecision(db.connection, {
        date: "2026-03-10",
        ticker: "AAA",
        market: { ticker: "AAA" },
        portfolio: {},
        inputHash: "b",
        decision,
      })).rejects.toThrow(/constraint|duplicate/i)
      await db.connection.run(
        `INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [EXPERIMENT_ID, "2026-03-10", "BBB", "{}", "{}", null, null, null, null, "typesafe-ai/jev", "decision_schema_v1", "err", JSON.stringify({ error: "rate_limit_exceeded" }), "2026-09-22T00:00:00.000Z", 5, 3, "ERROR", "http 429"],
      )
      const saved = await loadCompleteDecisions(db.connection)
      expect([...saved.keys()]).toEqual(["2026-03-10|AAA"])
      const called: string[] = []
      await resolveEligibleDecisions({
        date: "2026-03-10",
        tickers: ["AAA", "BBB"],
        saved,
        call: async (ticker) => {
          called.push(ticker)
          return { ok: true, decision: sampleDecision() }
        },
        persist: async () => {},
      })
      expect(called).toEqual(["BBB"])
      expect([...(await loadCompleteDecisions(db.connection)).keys()]).toEqual(["2026-03-10|AAA"])
    } finally {
      db.close()
    }
  })

  it("does not open the interrupted experiment database", () => {
    expect(() => assertNotInterruptedDatabase(resolve(root, INTERRUPTED_PHASE4_DB))).toThrow(/JEV-20260922-V1/)
    const source = readFileSync(resolve(root, "scripts/phase4-run.ts"), "utf8")
    expect(source.includes("progress.json")).toBe(false)
    expect(retryDelayMs(1, null)).toBe(1_000)
    expect(retryDelayMs(3, "4")).toBe(4_000)
  })
})

function decisionBody(choice: string) {
  return {
    answers: {
      action: {
        choice,
        probabilities: { BUY: 0.81, HOLD: 0.81, SELL: 0.05, NO_ACTION: 0.05 },
        confidence: 0.33,
      },
    },
  }
}

function sampleDecision(): CompletedDecision {
  return {
    action: "BUY",
    chosen: 0.81,
    rawConfidence: 0.33,
    probabilities: { BUY: 0.81, HOLD: 0.09, SELL: 0.05, NO_ACTION: 0.05 },
    latencyMs: 10,
    attempts: 1,
    raw: decisionBody("BUY"),
  }
}

function scripted(responses: { status: number; body: unknown; retryAfter?: string }[]) {
  const queue = [...responses]
  const statuses: number[] = []
  const fetchImpl: typeof fetch = async () => {
    const next = queue.shift()
    if (!next) throw new Error("no scripted response left")
    statuses.push(next.status)
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: next.retryAfter == null ? undefined : { "retry-after": next.retryAfter },
    })
  }
  return { fetchImpl, statuses }
}

async function callTicker(ticker: string, fetchImpl: typeof fetch, sleep: (ms: number) => void): Promise<
  { ok: true; decision: CompletedDecision } | Extract<GatewayOutcome, { ok: false }>
> {
  const outcome = await requestWithRetry(
    { market: { ticker }, portfolio: { currently_held: false } },
    "test-key",
    { fetchImpl, sleep: async (ms) => sleep(ms) },
  )
  if (!outcome.ok) return outcome
  return { ok: true, decision: outcome }
}

async function tempDb() {
  const dir = await mkdtemp(join(tmpdir(), "phase4-decisions-"))
  dirs.push(dir)
  return openDecisionsDatabase(join(dir, "decisions.duckdb"))
}

async function store(connection: Awaited<ReturnType<typeof openDecisionsDatabase>>["connection"], date: string, ticker: string, decision: CompletedDecision) {
  await insertCompletedDecision(connection, {
    date,
    ticker,
    market: { ticker },
    portfolio: { currently_held: false },
    inputHash: `${date}|${ticker}`,
    decision,
  })
}

async function rows(connection: Awaited<ReturnType<typeof openDecisionsDatabase>>["connection"]) {
  const result = await connection.run(
    "SELECT ticker, action, status, chosen_action_probability AS chosen FROM decisions ORDER BY ticker",
  )
  return (await result.getRowObjectsJson()).map((row) => ({
    ticker: String(row.ticker),
    action: row.action == null ? null : String(row.action),
    status: String(row.status),
    chosen: row.chosen == null ? null : Number(row.chosen),
  }))
}
