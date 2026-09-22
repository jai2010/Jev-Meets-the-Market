export const AUDIT_ACTIONS = ["BUY", "HOLD", "SELL", "NO_ACTION"] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditDecision = {
  id: string
  runId: string
  decisionDate: string
  ticker: string
  action: string | null
  chosenActionProbability: number | null
  rawConfidence: number | null
  probabilities: Partial<Record<AuditAction, number>> | null
  marketState: unknown
  portfolioState: unknown
  currentlyHeld: boolean | null
  model: string | null
  promptVersion: string | null
  createdAt: string | null
  inputHash: string | null
  raw: unknown
  status: string
  callKind: string
  error: string | null
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || value.trim() === "") return value ?? null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function rawConfidenceFromPayload(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null
  const confidence = (raw as { answers?: { action?: { confidence?: unknown } } }).answers?.action?.confidence
  return typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null
}

export function heldFromPortfolio(portfolio: unknown): boolean | null {
  if (!portfolio || typeof portfolio !== "object" || !("currently_held" in portfolio)) return null
  const value = (portfolio as { currently_held?: unknown }).currently_held
  if (value === true) return true
  if (value === false) return false
  return null
}

export function toAuditDecision(row: Record<string, unknown>): AuditDecision {
  const raw = parseJson(row.raw_response_json)
  const portfolioState = parseJson(row.portfolio_state_json)
  const probabilities = parseJson(row.probabilities_json)
  return {
    id: String(row.id),
    runId: String(row.run_id ?? ""),
    decisionDate: String(row.decision_date ?? ""),
    ticker: String(row.ticker ?? ""),
    action: row.action == null ? null : String(row.action),
    chosenActionProbability: row.confidence == null ? null : Number(row.confidence),
    rawConfidence: rawConfidenceFromPayload(raw),
    probabilities: isProbabilityMap(probabilities) ? probabilities : null,
    marketState: parseJson(row.market_state_json),
    portfolioState,
    currentlyHeld: heldFromPortfolio(portfolioState),
    model: row.model == null ? null : String(row.model),
    promptVersion: row.prompt_version == null ? null : String(row.prompt_version),
    createdAt: row.created_at == null ? null : String(row.created_at),
    inputHash: row.input_hash == null ? null : String(row.input_hash),
    raw,
    status: String(row.status ?? ""),
    callKind: String(row.call_kind ?? ""),
    error: row.error == null ? null : String(row.error),
  }
}

function isProbabilityMap(value: unknown): value is Partial<Record<AuditAction, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((item) => typeof item === "number")
}

export function primaryRows(rows: AuditDecision[]): AuditDecision[] {
  return rows.filter((row) => row.callKind === "primary")
}

export function validPrimary(rows: AuditDecision[]): AuditDecision[] {
  return primaryRows(rows).filter(
    (row) => row.status === "OK" && row.action != null && AUDIT_ACTIONS.includes(row.action as AuditAction),
  )
}

export function repeatRows(rows: AuditDecision[]): AuditDecision[] {
  return rows.filter((row) => row.callKind === "repeat" && row.status === "OK")
}

export function failedRows(rows: AuditDecision[]): AuditDecision[] {
  return rows.filter((row) => row.status !== "OK")
}

export function actionCounts(rows: AuditDecision[]): Record<AuditAction, number> {
  const counts: Record<AuditAction, number> = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
  for (const row of validPrimary(rows)) {
    counts[row.action as AuditAction] += 1
  }
  return counts
}

export function byDateThenTicker(rows: AuditDecision[]): AuditDecision[] {
  return [...rows].sort((a, b) => a.decisionDate.localeCompare(b.decisionDate) || a.ticker.localeCompare(b.ticker))
}

export function distinct(values: string[]): string[] {
  return [...new Set(values)].sort()
}
