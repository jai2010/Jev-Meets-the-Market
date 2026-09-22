import { createHash } from "node:crypto"

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function inputHash(parts: {
  market: unknown
  portfolio: unknown
  promptVersion: string
  model: string
}): string {
  return createHash("sha256").update(canonicalJson(parts)).digest("hex")
}
