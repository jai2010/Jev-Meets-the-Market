import type { Metadata } from "next"
import { ExperimentNav } from "@/src/experiments/nav"
import { loadExperimentAuditDay, loadExperimentAuditMeta } from "@/src/audit/load-experiment-audit"
import { ExperimentAuditView } from "./audit-view"

export const metadata: Metadata = {
  title: "Decision Audit — Jev Investment Lab",
  description: "Read-only audit of stored experiment Jev inputs and responses.",
}

export const dynamic = "force-dynamic"

export default async function ExperimentAuditPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const meta = await loadExperimentAuditMeta()
  const date =
    params.date && meta.dates.includes(params.date) ? params.date : (meta.lastDate ?? meta.dates.at(-1) ?? "")
  const rows = date ? await loadExperimentAuditDay(date) : []

  return (
    <main className="min-h-dvh bg-[#070b14]">
      <ExperimentNav active="phase3" />
      <ExperimentAuditView meta={meta} initialDate={date} initialRows={rows} />
    </main>
  )
}
