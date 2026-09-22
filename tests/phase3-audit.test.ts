import { describe, expect, it } from "vitest"
import { DuckDBInstance } from "@duckdb/node-api"
import { resolve } from "node:path"
import { loadPhase3Decisions } from "../src/audit/load-phase3"
import { actionCounts, failedRows, repeatRows, validPrimary } from "../src/audit/phase3-stats"

describe("phase 3 audit counts come from the decision database", () => {
  it("matches 25 primary decisions, 5 repeats, 1 failure, and the action totals", async () => {
    const rows = await loadPhase3Decisions(resolve(import.meta.dirname, ".."))
    const counts = actionCounts(rows)
    expect(validPrimary(rows)).toHaveLength(25)
    expect(repeatRows(rows)).toHaveLength(5)
    expect(failedRows(rows)).toHaveLength(1)
    expect(counts).toEqual({ BUY: 11, HOLD: 9, NO_ACTION: 4, SELL: 1 })

    const repeats = repeatRows(rows).filter((row) => row.ticker === "ZYDUSLIFE")
    expect(repeats).toHaveLength(5)
    expect(repeats.every((row) => row.action === "BUY")).toBe(true)

    const instance = await DuckDBInstance.create(resolve(import.meta.dirname, "../data/processed/jev_decisions.duckdb"), {
      access_mode: "READ_ONLY",
    })
    const connection = await instance.connect()
    const result = await connection.run(`
      SELECT action, count(*) AS n
      FROM jev_decisions
      WHERE run_id = 'JEV-20260922-V1-PHASE3-TEST' AND call_kind = 'primary' AND status = 'OK'
      GROUP BY action
    `)
    const sqlCounts = Object.fromEntries((await result.getRowObjectsJson()).map((row) => [String(row.action), Number(row.n)]))
    connection.closeSync()
    instance.closeSync()
    expect(sqlCounts).toEqual({ BUY: 11, HOLD: 9, NO_ACTION: 4, SELL: 1 })
  })
})
