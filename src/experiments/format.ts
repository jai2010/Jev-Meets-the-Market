export function inr(value: number | null | undefined) {
  if (value == null) return "—"
  return `₹${Math.round(value).toLocaleString("en-IN")}`
}

export function pct(value: number) {
  const sign = value > 0 ? "+" : ""
  return `${sign}${(value * 100).toFixed(2)}%`
}

export function signedPct(value: number) {
  return pct(value)
}
