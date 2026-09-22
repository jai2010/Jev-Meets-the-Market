"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  chartThroughIndex,
  dayNumber,
  isFinale,
  maxDrawdown,
  nextTradingDate,
  returnFrom,
  skipTarget,
  snapshotAt,
  tradeCount,
  visibleSnapshot,
  type ReplayStage,
} from "@/src/replay/engine"
import { REPLAY_ACTIONS, type ReplayAction, type ReplayDataset, type ReplayDecision, type ReplaySnapshot } from "@/src/replay/types"

const STAGE_MS = 650

const ACTION_COLOR: Record<ReplayAction, string> = {
  BUY: "#3ddc97",
  HOLD: "#7eb6ff",
  SELL: "#ff6b6b",
  NO_ACTION: "#e4c36a",
}

export function ReplayView({ dataset }: { dataset: ReplayDataset }) {
  const length = dataset.days.length
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<ReplayStage>(4)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [panel, setPanel] = useState<"methodology" | "trades" | null>(null)
  const [feed, setFeed] = useState<"ALL" | ReplayAction>("ALL")
  const [detail, setDetail] = useState<ReplayDecision | null>(null)

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      if (stage < 4) setStage((stage + 1) as ReplayStage)
      else if (index < length - 1) {
        setIndex(index + 1)
        setStage(0)
      } else setPlaying(false)
    }, STAGE_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, stage, index, speed, length])

  const day = snapshotAt(dataset, index)
  const portfolio = visibleSnapshot(dataset, index, stage)
  const decisionsReady = stage >= 2
  const finale = isFinale(index, length, stage)
  const nextDate = nextTradingDate(dataset, index)
  const shownValue = portfolio?.portfolioValue ?? dataset.experiment.initialCapital
  const shownCash = portfolio?.cash ?? dataset.experiment.initialCapital
  const shownInvested = portfolio?.investedValue ?? 0
  const chart = useMemo(() => {
    const through = chartThroughIndex(index, stage)
    const rows = through < 0 ? [] : dataset.days.slice(0, through + 1)
    if (rows.length === 0) {
      return [{ date: dataset.experiment.startDate, portfolio: dataset.experiment.initialCapital, benchmark: dataset.experiment.initialCapital }]
    }
    return rows.map((row) => ({ date: row.date, portfolio: row.portfolioValue, benchmark: row.benchmarkValue }))
  }, [dataset, index, stage])

  function play() {
    if (finale) {
      setIndex(0)
      setStage(0)
      setPlaying(true)
      return
    }
    if (playing) {
      setPlaying(false)
      return
    }
    if (stage === 4) setStage(0)
    setPlaying(true)
  }

  function skip() {
    const target = skipTarget(length)
    setPlaying(false)
    setIndex(target.index)
    setStage(target.stage)
  }

  return (
    <div className="flex h-dvh flex-col bg-[#070b14] text-[#f4f1ea]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-2">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-[#9aa4b8]">JEV INVESTMENT LAB</p>
          <p className="text-xs text-[#c9d2e3]">Real market data. Real decisions. A six-month experiment.</p>
        </div>
        <nav className="hidden items-center gap-3 text-xs text-[#9aa4b8] lg:flex">
          <Link href="/" className="hover:text-white">Overview</Link>
          <Link href="/experiments/replay" className="text-white">Replay</Link>
          <span className="cursor-not-allowed opacity-50">Portfolio</span>
          <span className="cursor-not-allowed opacity-50">Trades</span>
          <span className="cursor-not-allowed opacity-50">Analysis</span>
          <button type="button" className="hover:text-white" onClick={() => setPanel("methodology")}>Methodology</button>
        </nav>
        <div className="text-right text-[10px] tracking-wide text-[#9aa4b8]">
          <p>NIFTY 100 UNIVERSE</p>
          <p>EXPERIMENTAL — NOT INVESTMENT ADVICE</p>
        </div>
      </header>

      {dataset.mode === "demo" ? (
        <p className="shrink-0 bg-[#3d2e0a] px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-[#f6d98a]">
          DEMO DATA — PHASE 4 BACKTEST NOT YET RUN
        </p>
      ) : dataset.mode === "partial" ? (
        <p className="shrink-0 bg-[#3d2e0a] px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-[#f6d98a]">
          PARTIAL RUN — TEST DATA — NOT FINAL EXPERIMENT
        </p>
      ) : (
        <p className="shrink-0 bg-[#10261c] px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-[#b7f3d8]">
          RECORDED EXPERIMENT
        </p>
      )}

      <p className="shrink-0 px-4 pt-1 text-[10px] tracking-[0.14em] text-[#7eb6ff]">HISTORICAL REPLAY — NO LIVE DECISIONS</p>

      {finale ? (
        <Finale dataset={dataset} onReplay={play} onTrades={() => setPanel("trades")} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 lg:h-full lg:grid-cols-[20%_55%_25%] lg:overflow-hidden">
          <aside className="space-y-2 overflow-y-auto">
            <Card title="REPLAY CONTROLS">
              <Meta label="Start date" value={dataset.experiment.startDate} />
              <Meta label="End date" value={dataset.experiment.endDate} />
              <div className="mt-2 flex gap-1">
                {[0.5, 1, 2, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSpeed(value)}
                    className={`rounded px-2 py-1 text-[11px] ${speed === value ? "bg-white text-[#070b14]" : "bg-white/10"}`}
                  >
                    {value}x
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                <button type="button" onClick={play} className="rounded bg-[#3ddc97] px-3 py-1.5 text-xs font-semibold text-[#06281a]">
                  {playing ? "Pause" : "▶ Play"}
                </button>
                <button type="button" onClick={skip} className="rounded bg-white/10 px-3 py-1.5 text-xs">
                  ⏭ Skip to End
                </button>
              </div>
              <label className="mt-3 block text-[11px] text-[#9aa4b8]">
                Day {dayNumber(index)} of {length}
                <input
                  className="mt-1 w-full accent-[#7eb6ff]"
                  type="range"
                  min={0}
                  max={length - 1}
                  value={index}
                  onChange={(event) => {
                    setPlaying(false)
                    setIndex(Number(event.target.value))
                    setStage(4)
                  }}
                />
              </label>
              <div className="mt-1 flex justify-between text-[11px] text-[#c9d2e3]">
                <span>{day.date}</span>
                <span>{dataset.experiment.endDate}</span>
              </div>
            </Card>
            <Card title="EXPERIMENT DETAILS">
              <Meta label="Initial capital" value={inr(dataset.experiment.initialCapital)} />
              <Meta label="Universe" value={dataset.experiment.universe} />
              <Meta label="Max positions" value={String(dataset.experiment.maxPositions)} />
            </Card>
          </aside>

          <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-semibold tracking-tight">DAY {dayNumber(index)} OF {length}</p>
                <p className="text-sm text-[#c9d2e3]">{day.date}</p>
              </div>
              <p className="text-right text-sm">
                <span className="block font-mono text-lg">{day.stocksEvaluated} / {day.stocksEvaluated}</span>
                <span className="text-[11px] text-[#9aa4b8]">Stocks evaluated</span>
              </p>
            </div>
            <Card title="JEV">
              <p className="text-xl font-medium">{statusCopy(stage, day.stocksEvaluated)}</p>
              <p className="mt-1 text-xs text-[#c9d2e3]">
                Decision: {day.date} EOD · Execution: {nextDate ? `${nextDate} OPEN` : "none in this replay"}
              </p>
            </Card>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
              {(decisionsReady ? topStockCards(day) : placeholders()).map((item) => (
                <StockCard key={item.ticker} decision={item} pending={!decisionsReady} />
              ))}
            </div>
            <Card title="DECISIONS FOR ALL 100 STOCKS">
              {decisionsReady ? (
                <div className="grid items-center gap-3 md:grid-cols-[1fr_88px]">
                  <ul className="space-y-1.5">
                    {REPLAY_ACTIONS.map((action) => {
                      const count = day.decisionCounts[action]
                      const share = day.stocksEvaluated === 0 ? 0 : Math.round((count / day.stocksEvaluated) * 100)
                      return (
                        <li key={action} className="grid grid-cols-[92px_36px_1fr_40px] items-center gap-2 text-xs">
                          <span style={{ color: ACTION_COLOR[action] }}>{action}</span>
                          <span className="font-mono tabular-nums">{count}</span>
                          <span className="h-1.5 rounded bg-white/10">
                            <span className="block h-1.5 rounded" style={{ width: `${share}%`, background: ACTION_COLOR[action] }} />
                          </span>
                          <span className="text-right font-mono text-[#9aa4b8]">{share}%</span>
                        </li>
                      )
                    })}
                  </ul>
                  <Ring complete />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#9aa4b8]">Analyzing...</p>
                  <Ring complete={false} />
                </div>
              )}
              <p className="mt-2 text-xs text-[#c9d2e3]">
                {stage >= 3
                  ? nextDate
                    ? `Next trades execute on ${nextDate} open`
                    : "Final session. No next open in this replay."
                  : "Analyzing..."}
              </p>
            </Card>
            <Card title="TODAY'S DECISION FEED" className="flex shrink-0 flex-col">
              <div className="mb-2 flex gap-2 text-[11px]">
                {(["ALL", ...REPLAY_ACTIONS] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setFeed(tab)} className={feed === tab ? "text-white" : "text-[#9aa4b8]"}>
                    {tab}
                  </button>
                ))}
              </div>
              <div className="h-56 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-[#0e1626] text-[#9aa4b8]">
                    <tr>
                      <th className="py-1 font-medium">Time</th>
                      <th className="font-medium">Action</th>
                      <th className="font-medium">Stock</th>
                      <th className="font-medium">Price</th>
                      <th className="font-medium">Confidence</th>
                      <th className="font-medium">Rationale</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {decisionsReady
                      ? day.decisions
                          .filter((item) => feed === "ALL" || item.action === feed)
                          .map((item) => (
                            <tr key={`${item.ticker}-${item.action}`} className="border-t border-white/5">
                              <td className="py-1">EOD</td>
                              <td style={{ color: ACTION_COLOR[item.action] }}>{item.action}</td>
                              <td>{item.ticker}</td>
                              <td className="font-mono">{inr(item.price)}</td>
                              <td className="font-mono">{chosenPct(item.confidence)}</td>
                              <td className="max-w-32 truncate text-[#9aa4b8]">{item.rationale || "—"}</td>
                              <td>
                                <button type="button" className="text-[#7eb6ff]" onClick={() => setDetail(item)}>
                                  View
                                </button>
                              </td>
                            </tr>
                          ))
                      : null}
                  </tbody>
                </table>
                {decisionsReady ? null : <p className="text-xs text-[#9aa4b8]">Decisions appear when this day is ready.</p>}
              </div>
            </Card>
          </section>

          <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto">
            <Card title="PORTFOLIO VALUE">
              {dataset.mode === "demo" ? <p className="text-sm font-semibold text-[#f6d98a]">BACKTEST NOT RUN</p> : null}
              {dataset.mode === "partial" ? <p className="text-sm font-semibold text-[#f6d98a]">PARTIAL RUN — NOT FINAL</p> : null}
              <p className="text-3xl font-semibold tracking-tight">{inr(shownValue)}</p>
              <p className="text-sm text-[#3ddc97]">{signedPct(returnFrom(dataset.experiment.initialCapital, shownValue))}</p>
              <p className="text-xs text-[#9aa4b8]">{signedInr(shownValue - dataset.experiment.initialCapital)}</p>
              <Meta label="Cash" value={`${inr(shownCash)} (${share(shownCash, shownValue)})`} />
              <Meta label="Invested" value={`${inr(shownInvested)} (${share(shownInvested, shownValue)})`} />
              <Meta label="Total" value={inr(shownValue)} />
              {dataset.mode === "demo" ? <p className="mt-1 text-[10px] text-[#f6d98a]">UI preview only. Not an experiment result.</p> : null}
              {dataset.mode === "partial" ? <p className="mt-1 text-[10px] text-[#f6d98a]">Interrupted V1 reconstruction for UI testing. Not the final Phase 4 result.</p> : null}
            </Card>
            <Card title="PORTFOLIO VS NIFTY 100">
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-[#3ddc97]">Jev portfolio {signedPct(returnFrom(dataset.experiment.initialCapital, chart.at(-1)?.portfolio ?? dataset.experiment.initialCapital))}</span>
                <span className="text-[#7eb6ff]">NIFTY 100 {signedPct(returnFrom(dataset.experiment.initialCapital, chart.at(-1)?.benchmark ?? dataset.experiment.initialCapital))}</span>
              </div>
              <div className="h-36 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid stroke="#1c2740" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#0e1626", border: "1px solid #243049", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="portfolio" name="Jev portfolio" stroke="#3ddc97" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="benchmark" name="NIFTY 100" stroke="#7eb6ff" dot={false} strokeWidth={2} />
                    <ReferenceLine x={chart.at(-1)?.date} stroke="#f4f1ea" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title={`CURRENT POSITIONS (${portfolio?.positions.length ?? 0} / ${dataset.experiment.maxPositions})`}>
              <ul className="space-y-1 text-xs">
                {(portfolio?.positions ?? []).map((position) => (
                  <li key={position.ticker} className="grid grid-cols-4 gap-1">
                    <span>{position.ticker}</span>
                    <span className="font-mono">{inr(position.value)}</span>
                    <span className="font-mono">{signedPct(position.returnPct)}</span>
                    <span className="text-right text-[#9aa4b8]">{position.daysHeld}d</span>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      )}

      {panel === "methodology" ? <Methodology onClose={() => setPanel(null)} dataset={dataset} /> : null}
      {panel === "trades" ? (
        <Drawer title="Trades" onClose={() => setPanel(null)}>
          {dataset.mode === "demo" ? <p className="mb-2 text-xs text-[#f6d98a]">Demo trades. Not a backtest.</p> : null}
          {dataset.mode === "partial" ? <p className="mb-2 text-xs text-[#f6d98a]">Partial-run trades. Not the final experiment.</p> : null}
          {dataset.days.flatMap((row) => row.tradesExecuted).map((trade) => (
            <p key={`${trade.decisionDate}-${trade.ticker}-${trade.action}`} className="text-sm">
              {trade.action} {trade.ticker} · decision {trade.decisionDate} EOD · execution {trade.executionDate} open · {inr(trade.executionPrice)}
            </p>
          ))}
        </Drawer>
      ) : null}
      {detail ? <DecisionDrawer decision={detail} date={day.date} onClose={() => setDetail(null)} /> : null}
    </div>
  )
}

function Finale({ dataset, onReplay, onTrades }: { dataset: ReplayDataset; onReplay: () => void; onTrades: () => void }) {
  const last = dataset.days[dataset.days.length - 1]
  const initial = dataset.experiment.initialCapital
  const jev = returnFrom(initial, last.portfolioValue)
  const nifty = returnFrom(initial, last.benchmarkValue)
  const drawdown = maxDrawdown(dataset.days.map((day) => day.portfolioValue))
  const chart = dataset.days.map((day) => ({ date: day.date, portfolio: day.portfolioValue, benchmark: day.benchmarkValue }))
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
      <p className="text-xs tracking-[0.18em] text-[#9aa4b8]">HISTORICAL REPLAY</p>
      <h2 className="mt-2 text-4xl font-semibold">{dataset.mode === "partial" ? "PARTIAL RUN END" : "EXPERIMENT COMPLETE"}</h2>
      {dataset.mode === "demo" ? <p className="mt-2 text-sm font-semibold text-[#f6d98a]">DEMO PREVIEW — PHASE 4 BACKTEST NOT YET RUN</p> : null}
      {dataset.mode === "partial" ? <p className="mt-2 text-sm font-semibold text-[#f6d98a]">PARTIAL RUN — TEST DATA — NOT FINAL EXPERIMENT</p> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Starting capital" value={inr(initial)} />
        <Stat label="Final portfolio" value={inr(last.portfolioValue)} />
        <Stat label="Jev return" value={signedPct(jev)} />
        <Stat label="NIFTY 100 return" value={signedPct(nifty)} />
        <Stat label="Difference" value={`${((jev - nifty) * 100).toFixed(1)} percentage points`} />
        <Stat label="Max drawdown" value={signedPct(drawdown)} />
        <Stat label="Trades" value={String(tradeCount(dataset))} />
        <Stat label="Cash remaining" value={inr(last.cash)} />
      </div>
      <div className="mt-6 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <CartesianGrid stroke="#1c2740" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#9aa4b8", fontSize: 11 }} minTickGap={40} />
            <YAxis tick={{ fill: "#9aa4b8", fontSize: 11 }} width={72} />
            <Tooltip contentStyle={{ background: "#0e1626", border: "1px solid #243049" }} />
            <Legend />
            <Line type="monotone" dataKey="portfolio" name="Jev portfolio" stroke="#3ddc97" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="benchmark" name="NIFTY 100" stroke="#7eb6ff" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-sm text-[#c9d2e3]">
        {dataset.days.length} trading days · {tradeCount(dataset)} trades · {dataset.experiment.maxPositions} maximum positions · {inr(initial)} starting capital
      </p>
      <p className="text-xs text-[#9aa4b8]">
        {dataset.experiment.startDate} to {dataset.experiment.endDate}. Both series use the stored snapshots, normalized from the starting capital.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onReplay} className="rounded bg-[#3ddc97] px-3 py-2 text-sm font-semibold text-[#06281a]">↻ Replay again</button>
        <Link href="/experiments/phase3" className="rounded bg-white/10 px-3 py-2 text-sm">View full analysis</Link>
        <button type="button" onClick={onTrades} className="rounded bg-white/10 px-3 py-2 text-sm">View trades</button>
      </div>
    </div>
  )
}

function statusCopy(stage: ReplayStage, stocks: number): string {
  if (stage === 0) return "Loading market state..."
  if (stage === 1) return `Jev is analyzing ${stocks} stocks...`
  if (stage === 2) return "Decisions ready"
  if (stage === 3) return "Decisions ready for execution"
  return "Portfolio updated"
}

function topStockCards(day: ReplaySnapshot): ReplayDecision[] {
  const cards: ReplayDecision[] = []
  const seen = new Set<string>()
  for (const decision of [...day.highlightedDecisions, ...day.decisions]) {
    if (seen.has(decision.ticker)) continue
    seen.add(decision.ticker)
    cards.push(decision)
    if (cards.length === 5) break
  }
  return cards
}

function placeholders(): ReplayDecision[] {
  return ["—", "—", "—", "—", "—"].map((ticker, index) => ({
    ticker: `slot-${index}`,
    action: "NO_ACTION",
    price: 0,
    confidence: 0,
  }))
}

function StockCard({ decision, pending }: { decision: ReplayDecision; pending: boolean }) {
  if (pending) {
    return <div className="h-28 animate-pulse rounded-lg border border-white/10 bg-[#0e1626]" />
  }
  return (
    <div className="rounded-lg border border-white/10 bg-[#0e1626] p-2">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold">{decision.ticker}</p>
        <span className="text-[10px] font-semibold" style={{ color: ACTION_COLOR[decision.action] }}>{decision.action}</span>
      </div>
      <p className="font-mono text-sm">{inr(decision.price)}</p>
      <p className="text-[11px] text-[#9aa4b8]">{decision.return20d == null ? "—" : `${signedPct(decision.return20d)} (20d)`}</p>
      <p className="text-[11px]">{chosenPct(decision.confidence)} chosen-action probability</p>
      <Spark values={decision.sparkline ?? []} />
    </div>
  )
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 80},${18 - ((value - min) / span) * 16}`).join(" ")
  return (
    <svg viewBox="0 0 80 20" className="mt-1 h-5 w-full">
      <polyline fill="none" stroke="#7eb6ff" strokeWidth="1.5" points={points} />
    </svg>
  )
}

function Ring({ complete }: { complete: boolean }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const offset = complete ? 0 : circumference * 0.62
  return (
    <div className="text-center">
      <svg viewBox="0 0 64 64" className="mx-auto h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#1c2740" strokeWidth="4" />
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#3ddc97" strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <p className="text-[10px] text-[#9aa4b8]">{complete ? "100% all stocks evaluated" : "Analyzing..."}</p>
    </div>
  )
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-white/10 bg-[#0e1626] p-3 ${className}`}>
      <h2 className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{title}</h2>
      <div className="mt-1 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-3 text-[11px]">
      <span className="text-[#9aa4b8]">{label}</span>
      <span className="text-right">{value}</span>
    </p>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0e1626] p-3">
      <p className="text-[11px] text-[#9aa4b8]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function Methodology({ dataset, onClose }: { dataset: ReplayDataset; onClose: () => void }) {
  const experiment = dataset.experiment
  return (
    <Drawer title="Methodology" onClose={onClose}>
      <p>Starting capital: {inr(experiment.initialCapital)}</p>
      <p>Universe: {experiment.universe}. The universe uses the current NIFTY 100 constituents, which introduces survivorship bias.</p>
      <p>Decision frequency: daily. Decision timing: end of day. Execution: the next trading day at the open.</p>
      <p>Maximum positions: {experiment.maxPositions}. Maximum position size: {pct(experiment.maxAllocation)}. Leverage: none. Shorting: none.</p>
      <p>Transaction costs: {pct(experiment.transactionCost)}. Slippage: {pct(experiment.slippage)}.</p>
      <p>Jev model: {experiment.model}. Prompt version: {experiment.promptVersion}.</p>
      <p>Benchmark: NIFTY 100 buy and hold, shown from the same starting capital.</p>
      <p>Six months is a limited historical sample and does not establish future investment performance.</p>
      <p>Historical replay only. Not investment advice.</p>
    </Drawer>
  )
}

function DecisionDrawer({ decision, date, onClose }: { decision: ReplayDecision; date: string; onClose: () => void }) {
  return (
    <Drawer title={`${decision.ticker} · ${date}`} onClose={onClose}>
      <p>Action: {decision.action}</p>
      <p>Chosen-action probability: {chosenPct(decision.confidence)}</p>
      <p>Raw confidence: {decision.rawConfidence == null ? "—" : decision.rawConfidence.toFixed(2)}</p>
      <p className="mt-2 font-medium">Probability distribution</p>
      {decision.probabilities
        ? REPLAY_ACTIONS.map((action) => (
            <p key={action}>
              {action} probability: {decision.probabilities?.[action] == null ? "—" : decision.probabilities[action]!.toFixed(2)}
            </p>
          ))
        : <p>No distribution was stored.</p>}
      <p className="mt-2 text-[#9aa4b8]">Market state and portfolio state for this replay row are the stored decision fields above. The forensic JSON view remains on the Phase 3 audit page.</p>
      <p>Rationale: {decision.rationale || "—"}</p>
    </Drawer>
  )
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/50">
      <div className="h-full w-full max-w-md overflow-auto border-l border-white/10 bg-[#0e1626] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-[#9aa4b8]">Close</button>
        </div>
        <div className="mt-4 space-y-2 text-sm leading-6">{children}</div>
      </div>
    </div>
  )
}

function chosenPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—"
  return `${Math.round(value * 100)}%`
}

function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value)
}

function signedInr(value: number): string {
  const formatted = inr(Math.abs(value))
  return `${value >= 0 ? "+" : "−"}${formatted}`
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

function signedPct(value: number): string {
  const points = value * 100
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)}%`
}

function share(part: number, total: number): string {
  if (total === 0) return "—"
  return `${((part / total) * 100).toFixed(1)}%`
}
