import type { Metadata } from "next"
import { AuditView } from "./audit-view"
import { loadPhase3Decisions } from "@/src/audit/load-phase3"

export const metadata: Metadata = {
  title: "Phase 3 — Jev Decision Audit",
  description: "Read-only audit of the Phase 3 Jev decision sample. No portfolio simulation.",
}

export const dynamic = "force-dynamic"

export default async function Phase3AuditPage() {
  const rows = await loadPhase3Decisions()
  return (
    <div className="min-h-full bg-[#f4f1ea]">
      <AuditView rows={rows} />
    </div>
  )
}
