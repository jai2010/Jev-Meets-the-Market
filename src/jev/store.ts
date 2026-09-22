import { mkdirSync, rmSync } from "node:fs"
import { dirname } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import type { Action } from "./schema"

export const DECISION_DB = "data/processed/jev_decisions.duckdb"

export type StoredDecision = {
  id: string
  runId: string
  decisionDate: string
  ticker: string
  action: Action | null
  confidence: number | null
  probabilities: Record<string, number> | null
  marketState: unknown
  portfolioState: unknown
  model: string
  promptVersion: string
  createdAt: string
  inputHash: string
  raw: unknown
  status: "OK" | "ERROR"
  callKind: "primary" | "repeat"
  latencyMs: number
  error: string | null
}

export async function openDecisionDb(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const instance = await DuckDBInstance.create(path)
  const connection = await instance.connect()
  await connection.run(`
    CREATE TABLE IF NOT EXISTS jev_decisions (
      id VARCHAR,
      run_id VARCHAR,
      decision_date VARCHAR,
      ticker VARCHAR,
      action VARCHAR,
      confidence DOUBLE,
      probabilities_json VARCHAR,
      market_state_json VARCHAR,
      portfolio_state_json VARCHAR,
      model VARCHAR,
      prompt_version VARCHAR,
      created_at VARCHAR,
      input_hash VARCHAR,
      raw_response_json VARCHAR,
      status VARCHAR,
      call_kind VARCHAR,
      latency_ms INTEGER,
      error VARCHAR
    )
  `)
  return {
    instance,
    connection,
    async hasOk(runId: string, inputHash: string, callKind: string) {
      const result = await connection.run(
        "SELECT count(*) AS n FROM jev_decisions WHERE run_id = ? AND input_hash = ? AND call_kind = ? AND status = 'OK'",
        [runId, inputHash, callKind],
      )
      const [row] = await result.getRowObjectsJson()
      return Number(row.n) > 0
    },
    async insert(row: StoredDecision) {
      await connection.run(
        `INSERT INTO jev_decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.runId,
          row.decisionDate,
          row.ticker,
          row.action,
          row.confidence,
          row.probabilities ? JSON.stringify(row.probabilities) : null,
          JSON.stringify(row.marketState),
          JSON.stringify(row.portfolioState),
          row.model,
          row.promptVersion,
          row.createdAt,
          row.inputHash,
          JSON.stringify(row.raw),
          row.status,
          row.callKind,
          row.latencyMs,
          row.error,
        ],
      )
    },
    async rows(runId: string) {
      const result = await connection.run(
        "SELECT * FROM jev_decisions WHERE run_id = ? ORDER BY created_at, ticker, decision_date",
        [runId],
      )
      return result.getRowObjectsJson()
    },
    close() {
      connection.closeSync()
      instance.closeSync()
    },
  }
}

export function removeDb(path: string) {
  rmSync(path, { force: true })
  rmSync(`${path}.wal`, { force: true })
}
