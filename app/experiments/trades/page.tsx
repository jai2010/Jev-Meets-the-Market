import { connection } from "next/server"
import { ExperimentNav } from "@/src/experiments/nav"
import { inr } from "@/src/experiments/format"
import { loadReplayDataset } from "@/src/replay/load"

export default async function TradesPage() {
  await connection()
  const dataset = await loadReplayDataset()
  const trades = dataset.days.flatMap((day) => day.tradesExecuted)

  return (
    <main className="min-h-dvh bg-[#070b14] text-[#f4f1ea]">
      <ExperimentNav active="trades" />
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
        <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">TRADES</p>
        <h1 className="text-3xl font-semibold tracking-tight">{dataset.experiment.id}</h1>
        <p className="text-sm text-[#c9d2e3]">
          {trades.length} executions from {dataset.experiment.startDate} through {dataset.experiment.endDate}. Decisions
          are EOD; fills are the next session open.
        </p>

        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-4">
          {trades.length === 0 ? (
            <p className="text-sm text-[#9aa4b8]">No trades in this replay.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] tracking-wide text-[#9aa4b8]">
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 pr-3 font-medium">Ticker</th>
                    <th className="py-2 pr-3 font-medium">Decision</th>
                    <th className="py-2 pr-3 font-medium">Execution</th>
                    <th className="py-2 pr-3 font-medium">Shares</th>
                    <th className="py-2 pr-3 font-medium">Price</th>
                    <th className="py-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={`${trade.decisionDate}-${trade.executionDate}-${trade.ticker}-${trade.action}`} className="border-b border-white/5">
                      <td className={`py-2 pr-3 font-medium ${trade.action === "BUY" ? "text-[#3ddc97]" : "text-[#ff6b6b]"}`}>
                        {trade.action}
                      </td>
                      <td className="py-2 pr-3 font-medium">{trade.ticker}</td>
                      <td className="py-2 pr-3 text-[#c9d2e3]">{trade.decisionDate} EOD</td>
                      <td className="py-2 pr-3 text-[#c9d2e3]">{trade.executionDate} OPEN</td>
                      <td className="py-2 pr-3 font-mono">{trade.shares}</td>
                      <td className="py-2 pr-3 font-mono">{inr(trade.executionPrice)}</td>
                      <td className="py-2 font-mono">{inr(trade.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
