"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ExperimentAuditMeta } from "@/src/audit/load-experiment-audit"
import { AUDIT_ACTIONS, type AuditAction, type AuditDecision } from "@/src/audit/phase3-stats"

const ACTION_COLOR: Record<AuditAction, string> = {
  BUY: "#3ddc97",
  HOLD: "#7eb6ff",
  SELL: "#ff6b6b",
  NO_ACTION: "#e4c36a",
}

function probability(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toFixed(2)
}

export function ExperimentAuditView({
  meta,
  initialDate,
  initialRows,
}: {
  meta: ExperimentAuditMeta
  initialDate: string
  initialRows: AuditDecision[]
}) {
  const [date, setDate] = useState(initialDate)
  const [rows, setRows] = useState(initialRows)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialRows[0]?.id ?? null)
  const [actionFilter, setActionFilter] = useState("all")
  const [heldFilter, setHeldFilter] = useState("all")
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (date === initialDate) {
      setRows(initialRows)
      setSelectedId(initialRows[0]?.id ?? null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/audit/day?date=${encodeURIComponent(date)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ rows: AuditDecision[] }>
      })
      .then((payload) => {
        if (cancelled) return
        setRows(payload.rows)
        setSelectedId(payload.rows[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, initialDate, initialRows])

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const dayCounts = useMemo(() => {
    const counts: Record<AuditAction, number> = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
    for (const row of rows) {
      if (row.status !== "OK" || !row.action || !AUDIT_ACTIONS.includes(row.action as AuditAction)) continue
      counts[row.action as AuditAction] += 1
    }
    return counts
  }, [rows])

  const filtered = rows.filter((row) => {
    if (actionFilter === "FAILED" && row.status === "OK") return false
    if (actionFilter !== "all" && actionFilter !== "FAILED" && row.action !== actionFilter) return false
    if (heldFilter === "held" && row.currentlyHeld !== true) return false
    if (heldFilter === "unheld" && row.currentlyHeld !== false) return false
    if (query && !row.ticker.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  const totalActions = Object.values(meta.actionCounts).reduce((sum, value) => sum + value, 0)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden px-4 py-6 text-[#f4f1ea] md:px-6">
      <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
        <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">EXPERIMENT AUDIT</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{meta.runId}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#c9d2e3]">
          Read-only inspection of stored Jev calls from the live experiment. Pick a session date, then open a ticker to
          see the market/portfolio input and the raw response.
        </p>
        <div className="mt-4 grid gap-2 text-xs text-[#9aa4b8] sm:grid-cols-3">
          <p>
            <span className="text-[#7eb6ff]">1. Input</span> — point-in-time market + portfolio state
          </p>
          <p>
            <span className="text-[#7eb6ff]">2. Jev</span> — {meta.model ?? "—"} · {meta.promptVersion ?? "—"}
          </p>
          <p>
            <span className="text-[#7eb6ff]">3. Output</span> — action, probabilities, confidence fields
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="OK decisions" value={meta.okCount.toLocaleString("en-IN")} />
        <Stat label="Sessions" value={String(meta.dates.length)} />
        <Stat label="Window" value={meta.firstDate && meta.lastDate ? `${meta.firstDate} → ${meta.lastDate}` : "—"} />
        <Stat label="Errors stored" value={String(meta.errorCount)} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="SESSION PICKER">
          <label className="block text-sm text-[#9aa4b8]">
            Decision date
            <select
              className="mt-2 w-full rounded border border-white/10 bg-[#0b1220] px-3 py-2 text-[#f4f1ea]"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            >
              {meta.dates
                .slice()
                .reverse()
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </label>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {AUDIT_ACTIONS.map((action) => (
              <div key={action} className="rounded border border-white/5 px-3 py-2">
                <p className="text-[10px] text-[#9aa4b8]">{action}</p>
                <p className="font-mono text-lg" style={{ color: ACTION_COLOR[action] }}>
                  {dayCounts[action]}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[#9aa4b8]">
            {loading ? "Loading session…" : `${rows.length} stored calls on ${date || "—"}`}
          </p>
          {error ? <p className="mt-2 text-sm text-[#ff6b6b]">{error}</p> : null}
        </Panel>
        <Panel title="EXPERIMENT ACTION MIX">
          <p className="mb-3 text-xs text-[#9aa4b8]">All OK decisions across the experiment window.</p>
          <ul className="mb-4 space-y-2 text-sm">
            {AUDIT_ACTIONS.map((action) => {
              const count = meta.actionCounts[action]
              const share = totalActions === 0 ? 0 : count / totalActions
              return (
                <li key={action} className="grid grid-cols-[92px_56px_1fr_40px] items-center gap-2">
                  <ActionChip action={action} />
                  <span className="font-mono tabular-nums">{count.toLocaleString("en-IN")}</span>
                  <span className="h-1.5 rounded bg-white/10">
                    <span className="block h-1.5 rounded" style={{ width: `${share * 100}%`, background: ACTION_COLOR[action] }} />
                  </span>
                  <span className="text-right font-mono text-[#9aa4b8]">{Math.round(share * 100)}%</span>
                </li>
              )
            })}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title={`SESSION DECISIONS · ${date || "—"}`}>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <input
              className="rounded border border-white/10 bg-[#0b1220] px-3 py-1.5 text-[#f4f1ea]"
              placeholder="Filter ticker"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select label="Action" value={actionFilter} onChange={setActionFilter} options={["all", ...AUDIT_ACTIONS, "FAILED"]} />
            <Select label="Held" value={heldFilter} onChange={setHeldFilter} options={["all", "held", "unheld"]} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] text-[#9aa4b8]">
                  <th className="py-2 pr-3 font-medium">Ticker</th>
                  <th className="py-2 pr-3 font-medium">Held?</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">P(chosen)</th>
                  <th className="py-2 font-medium">Raw conf.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const failed = row.status !== "OK"
                  return (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-b border-white/5 ${row.id === selectedId ? "bg-[#132033]" : "hover:bg-white/5"} ${
                        failed ? "text-[#9aa4b8]" : ""
                      }`}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="py-2 pr-3 font-medium">{row.ticker}</td>
                      <td className="py-2 pr-3">{row.currentlyHeld == null ? "—" : row.currentlyHeld ? "held" : "unheld"}</td>
                      <td className="py-2 pr-3">
                        <ActionChip action={failed ? null : row.action} />
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{probability(row.chosenActionProbability)}</td>
                      <td className="py-2 font-mono tabular-nums">{probability(row.rawConfidence)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="SELECTED CALL">
          {selected ? <Detail row={selected} /> : <p className="text-sm text-[#9aa4b8]">Select a ticker from the session list.</p>}
        </Panel>
      </section>

      <Panel title="SESSION ACTION CHART">
        <div className="h-56 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={AUDIT_ACTIONS.map((action) => ({ action, count: dayCounts[action] }))}>
              <CartesianGrid vertical={false} stroke="#1c2740" />
              <XAxis dataKey="action" tick={{ fill: "#9aa4b8", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#9aa4b8", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0e1626", border: "1px solid #243049" }} />
              <Bar dataKey="count" name="Decisions">
                {AUDIT_ACTIONS.map((action) => (
                  <Cell key={action} fill={ACTION_COLOR[action]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0e1626] px-4 py-3">
      <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{label}</p>
      <p className="mt-1 break-all text-xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0e1626] p-4">
      <h2 className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ActionChip({ action }: { action: string | null }) {
  if (!action || !AUDIT_ACTIONS.includes(action as AuditAction)) {
    return <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-[#9aa4b8]">FAILED</span>
  }
  const name = action as AuditAction
  return (
    <span className="rounded px-2 py-0.5 text-xs font-semibold text-[#070b14]" style={{ background: ACTION_COLOR[name] }}>
      {name}
    </span>
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
    <label className="flex items-center gap-2 text-[#9aa4b8]">
      <span>{label}</span>
      <select
        className="rounded border border-white/10 bg-[#0b1220] px-2 py-1 text-[#f4f1ea]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
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
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-lg font-medium">{row.ticker}</p>
        <p className="mt-1 text-[#c9d2e3]">{row.decisionDate}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ActionChip action={row.status === "OK" ? row.action : null} />
          <span className="text-xs text-[#9aa4b8]">
            {row.currentlyHeld == null ? "held state unknown" : row.currentlyHeld ? "held" : "unheld"}
          </span>
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-[#0b1220] p-3">
        <p className="text-[10px] tracking-[0.16em] text-[#7eb6ff]">3. OUTPUT</p>
        <p className="mt-2">
          Chosen-action probability: <span className="font-mono">{probability(row.chosenActionProbability)}</span>
        </p>
        <p>
          Raw confidence: <span className="font-mono">{probability(row.rawConfidence)}</span>
        </p>
        {probabilities ? (
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {AUDIT_ACTIONS.map((action) => (
              <li key={action}>
                {action}: {probability(probabilities[action] ?? null)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[#9aa4b8]">No probability distribution on this row.</p>
        )}
      </div>

      <div className="rounded-md border border-white/10 bg-[#0b1220] p-3">
        <p className="text-[10px] tracking-[0.16em] text-[#7eb6ff]">1. INPUT · MARKET</p>
        <pre className="mt-2 max-h-56 overflow-auto text-xs leading-5 text-[#c9d2e3]">{JSON.stringify(row.marketState, null, 2)}</pre>
      </div>

      <div className="rounded-md border border-white/10 bg-[#0b1220] p-3">
        <p className="text-[10px] tracking-[0.16em] text-[#7eb6ff]">1. INPUT · PORTFOLIO</p>
        <pre className="mt-2 max-h-40 overflow-auto text-xs leading-5 text-[#c9d2e3]">{JSON.stringify(row.portfolioState, null, 2)}</pre>
      </div>

      <details className="rounded-md border border-white/10 bg-[#0b1220] p-3">
        <summary className="cursor-pointer text-[10px] tracking-[0.16em] text-[#7eb6ff]">2. RAW JEV RESPONSE</summary>
        <pre className="mt-3 max-h-64 overflow-auto text-xs leading-5 text-[#c9d2e3]">{JSON.stringify(row.raw, null, 2)}</pre>
      </details>

      <div className="text-xs text-[#9aa4b8]">
        <p>Model: {row.model ?? "—"}</p>
        <p>Prompt: {row.promptVersion ?? "—"}</p>
        <p className="break-all">Hash: {row.inputHash ?? "—"}</p>
        {row.error ? <p className="text-[#ff6b6b]">Error: {row.error}</p> : null}
      </div>
    </div>
  )
}
