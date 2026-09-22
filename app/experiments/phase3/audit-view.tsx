"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"
import {
  AUDIT_ACTIONS,
  actionCounts,
  byDateThenTicker,
  distinct,
  failedRows,
  repeatRows,
  validPrimary,
  type AuditAction,
  type AuditDecision,
} from "@/src/audit/phase3-stats"

const ACTION_COLOR: Record<AuditAction, string> = {
  BUY: "#1f7a4d",
  HOLD: "#1e4d6b",
  SELL: "#9f2d2d",
  NO_ACTION: "#8a5a12",
}

const NAMES: Record<string, string> = {
  ZYDUSLIFE: "Zydus Life",
  ONGC: "ONGC",
  ADANIGREEN: "Adani Green",
  VEDL: "Vedanta",
  HINDUNILVR: "Hindustan Unilever",
}

function nameOf(ticker: string) {
  return NAMES[ticker] ?? ticker
}

function probability(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toFixed(2)
}

export function AuditView({ rows }: { rows: AuditDecision[] }) {
  const primary = useMemo(() => byDateThenTicker(validPrimary(rows)), [rows])
  const failed = useMemo(() => failedRows(rows), [rows])
  const repeats = useMemo(() => byDateThenTicker(repeatRows(rows)), [rows])
  const counts = useMemo(() => actionCounts(rows), [rows])
  const model = distinct(primary.map((row) => row.model).filter((value): value is string => Boolean(value)))
  const prompt = distinct(primary.map((row) => row.promptVersion).filter((value): value is string => Boolean(value)))
  const runId = distinct(rows.map((row) => row.runId))
  const [selectedId, setSelectedId] = useState<string | null>(primary[0]?.id ?? null)
  const selected = rows.find((row) => row.id === selectedId) ?? null

  return (
    <main className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-8 text-[#1c1917] sm:px-6">
      <p className="rounded-md border border-[#c4a15a] bg-[#f8efd4] px-4 py-3 text-sm leading-6">
        Historical decision audit only. No portfolio was simulated and no returns were calculated.
      </p>
      <p className="mt-8 text-xs font-medium tracking-[0.16em] text-[#78716c]">JEV INVESTMENT LAB</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Phase 3 — Jev Decision Audit</h1>
      <p className="mt-2 text-lg text-[#57534e]">Decision engine validation — no portfolio simulation</p>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Primary decisions" value={String(primary.length)} />
        <Card label="Repeat tests" value={String(repeats.length)} />
        <Card label="Valid decisions" value={String(primary.length)} />
        <Card label="Failed rows" value={String(failed.length)} />
        <Card label="Jev model" value={model.join(", ") || "—"} />
        <Card label="Prompt version" value={prompt.join(", ") || "—"} />
        <Card label="Run ID" value={runId.join(", ") || "—"} wide />
      </section>

      <Section title="Action distribution" kicker="Primary decisions only">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <ul className="space-y-2 text-sm">
            {AUDIT_ACTIONS.map((action) => (
              <li key={action} className="flex items-center justify-between gap-3">
                <ActionChip action={action} />
                <span className="font-mono tabular-nums">{counts[action]}</span>
              </li>
            ))}
          </ul>
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={AUDIT_ACTIONS.map((action) => ({ action, count: counts[action] }))}>
                <CartesianGrid vertical={false} stroke="#e7e5e4" />
                <XAxis dataKey="action" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Primary decisions">
                  {AUDIT_ACTIONS.map((action) => (
                    <Cell key={action} fill={ACTION_COLOR[action]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section title="Chosen-action probability" kicker="25 primary decisions, chronological">
        <p className="mb-4 text-sm leading-6 text-[#57534e]">
          Bar length is the saved chosen-action probability. Shorter bars are the less decisive calls. Color is the
          action.
        </p>
        <div className="h-[980px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={primary.map((row) => ({
                label: `${row.decisionDate.slice(5)} ${row.ticker}`,
                probability: row.chosenActionProbability,
                action: row.action,
              }))}
              margin={{ left: 8, right: 16 }}
              barCategoryGap={6}
            >
              <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="label" width={148} interval={0} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => probability(typeof value === "number" ? value : null)} />
              <Bar dataKey="probability" name="Chosen-action probability">
                {primary.map((row) => (
                  <Cell key={row.id} fill={ACTION_COLOR[(row.action as AuditAction) ?? "HOLD"]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Decision matrix" kicker="Click a cell">
        <Matrix rows={primary} selectedId={selectedId} onSelect={setSelectedId} />
      </Section>

      <Section title="Held versus unheld" kicker="From portfolio state, not from the action">
        <HeldChart rows={primary} />
      </Section>

      <Section title="Repeatability" kicker="Existing Zydus Life repeats. No new calls.">
        <RepeatBlock rows={rows} />
      </Section>

      <Section title="Chosen-action probability versus raw confidence" kicker="Two fields, kept separate">
        <ConfidenceCompare rows={primary} />
      </Section>

      <Section title="All primary decisions" kicker="Includes the failed row">
        <DecisionTable rows={byDateThenTicker(primaryRowsAndFailed(rows))} selectedId={selectedId} onSelect={setSelectedId} />
      </Section>

      <Section title="Decision detail" kicker={selected ? `${selected.ticker} ${selected.decisionDate}` : "Select a decision"}>
        {selected ? <Detail row={selected} /> : <p className="text-sm text-[#57534e]">Select a cell or table row.</p>}
      </Section>

      <p className="mt-12 border-t border-[#e7e5e4] pt-6 text-sm font-medium">Phase 4 has NOT started.</p>
    </main>
  )
}

function primaryRowsAndFailed(rows: AuditDecision[]) {
  return rows.filter((row) => row.callKind === "primary")
}

function Card({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-[#e7e5e4] bg-white px-4 py-3 ${wide ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <p className="text-xs tracking-wide text-[#78716c]">{label}</p>
      <p className="mt-1 break-all font-mono text-lg font-semibold">{value}</p>
    </div>
  )
}

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <p className="text-xs tracking-[0.14em] text-[#78716c]">{kicker}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ActionChip({ action }: { action: string | null }) {
  if (!action || !AUDIT_ACTIONS.includes(action as AuditAction)) {
    return <span className="rounded bg-[#e7e5e4] px-2 py-0.5 text-xs font-medium text-[#57534e]">FAILED</span>
  }
  const name = action as AuditAction
  return (
    <span className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: ACTION_COLOR[name] }}>
      {name}
    </span>
  )
}

function Matrix({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AuditDecision[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const dates = distinct(rows.map((row) => row.decisionDate))
  const tickers = distinct(rows.map((row) => row.ticker))
  const lookup = new Map(rows.map((row) => [`${row.decisionDate}|${row.ticker}`, row]))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left font-medium text-[#78716c]">Ticker</th>
            {dates.map((date) => (
              <th key={date} className="p-2 text-left font-medium text-[#78716c]">
                {date}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((ticker) => (
            <tr key={ticker} className="border-t border-[#e7e5e4]">
              <th className="p-2 text-left font-medium">
                {nameOf(ticker)}
                <span className="mt-0.5 block font-mono text-xs font-normal text-[#78716c]">{ticker}</span>
              </th>
              {dates.map((date) => {
                const row = lookup.get(`${date}|${ticker}`)
                if (!row) return <td key={date} className="p-2 text-[#a8a29e]">—</td>
                const selected = row.id === selectedId
                return (
                  <td key={date} className="p-1">
                    <button
                      type="button"
                      onClick={() => onSelect(row.id)}
                      className={`w-full rounded-md border px-2 py-2 text-left ${selected ? "border-[#1c1917]" : "border-transparent"} bg-white hover:border-[#a8a29e]`}
                    >
                      <ActionChip action={row.action} />
                      <span className="mt-1 block font-mono text-xs tabular-nums">{probability(row.chosenActionProbability)}</span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeldChart({ rows }: { rows: AuditDecision[] }) {
  const data = [
    { group: "Held", ...countHeld(rows, true) },
    { group: "Unheld", ...countHeld(rows, false) },
  ]
  return (
    <div className="h-72 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="group" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          {AUDIT_ACTIONS.map((action) => (
            <Bar key={action} dataKey={action} stackId="actions" fill={ACTION_COLOR[action]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function countHeld(rows: AuditDecision[], held: boolean): Record<AuditAction, number> {
  const counts: Record<AuditAction, number> = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
  for (const row of rows) {
    if (row.currentlyHeld !== held || !row.action || !AUDIT_ACTIONS.includes(row.action as AuditAction)) continue
    counts[row.action as AuditAction] += 1
  }
  return counts
}

function RepeatBlock({ rows }: { rows: AuditDecision[] }) {
  const repeats = byDateThenTicker(rows.filter((row) => row.callKind === "repeat" && row.ticker === "ZYDUSLIFE" && row.status === "OK"))
  const primary = new Map(
    rows
      .filter((row) => row.callKind === "primary" && row.ticker === "ZYDUSLIFE" && row.status === "OK")
      .map((row) => [row.decisionDate, row]),
  )
  return (
    <div>
      <p className="text-sm">
        Ticker: <span className="font-medium">Zydus Life</span>
      </p>
      <p className="mt-3 font-mono text-sm tracking-wide">{repeats.map((row) => row.action).join(" → ") || "—"}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#d6d3d1] text-xs text-[#78716c]">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Chosen-action probability</th>
              <th className="py-2 pr-3 font-medium">Raw confidence</th>
              <th className="py-2 font-medium">Primary chosen-action probability</th>
            </tr>
          </thead>
          <tbody>
            {repeats.map((row) => (
              <tr key={row.id} className="border-b border-[#f5f5f4]">
                <td className="py-2 pr-3">{row.decisionDate}</td>
                <td className="py-2 pr-3">{row.action}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{probability(row.chosenActionProbability)}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{probability(row.rawConfidence)}</td>
                <td className="py-2 font-mono tabular-nums">{probability(primary.get(row.decisionDate)?.chosenActionProbability ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConfidenceCompare({ rows }: { rows: AuditDecision[] }) {
  const data = rows.map((row) => ({
    ticker: row.ticker,
    date: row.decisionDate,
    chosen: row.chosenActionProbability,
    raw: row.rawConfidence,
    action: row.action,
  }))
  return (
    <div>
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 8, right: 8, bottom: 8 }}>
            <CartesianGrid stroke="#e7e5e4" />
            <XAxis type="number" dataKey="raw" name="Raw confidence" domain={[0, 1]} tick={{ fontSize: 12 }} />
            <YAxis type="number" dataKey="chosen" name="Chosen-action probability" domain={[0, 1]} tick={{ fontSize: 12 }} />
            <ZAxis range={[80, 80]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={data} name="Primary decisions">
              {data.map((row) => (
                <Cell key={`${row.date}-${row.ticker}`} fill={ACTION_COLOR[(row.action as AuditAction) ?? "HOLD"]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[#78716c]">Horizontal axis: raw confidence. Vertical axis: chosen-action probability.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#d6d3d1] text-xs text-[#78716c]">
              <th className="py-2 pr-3 font-medium">Ticker</th>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Chosen-action probability</th>
              <th className="py-2 font-medium">Raw confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#f5f5f4]">
                <td className="py-2 pr-3">{row.ticker}</td>
                <td className="py-2 pr-3">{row.decisionDate}</td>
                <td className="py-2 pr-3">{row.action}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{probability(row.chosenActionProbability)}</td>
                <td className="py-2 font-mono tabular-nums">{probability(row.rawConfidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DecisionTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AuditDecision[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [date, setDate] = useState("all")
  const [ticker, setTicker] = useState("all")
  const [action, setAction] = useState("all")
  const [held, setHeld] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("decisionDate")
  const [direction, setDirection] = useState<"asc" | "desc">("asc")
  const filtered = rows.filter((row) => {
    if (date !== "all" && row.decisionDate !== date) return false
    if (ticker !== "all" && row.ticker !== ticker) return false
    if (action === "FAILED") return row.status !== "OK"
    if (action !== "all" && row.action !== action) return false
    if (held === "held" && row.currentlyHeld !== true) return false
    if (held === "unheld" && row.currentlyHeld !== false) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => {
    const delta = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey), undefined, { numeric: true })
    return direction === "asc" ? delta : -delta
  })
  const toggle = (key: SortKey) => {
    if (sortKey === key) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSortKey(key)
      setDirection("asc")
    }
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Select label="Date" value={date} onChange={setDate} options={["all", ...distinct(rows.map((row) => row.decisionDate))]} />
        <Select label="Ticker" value={ticker} onChange={setTicker} options={["all", ...distinct(rows.map((row) => row.ticker))]} />
        <Select label="Action" value={action} onChange={setAction} options={["all", ...AUDIT_ACTIONS, "FAILED"]} />
        <Select label="Position" value={held} onChange={setHeld} options={["all", "held", "unheld"]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#d6d3d1] text-xs text-[#78716c]">
              <SortHead label="decision_date" active={sortKey === "decisionDate"} onClick={() => toggle("decisionDate")} />
              <SortHead label="ticker" active={sortKey === "ticker"} onClick={() => toggle("ticker")} />
              <SortHead label="currently_held" active={sortKey === "held"} onClick={() => toggle("held")} />
              <SortHead label="action" active={sortKey === "action"} onClick={() => toggle("action")} />
              <SortHead label="chosen_action_probability" active={sortKey === "chosen"} onClick={() => toggle("chosen")} />
              <SortHead label="raw_confidence" active={sortKey === "raw"} onClick={() => toggle("raw")} />
              <SortHead label="model" active={sortKey === "model"} onClick={() => toggle("model")} />
              <SortHead label="prompt_version" active={sortKey === "prompt"} onClick={() => toggle("prompt")} />
              <SortHead label="input_hash" active={sortKey === "hash"} onClick={() => toggle("hash")} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const failed = row.status !== "OK"
              return (
                <tr
                  key={row.id}
                  className={`border-b border-[#f5f5f4] ${failed ? "bg-[#f5f5f4] text-[#78716c]" : ""} ${row.id === selectedId ? "outline outline-1 outline-[#1c1917]" : ""}`}
                >
                  <td className="py-2 pr-3">
                    <button type="button" className="text-left underline decoration-[#d6d3d1] underline-offset-2" onClick={() => onSelect(row.id)}>
                      {row.decisionDate}
                    </button>
                  </td>
                  <td className="py-2 pr-3">{row.ticker}</td>
                  <td className="py-2 pr-3">{row.currentlyHeld == null ? "—" : row.currentlyHeld ? "held" : "unheld"}</td>
                  <td className="py-2 pr-3">{failed ? "FAILED" : row.action}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{probability(row.chosenActionProbability)}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{probability(row.rawConfidence)}</td>
                  <td className="py-2 pr-3">{row.model}</td>
                  <td className="py-2 pr-3">{row.promptVersion}</td>
                  <td className="max-w-40 truncate py-2 font-mono text-xs">{row.inputHash}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type SortKey = "decisionDate" | "ticker" | "held" | "action" | "chosen" | "raw" | "model" | "prompt" | "hash"

function sortValue(row: AuditDecision, key: SortKey): string {
  switch (key) {
    case "decisionDate":
      return row.decisionDate
    case "ticker":
      return row.ticker
    case "held":
      return row.currentlyHeld == null ? "" : row.currentlyHeld ? "1" : "0"
    case "action":
      return row.status === "OK" ? (row.action ?? "") : "FAILED"
    case "chosen":
      return row.chosenActionProbability == null ? "" : String(row.chosenActionProbability)
    case "raw":
      return row.rawConfidence == null ? "" : String(row.rawConfidence)
    case "model":
      return row.model ?? ""
    case "prompt":
      return row.promptVersion ?? ""
    case "hash":
      return row.inputHash ?? ""
  }
}

function SortHead({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className="py-2 pr-3 font-medium">
      <button type="button" onClick={onClick} className={active ? "text-[#1c1917]" : ""}>
        {label}
      </button>
    </th>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[#78716c]">{label}</span>
      <select className="rounded border border-[#d6d3d1] bg-white px-2 py-1" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function Detail({ row }: { row: AuditDecision }) {
  const probabilities = row.probabilities
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3 text-sm">
        <p className="font-medium">
          {nameOf(row.ticker)} <span className="font-normal text-[#78716c]">{row.ticker}</span>
        </p>
        <p>{row.decisionDate}</p>
        <p>
          <ActionChip action={row.status === "OK" ? row.action : null} />
        </p>
        <p>Chosen-action probability: <span className="font-mono">{probability(row.chosenActionProbability)}</span></p>
        <p>Raw confidence: <span className="font-mono">{probability(row.rawConfidence)}</span></p>
        <h3 className="pt-2 font-semibold">Probability distribution</h3>
        {probabilities ? (
          <ul className="space-y-1 font-mono">
            {AUDIT_ACTIONS.map((action) => (
              <li key={action}>
                {action} probability: {probability(probabilities[action] ?? null)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[#57534e]">Jev did not return a probability distribution for this row.</p>
        )}
        <h3 className="pt-2 font-semibold">Audit metadata</h3>
        <p>Model: {row.model ?? "—"}</p>
        <p>Prompt version: {row.promptVersion ?? "—"}</p>
        <p className="break-all">Input hash: <span className="font-mono text-xs">{row.inputHash}</span></p>
        <p className="break-all">Run ID: {row.runId}</p>
        <p>Created at: {row.createdAt ?? "—"}</p>
        {row.error ? <p>Error: {row.error}</p> : null}
      </div>
      <div className="space-y-4">
        <JsonBlock title="Market state" value={row.marketState} />
        <JsonBlock title="Portfolio state" value={row.portfolioState} />
        <details className="rounded-md border border-[#e7e5e4] bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold">Raw response</summary>
          <pre className="mt-3 overflow-x-auto text-xs leading-5">{JSON.stringify(row.raw, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-md border border-[#e7e5e4] bg-white p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <pre className="mt-2 overflow-x-auto text-xs leading-5">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}
