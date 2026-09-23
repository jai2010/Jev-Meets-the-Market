import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { PHASE4_DB } from "../phase4/paths"
import { EXPERIMENT_ID } from "../phase4/rules"
import { AUDIT_ACTIONS, toAuditDecision, type AuditAction, type AuditDecision } from "./phase3-stats"

export type ExperimentAuditMeta = {
  runId: string
  decisionCount: number
  okCount: number
  errorCount: number
  firstDate: string | null
  lastDate: string | null
  dates: string[]
  actionCounts: Record<AuditAction, number>
  model: string | null
  promptVersion: string | null
}

/** Copy-then-read so the live V2 DB/WAL is never opened for write. */
async function withCopiedExperimentDb<T>(root: string, fn: (dbPath: string) => Promise<T>): Promise<T> {
  const sourceDb = resolve(root, PHASE4_DB)
  if (!existsSync(sourceDb)) throw new Error(`missing experiment database ${PHASE4_DB}`)
  const tempDir = mkdtempSync(join(tmpdir(), "jev-experiment-audit-"))
  const copyDb = join(tempDir, "jev_experiment.duckdb")
  try {
    copyFileSync(sourceDb, copyDb)
    const wal = `${sourceDb}.wal`
    if (existsSync(wal)) copyFileSync(wal, `${copyDb}.wal`)
    return await fn(copyDb)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function loadExperimentAuditMeta(root = process.cwd()): Promise<ExperimentAuditMeta> {
  return withCopiedExperimentDb(root, async (dbPath) => {
    const instance = await DuckDBInstance.create(dbPath)
    const connection = await instance.connect()
    try {
      const summary = await (
        await connection.run(
          `SELECT
             count(*) AS n,
             count(*) FILTER (WHERE status = 'OK') AS ok,
             count(*) FILTER (WHERE status != 'OK') AS errors,
             min(decision_date) AS first_date,
             max(decision_date) AS last_date
           FROM decisions
           WHERE run_id = ?`,
          [EXPERIMENT_ID],
        )
      ).getRowObjectsJson()
      const dates = await (
        await connection.run(
          `SELECT DISTINCT decision_date AS date
           FROM decisions
           WHERE run_id = ? AND status = 'OK'
           ORDER BY decision_date`,
          [EXPERIMENT_ID],
        )
      ).getRowObjectsJson()
      const actions = await (
        await connection.run(
          `SELECT action, count(*) AS n
           FROM decisions
           WHERE run_id = ? AND status = 'OK' AND action IS NOT NULL
           GROUP BY action`,
          [EXPERIMENT_ID],
        )
      ).getRowObjectsJson()
      const meta = await (
        await connection.run(
          `SELECT model, prompt_version
           FROM decisions
           WHERE run_id = ? AND status = 'OK'
           LIMIT 1`,
          [EXPERIMENT_ID],
        )
      ).getRowObjectsJson()

      const actionCounts: Record<AuditAction, number> = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
      for (const row of actions) {
        const action = String(row.action)
        if (AUDIT_ACTIONS.includes(action as AuditAction)) actionCounts[action as AuditAction] = Number(row.n)
      }
      const head = summary[0] ?? {}
      return {
        runId: EXPERIMENT_ID,
        decisionCount: Number(head.n ?? 0),
        okCount: Number(head.ok ?? 0),
        errorCount: Number(head.errors ?? 0),
        firstDate: head.first_date == null ? null : String(head.first_date),
        lastDate: head.last_date == null ? null : String(head.last_date),
        dates: dates.map((row) => String(row.date)),
        actionCounts,
        model: meta[0]?.model == null ? null : String(meta[0].model),
        promptVersion: meta[0]?.prompt_version == null ? null : String(meta[0].prompt_version),
      }
    } finally {
      connection.closeSync()
      instance.closeSync()
    }
  })
}

export async function loadExperimentAuditDay(date: string, root = process.cwd()): Promise<AuditDecision[]> {
  return withCopiedExperimentDb(root, async (dbPath) => {
    const instance = await DuckDBInstance.create(dbPath)
    const connection = await instance.connect()
    try {
      const result = await connection.run(
        `SELECT *
         FROM decisions
         WHERE run_id = ? AND decision_date = ?
         ORDER BY ticker`,
        [EXPERIMENT_ID, date],
      )
      const rows = await result.getRowObjectsJson()
      return rows.map((row) => toAuditDecision(row))
    } finally {
      connection.closeSync()
      instance.closeSync()
    }
  })
}
