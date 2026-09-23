import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api"
import { rawConfidenceFromPayload } from "../audit/phase3-stats"
import { isAccountBlock, parseDecision } from "../jev/client"
import { ACTION_CRITERIA, ACTIONS, DECISION_INSTRUCTIONS, MODEL, PROMPT_VERSION, type Action } from "../jev/schema"
import { EXPERIMENT_ID, type Signal } from "./rules"

/** Interrupted artifact. Never opened for writing. */
export const INTERRUPTED_PHASE4_DB = "data/processed/phase4/jev_experiment.duckdb"

export const MAX_GATEWAY_ATTEMPTS = 6
export const BACKOFF_CAP_MS = 60_000

const VALID_ACTIONS = new Set<string>(ACTIONS)

export type CompletedDecision = {
  action: Action
  chosen: number | null
  rawConfidence: number | null
  probabilities: Record<string, number> | null
  latencyMs: number
  attempts: number
  raw: unknown
}

/** A stored row that resume is allowed to treat as finished. */
export type ResumeDecision = {
  action: string | null
  chosen: number | null
  rawConfidence: number | null
  probabilities: Record<string, number> | null
  status: string
  latencyMs: number
  attempts: number
}

export type GatewayFailure = {
  ok: false
  httpStatus: number | null
  attempts: number
  error: string
  raw: unknown
  blocked: boolean
}

export type GatewayOutcome = ({ ok: true } & CompletedDecision) | GatewayFailure

export class UnresolvedDecisionError extends Error {
  readonly date: string
  readonly ticker: string
  readonly httpStatus: number | null
  readonly attempts: number
  readonly raw: unknown
  readonly blocked: boolean

  constructor(input: {
    date: string
    ticker: string
    httpStatus: number | null
    attempts: number
    error: string
    raw: unknown
    blocked: boolean
  }) {
    super(input.error)
    this.name = "UnresolvedDecisionError"
    this.date = input.date
    this.ticker = input.ticker
    this.httpStatus = input.httpStatus
    this.attempts = input.attempts
    this.raw = input.raw
    this.blocked = input.blocked
  }
}

export function assertNotInterruptedDatabase(path: string) {
  const normalized = path.split(/[/\\]/).join("/")
  if (normalized.endsWith(INTERRUPTED_PHASE4_DB)) {
    throw new Error("Refusing to open interrupted experiment database JEV-20260922-V1")
  }
}

export function retryDelayMs(failedAttempt: number, retryAfter: string | null, now = Date.now()): number {
  const exponential = Math.min(BACKOFF_CAP_MS, 1_000 * 2 ** Math.max(0, failedAttempt - 1))
  if (retryAfter == null) return exponential
  const trimmed = retryAfter.trim()
  if (trimmed === "") return exponential
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.min(BACKOFF_CAP_MS, Math.max(0, Number(trimmed) * 1000))
  const when = Date.parse(trimmed)
  if (Number.isFinite(when)) return Math.min(BACKOFF_CAP_MS, Math.max(0, when - now))
  return exponential
}

export function isCompleteDecision(status: string, action: string | null): action is Action {
  return status === "OK" && action != null && VALID_ACTIONS.has(action)
}

export async function requestWithRetry(
  state: { market: unknown; portfolio: unknown },
  key: string,
  options?: {
    fetchImpl?: typeof fetch
    sleep?: (ms: number) => Promise<void>
    maxAttempts?: number
    now?: () => number
    onBackoff?: (info: { attempt: number; maxAttempts: number; delayMs: number; status: number }) => void
  },
): Promise<GatewayOutcome> {
  const fetchImpl = options?.fetchImpl ?? fetch
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const maxAttempts = options?.maxAttempts ?? MAX_GATEWAY_ATTEMPTS
  const now = options?.now ?? Date.now
  let last: GatewayFailure | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now()
    let response: Response
    try {
      response = await fetchImpl("https://ai-gateway.vercel.sh/v1/evaluate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          state,
          questions: {
            action: {
              type: "choice",
              instructions: DECISION_INSTRUCTIONS,
              criteria: ACTION_CRITERIA,
            },
          },
        }),
      })
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        attempts: attempt,
        error: "network",
        raw: { message: error instanceof Error ? error.message : String(error) },
        blocked: false,
      }
    }

    const text = await response.text()
    let raw: unknown = text
    try {
      raw = JSON.parse(text)
    } catch {
      raw = { unparsed: text }
    }
    const latencyMs = Date.now() - started
    if (!response.ok) {
      const blocked = isAccountBlock(raw)
      last = {
        ok: false,
        httpStatus: response.status,
        attempts: attempt,
        error: `http ${response.status}`,
        raw,
        blocked,
      }
      const retryable =
        !blocked &&
        (response.status === 408 ||
          response.status === 429 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504) &&
        attempt < maxAttempts
      if (retryable) {
        const delayMs = retryDelayMs(attempt, response.headers.get("retry-after"), now())
        options?.onBackoff?.({ attempt, maxAttempts, delayMs, status: response.status })
        await sleep(delayMs)
        continue
      }
      return last
    }

    const parsed = parseDecision(raw)
    if (!parsed.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        attempts: attempt,
        error: parsed.error,
        raw,
        blocked: false,
      }
    }
    return {
      ok: true,
      action: parsed.action,
      chosen: parsed.confidence,
      rawConfidence: rawConfidenceFromPayload(raw),
      probabilities: parsed.probabilities,
      latencyMs,
      attempts: attempt,
      raw,
    }
  }

  return last ?? {
    ok: false,
    httpStatus: null,
    attempts: maxAttempts,
    error: "retries exhausted",
    raw: { message: "retries exhausted" },
    blocked: false,
  }
}

export async function resolveEligibleDecisions<T extends CompletedDecision>(input: {
  date: string
  tickers: string[]
  saved: Map<string, ResumeDecision>
  call: (ticker: string) => Promise<{ ok: true; decision: T } | GatewayFailure>
  persist: (ticker: string, decision: T) => Promise<void>
  onBatchComplete?: (stored: number) => void
  concurrency?: number
}): Promise<Signal[]> {
  const missing = input.tickers.filter((ticker) => !input.saved.has(`${input.date}|${ticker}`))
  let cursor = 0
  let stop = false
  let unresolved: UnresolvedDecisionError | null = null

  async function worker() {
    while (!stop) {
      const index = cursor
      cursor += 1
      if (index >= missing.length) return
      const ticker = missing[index]
      const outcome = await input.call(ticker)
      if (!outcome.ok) {
        stop = true
        unresolved ??= new UnresolvedDecisionError({
          date: input.date,
          ticker,
          httpStatus: outcome.httpStatus,
          attempts: outcome.attempts,
          error: outcome.error,
          raw: outcome.raw,
          blocked: outcome.blocked,
        })
        return
      }
      await input.persist(ticker, outcome.decision)
      input.saved.set(`${input.date}|${ticker}`, {
        action: outcome.decision.action,
        chosen: outcome.decision.chosen,
        rawConfidence: outcome.decision.rawConfidence,
        probabilities: outcome.decision.probabilities,
        status: "OK",
        latencyMs: outcome.decision.latencyMs,
        attempts: outcome.decision.attempts,
      })
    }
  }

  const workers = Math.min(input.concurrency ?? 4, Math.max(missing.length, 1))
  await Promise.all(Array.from({ length: missing.length === 0 ? 0 : workers }, () => worker()))
  if (unresolved) throw unresolved
  if (stop) throw new UnresolvedDecisionError({
    date: input.date,
    ticker: "",
    httpStatus: null,
    attempts: 0,
    error: "decision batch stopped",
    raw: null,
    blocked: false,
  })

  const signals = input.tickers.map((ticker) => {
    const row = input.saved.get(`${input.date}|${ticker}`)
    const action = row?.action ?? null
    if (!row || !isCompleteDecision(row.status, action)) {
      throw new UnresolvedDecisionError({
        date: input.date,
        ticker,
        httpStatus: null,
        attempts: 0,
        error: "missing valid decision",
        raw: null,
        blocked: false,
      })
    }
    return { ticker, action, chosenProbability: row.chosen }
  })
  input.onBatchComplete?.(input.saved.size)
  return signals
}

const DECISIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS decisions (
    run_id VARCHAR,
    decision_date VARCHAR,
    ticker VARCHAR,
    market_state_json VARCHAR,
    portfolio_state_json VARCHAR,
    action VARCHAR,
    chosen_action_probability DOUBLE,
    raw_confidence DOUBLE,
    probabilities_json VARCHAR,
    model VARCHAR,
    prompt_version VARCHAR,
    input_hash VARCHAR,
    raw_response_json VARCHAR,
    created_at VARCHAR,
    latency_ms INTEGER,
    attempt INTEGER,
    status VARCHAR,
    error VARCHAR,
    UNIQUE (run_id, decision_date, ticker)
  )
`

export async function openDecisionsDatabase(path: string) {
  assertNotInterruptedDatabase(path)
  mkdirSync(dirname(path), { recursive: true })
  const instance = await DuckDBInstance.create(path)
  const connection = await instance.connect()
  await connection.run(DECISIONS_TABLE)
  return {
    connection,
    close() {
      connection.closeSync()
      instance.closeSync()
    },
  }
}

export async function loadCompleteDecisions(connection: DuckDBConnection, runId = EXPERIMENT_ID) {
  const result = await connection.run(
    `SELECT decision_date, ticker, action, chosen_action_probability, raw_confidence, probabilities_json,
            status, latency_ms, attempt
     FROM decisions
     WHERE run_id = ?
       AND status = 'OK'
       AND action IN ('BUY', 'HOLD', 'SELL', 'NO_ACTION')`,
    [runId],
  )
  const rows = await result.getRowObjectsJson()
  const saved = new Map<string, ResumeDecision>()
  for (const row of rows) {
    const action = row.action == null ? null : String(row.action)
    if (!isCompleteDecision(String(row.status), action)) continue
    saved.set(`${row.decision_date}|${row.ticker}`, {
      action,
      chosen: row.chosen_action_probability == null ? null : Number(row.chosen_action_probability),
      rawConfidence: row.raw_confidence == null ? null : Number(row.raw_confidence),
      probabilities: row.probabilities_json == null ? null : JSON.parse(String(row.probabilities_json)),
      status: "OK",
      latencyMs: Number(row.latency_ms ?? 0),
      attempts: Number(row.attempt ?? 1),
    })
  }
  return saved
}

export async function insertCompletedDecision(connection: DuckDBConnection, input: {
  date: string
  ticker: string
  market: unknown
  portfolio: unknown
  inputHash: string
  decision: CompletedDecision
}) {
  if (!isCompleteDecision("OK", input.decision.action)) {
    throw new Error("refusing to store an unresolved call as a decision")
  }
  await connection.run(
    `INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      EXPERIMENT_ID,
      input.date,
      input.ticker,
      JSON.stringify(input.market),
      JSON.stringify(input.portfolio),
      input.decision.action,
      input.decision.chosen,
      input.decision.rawConfidence,
      input.decision.probabilities ? JSON.stringify(input.decision.probabilities) : null,
      MODEL,
      PROMPT_VERSION,
      input.inputHash,
      JSON.stringify(input.decision.raw),
      new Date().toISOString(),
      input.decision.latencyMs,
      input.decision.attempts,
      "OK",
      null,
    ],
  )
}

