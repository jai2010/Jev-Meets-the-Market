import { readFileSync } from "node:fs"
import { ACTIONS, ACTION_CRITERIA, DECISION_INSTRUCTIONS, MODEL, type Action } from "./schema"

export type CallResult = {
  status: "OK" | "ERROR"
  action: Action | null
  confidence: number | null
  probabilities: Record<string, number> | null
  raw: unknown
  latencyMs: number
  attempts: number
  error: string | null
  blocked: boolean
}

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504])

export function loadGatewayKey(): string {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim()
  if (fromEnv) return fromEnv
  try {
    const text = readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith("AI_GATEWAY_API_KEY=")) continue
      const value = trimmed.slice("AI_GATEWAY_API_KEY=".length).trim().replace(/^["']|["']$/g, "")
      if (value) return value
    }
  } catch {
    // missing file
  }
  throw new Error("AI_GATEWAY_API_KEY is not set. Add it to .env.local. That file is gitignored.")
}

export function parseDecision(body: unknown): {
  ok: true
  action: Action
  confidence: number | null
  probabilities: Record<string, number> | null
} | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "response was not an object" }
  const answers = (body as { answers?: unknown }).answers
  if (!answers || typeof answers !== "object") return { ok: false, error: "missing answers" }
  const actionAnswer = (answers as { action?: unknown }).action
  if (!actionAnswer || typeof actionAnswer !== "object") return { ok: false, error: "missing answers.action" }
  const choice = (actionAnswer as { choice?: unknown }).choice
  if (typeof choice !== "string" || !ACTIONS.includes(choice as Action)) {
    return { ok: false, error: `invalid action ${String(choice)}` }
  }
  const rawProbabilities = (actionAnswer as { probabilities?: unknown }).probabilities
  if (rawProbabilities == null) {
    return { ok: true, action: choice as Action, confidence: null, probabilities: null }
  }
  if (typeof rawProbabilities !== "object" || Array.isArray(rawProbabilities)) {
    return { ok: false, error: "probabilities was not an object" }
  }
  const probabilities: Record<string, number> = {}
  for (const [key, value] of Object.entries(rawProbabilities)) {
    if (!ACTIONS.includes(key as Action)) return { ok: false, error: `unexpected probability key ${key}` }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      return { ok: false, error: `invalid probability for ${key}` }
    }
    probabilities[key] = value
  }
  return {
    ok: true,
    action: choice as Action,
    confidence: probabilities[choice] ?? null,
    probabilities,
  }
}

export function isAccountBlock(raw: unknown): boolean {
  return JSON.stringify(raw).includes("customer_verification_required")
}

export async function requestDecision(state: { market: unknown; portfolio: unknown }, key: string): Promise<CallResult> {
  let last: CallResult | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const started = Date.now()
    try {
      const response = await fetch("https://ai-gateway.vercel.sh/v1/evaluate", {
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
      const latencyMs = Date.now() - started
      const text = await response.text()
      let raw: unknown = text
      try {
        raw = JSON.parse(text)
      } catch {
        raw = { unparsed: text }
      }
      if (!response.ok) {
        last = {
          status: "ERROR",
          action: null,
          confidence: null,
          probabilities: null,
          raw,
          latencyMs,
          attempts: attempt,
          error: `http ${response.status}`,
          blocked: isAccountBlock(raw),
        }
        if (RETRY_STATUSES.has(response.status) && attempt < 3) {
          await sleep(400 * attempt * attempt)
          continue
        }
        return last
      }
      const parsed = parseDecision(raw)
      if (!parsed.ok) {
        return {
          status: "ERROR",
          action: null,
          confidence: null,
          probabilities: null,
          raw,
          latencyMs,
          attempts: attempt,
          error: parsed.error,
          blocked: false,
        }
      }
      return {
        status: "OK",
        action: parsed.action,
        confidence: parsed.confidence,
        probabilities: parsed.probabilities,
        raw,
        latencyMs,
        attempts: attempt,
        error: null,
        blocked: false,
      }
    } catch (error) {
      last = {
        status: "ERROR",
        action: null,
        confidence: null,
        probabilities: null,
        raw: { message: error instanceof Error ? error.message : String(error) },
        latencyMs: Date.now() - started,
        attempts: attempt,
        error: "network",
        blocked: false,
      }
      if (attempt < 3) {
        await sleep(400 * attempt * attempt)
        continue
      }
      return last
    }
  }
  return last ?? {
    status: "ERROR",
    action: null,
    confidence: null,
    probabilities: null,
    raw: { message: "no attempt" },
    latencyMs: 0,
    attempts: 0,
    error: "no attempt",
    blocked: false,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
