import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
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

export async function loadExperimentAuditMeta(root = process.cwd()): Promise<ExperimentAuditMeta> {
  const path = resolve(root, "public/audit/phase3-audit.json")
  if (!existsSync(path)) throw new Error(`missing Phase 3 audit data ${path}`)
  const parsed = JSON.parse(readFileSync(path, "utf8"))
  return parsed.meta as ExperimentAuditMeta
}

export async function loadExperimentAuditDay(date: string, root = process.cwd()): Promise<AuditDecision[]> {
  const path = resolve(root, "public/audit/phase3-audit.json")
  if (!existsSync(path)) throw new Error(`missing Phase 3 audit data ${path}`)
  const parsed = JSON.parse(readFileSync(path, "utf8"))
  const rows = parsed.byDate[date] ?? []
  return rows.map((row: Record<string, unknown>) => toAuditDecision(row))
}
