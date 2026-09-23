import { NextResponse } from "next/server"
import { loadExperimentAuditDay } from "@/src/audit/load-experiment-audit"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date")
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 })
  }
  const rows = await loadExperimentAuditDay(date)
  return NextResponse.json({ date, rows })
}
