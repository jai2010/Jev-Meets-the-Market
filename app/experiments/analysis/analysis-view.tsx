"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ExperimentNav } from "@/src/experiments/nav"
import { inr, pct } from "@/src/experiments/format"
import { maxDrawdown, returnFrom, tradeCount } from "@/src/replay/engine"
import type { ReplayAction, ReplayDataset } from "@/src/replay/types"

const ACTION_COLOR: Record<ReplayAction, string> = {
  BUY: "#3ddc97",
  HOLD: "#7eb6ff",
  SELL: "#ff6b6b",
  NO_ACTION: "#e4c36a",
}

export function AnalysisView({ dataset }: { dataset: ReplayDataset }) {
  const last = dataset.days[dataset.days.length - 1]
  const initial = dataset.experiment.initialCapital
  const jevReturn = returnFrom(initial, last.portfolioValue)
  const niftyReturn = returnFrom(initial, last.benchmarkValue)
  const drawdown = maxDrawdown(dataset.days.map((day) => day.portfolioValue))
  const counts = useMemo(() => {
    const next = { BUY: 0, HOLD: 0, SELL: 0, NO_ACTION: 0 }
    for (const day of dataset.days) {
      for (const decision of day.decisions) next[decision.action] += 1
    }
    return next
  }, [dataset.days])
  const totalDecisions = counts.BUY + counts.HOLD + counts.SELL + counts.NO_ACTION
  const chart = dataset.days.map((day) => ({
    date: day.date,
    portfolio: day.portfolioValue,
    benchmark: day.benchmarkValue,
  }))
  const meanChosen = mean(
    dataset.days.flatMap((day) =>
      day.decisions.map((decision) => decision.confidence).filter((value): value is number => value != null),
    ),
  )

  return (
    <main className="min-h-dvh bg-[#070b14] text-[#f4f1ea]">
      <ExperimentNav active="analysis" />
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-6">
        <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">ANALYSIS</p>
        <h1 className="text-3xl font-semibold tracking-tight">{dataset.experiment.id}</h1>
        <p className="max-w-3xl text-sm leading-6 text-[#c9d2e3]">
          {dataset.experiment.startDate} → {dataset.experiment.endDate} · {dataset.days.length} sessions ·{" "}
          {tradeCount(dataset)} trades. Outcome record only — not an investment recommendation.
        </p>

        <section className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
            <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">JEV VS NIFTY 100</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[#3ddc97]">Jev portfolio</p>
                <p className="mt-1 text-3xl font-semibold">{inr(last.portfolioValue)}</p>
                <p className="mt-1 text-sm text-[#3ddc97]">{pct(jevReturn)}</p>
              </div>
              <div>
                <p className="text-xs text-[#7eb6ff]">NIFTY 100 buy & hold</p>
                <p className="mt-1 text-3xl font-semibold">{inr(last.benchmarkValue)}</p>
                <p className="mt-1 text-sm text-[#7eb6ff]">{pct(niftyReturn)}</p>
              </div>
            </div>
            <div
              className={`mt-5 rounded-md border px-4 py-3 ${
                last.portfolioValue >= last.benchmarkValue
                  ? "border-[#3ddc97]/30 bg-[#10261c]"
                  : "border-[#ff6b6b]/30 bg-[#2a1212]"
              }`}
            >
              <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">DIFFERENCE (JEV − NIFTY 100)</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  last.portfolioValue >= last.benchmarkValue ? "text-[#3ddc97]" : "text-[#ff6b6b]"
                }`}
              >
                {last.portfolioValue >= last.benchmarkValue ? "+" : "−"}
                {inr(Math.abs(last.portfolioValue - last.benchmarkValue))} ·{" "}
                {(jevReturn - niftyReturn >= 0 ? "+" : "") + ((jevReturn - niftyReturn) * 100).toFixed(2)} percentage
                points
              </p>
              <p className="mt-1 text-xs text-[#c9d2e3]">
                Jev finished {inr(Math.abs(last.portfolioValue - last.benchmarkValue))}{" "}
                {last.portfolioValue >= last.benchmarkValue ? "ahead of" : "behind"} buy-and-hold NIFTY 100, across{" "}
                {tradeCount(dataset)} trades.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
            <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">ACTIVITY</p>
            <p className="mt-3 text-5xl font-semibold">{tradeCount(dataset)}</p>
            <p className="mt-1 text-sm text-[#c9d2e3]">executed trades</p>
            <div className="mt-4 space-y-2 text-sm">
              <Fact k="Sessions" v={String(dataset.days.length)} />
              <Fact k="Max drawdown" v={pct(drawdown)} />
              <Fact k="Mean P(chosen)" v={meanChosen == null ? "—" : meanChosen.toFixed(3)} />
              <Fact k="Ending cash" v={inr(last.cash)} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-4">
          <h2 className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">EQUITY CURVE</h2>
          <div className="mt-3 h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid stroke="#1c2740" vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#0e1626", border: "1px solid #243049", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="portfolio" name="Jev portfolio" stroke="#3ddc97" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="benchmark" name="NIFTY 100" stroke="#7eb6ff" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <Card title="DECISION MIX">
            <ul className="space-y-2 text-sm">
              {(Object.keys(counts) as ReplayAction[]).map((action) => {
                const count = counts[action]
                const share = totalDecisions === 0 ? 0 : count / totalDecisions
                return (
                  <li key={action} className="grid grid-cols-[92px_48px_1fr_48px] items-center gap-2">
                    <span style={{ color: ACTION_COLOR[action] }}>{action}</span>
                    <span className="font-mono tabular-nums">{count}</span>
                    <span className="h-1.5 rounded bg-white/10">
                      <span
                        className="block h-1.5 rounded"
                        style={{ width: `${share * 100}%`, background: ACTION_COLOR[action] }}
                      />
                    </span>
                    <span className="text-right font-mono text-[#9aa4b8]">{Math.round(share * 100)}%</span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-xs text-[#9aa4b8]">
              {totalDecisions.toLocaleString("en-IN")} stored decisions in the replay window.
            </p>
          </Card>
          <Card title="ENDING BOOK">
            <Fact k="Cash" v={inr(last.cash)} />
            <Fact k="Invested" v={inr(last.investedValue)} />
            <Fact k="Positions" v={`${last.positions.length} / ${dataset.experiment.maxPositions}`} />
            <ul className="mt-3 space-y-1 text-sm">
              {last.positions.map((position) => (
                <li key={position.ticker} className="flex justify-between border-b border-white/5 py-1">
                  <span>{position.ticker}</span>
                  <span className="font-mono text-[#c9d2e3]">{inr(position.value)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </main>
  )
}

function mean(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0e1626] px-4 py-3">
      <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${accent ? "text-[#3ddc97]" : ""}`}>{value}</p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0e1626] p-4">
      <h2 className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <p className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
      <span className="text-[#9aa4b8]">{k}</span>
      <span>{v}</span>
    </p>
  )
}
