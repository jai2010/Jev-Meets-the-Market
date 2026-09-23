import { connection } from "next/server"
import { ExperimentNav } from "@/src/experiments/nav"
import { inr, pct } from "@/src/experiments/format"
import { returnFrom } from "@/src/replay/engine"
import { loadReplayDataset } from "@/src/replay/load"

export default async function PortfolioPage() {
  await connection()
  const dataset = await loadReplayDataset()
  const last = dataset.days.at(-1)
  const initial = dataset.experiment.initialCapital

  return (
    <main className="min-h-dvh bg-[#070b14] text-[#f4f1ea]">
      <ExperimentNav active="portfolio" />
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-6">
        <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">PORTFOLIO</p>
        <h1 className="text-3xl font-semibold tracking-tight">{dataset.experiment.id}</h1>
        <p className="text-sm text-[#c9d2e3]">
          Mark-to-close book on {dataset.experiment.endDate}. Values use the reconstructed replay path.
        </p>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Portfolio value" value={inr(last?.portfolioValue)} accent />
          <Stat label="Cash" value={inr(last?.cash)} />
          <Stat label="Invested" value={inr(last?.investedValue)} />
          <Stat
            label="Return"
            value={last ? pct(returnFrom(initial, last.portfolioValue)) : "—"}
            accent={(last?.portfolioValue ?? 0) >= initial}
          />
        </section>

        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-4">
          <h2 className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">
            OPEN POSITIONS ({last?.positions.length ?? 0} / {dataset.experiment.maxPositions})
          </h2>
          {(last?.positions.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-[#9aa4b8]">No open positions.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] tracking-wide text-[#9aa4b8]">
                    <th className="py-2 pr-3 font-medium">Ticker</th>
                    <th className="py-2 pr-3 font-medium">Value</th>
                    <th className="py-2 pr-3 font-medium">Return</th>
                    <th className="py-2 font-medium">Days held</th>
                  </tr>
                </thead>
                <tbody>
                  {last!.positions.map((position) => (
                    <tr key={position.ticker} className="border-b border-white/5">
                      <td className="py-2 pr-3 font-medium">{position.ticker}</td>
                      <td className="py-2 pr-3 font-mono">{inr(position.value)}</td>
                      <td className={`py-2 pr-3 font-mono ${position.returnPct >= 0 ? "text-[#3ddc97]" : "text-[#ff6b6b]"}`}>
                        {pct(position.returnPct)}
                      </td>
                      <td className="py-2 font-mono text-[#c9d2e3]">{position.daysHeld}</td>
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

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0e1626] px-4 py-3">
      <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${accent ? "text-[#3ddc97]" : ""}`}>{value}</p>
    </div>
  )
}
