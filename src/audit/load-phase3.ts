import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { RUN_ID } from "../jev/schema"
import { toAuditDecision, type AuditDecision } from "./phase3-stats"

export async function loadPhase3Decisions(root = process.cwd()): Promise<AuditDecision[]> {
  const instance = await DuckDBInstance.create(resolve(root, "data/processed/jev_decisions.duckdb"), {
    access_mode: "READ_ONLY",
  })
  const connection = await instance.connect()
  try {
    const result = await connection.run(
      "SELECT * FROM jev_decisions WHERE run_id = ? ORDER BY decision_date, ticker, created_at",
      [RUN_ID],
    )
    const rows = await result.getRowObjectsJson()
    return rows.map((row) => toAuditDecision(row))
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}
