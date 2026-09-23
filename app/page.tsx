import Link from "next/link"
import { connection } from "next/server"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ExperimentNav } from "@/src/experiments/nav"
import { loadReplayDataset } from "@/src/replay/load"
import type { ReplayDataset } from "@/src/replay/types"

type SampleRow = {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  adj_close: number | null
  volume: number | null
}

type Report = {
  generated_at_ist: string
  client_version: string
  universe: {
    label: string
    as_of: string
    local_source: string
  }
  window: {
    period1: string
    session_timezone: string
  }
  counts: {
    stocks_requested: number
    stocks_cached: number
    stocks_failed: number
  }
  benchmark: {
    name: string
    yahoo_symbol: string
  }
  sessions: {
    trading_sessions: number
    first_trading_session: string
    last_trading_session: string
    placeholder_sessions: string[]
    later_listings: { nse_symbol: string; first_real_session: string; trading_sessions_before_listing: number }[]
    holes_after_listing: { nse_symbol: string; bad_or_missing_sessions: string[] }[]
  }
  adjustment_finding: string
  samples: { yahoo_symbol: string; name: string; first: SampleRow[]; last: SampleRow[] }[]
  stocks: { industry: string }[]
}

/** Published V2 audit reconciliation (read-only reference; not recalculated here). */
const V2_AUDIT = {
  experimentPortfolio: 1_122_524.610143,
  independentPortfolio: 1_122_524.610143,
  difference: 0,
  successfulDecisions: 10_299,
  trades: 19,
}

function loadReport(): Report | null {
  const path = join(process.cwd(), "results/phase1_data_quality.json")
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, "utf8")) as Report
}

function inr(value: number | null | undefined, digits = 0) {
  if (value == null) return "—"
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function pct(value: number, digits = 2) {
  const sign = value > 0 ? "+" : ""
  return `${sign}${(value * 100).toFixed(digits)}%`
}

export default async function Home() {
  await connection()
  const [dataset, report] = await Promise.all([loadReplayDataset(), Promise.resolve(loadReport())])
  const last = dataset.days.at(-1)
  const initial = dataset.experiment.initialCapital
  const portfolio = last?.portfolioValue ?? V2_AUDIT.experimentPortfolio
  const benchmark = last?.benchmarkValue ?? initial
  const jevReturn = portfolio / initial - 1
  const niftyReturn = benchmark / initial - 1
  const trades = dataset.days.reduce((sum, day) => sum + day.tradesExecuted.length, 0) || V2_AUDIT.trades

  return (
    <main className="min-h-dvh bg-[#070b14] text-[#f4f1ea]">
      <ExperimentNav active="overview" />

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-6">
        {/* 1. Identity */}
        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">DECISION-MAKING EXPERIMENT</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{dataset.experiment.id}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#c9d2e3]">
            A historical simulation that asks whether a structured decision model can repeatedly choose under uncertainty —
            using stock investing as the test bed, not as a product.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/experiments/replay" className="rounded bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#06281a]">
              Open historical replay
            </Link>
            <Link href="/experiments/analysis" className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
              Open analysis
            </Link>
            <Link href="/experiments/phase3" className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
              Open audit
            </Link>
          </div>
        </section>

        {/* 2. Why */}
        <section className="rounded-lg border border-[#3ddc97]/25 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#3ddc97]">WHY THIS EXPERIMENT?</p>
          <div className="mt-3 max-w-3xl space-y-4 text-sm leading-6 text-[#c9d2e3]">
            <p>
              Jev is a new class of AI model designed to make structured decisions rather than generate traditional text.
            </p>
            <p>I wanted to test a simple question:</p>
            <p className="rounded-md border border-white/10 bg-[#0b1220] px-4 py-3 text-[#f4f1ea]">
              “How good is Jev at making difficult decisions when given a large amount of context, a defined set of
              choices, and real constraints?”
            </p>
            <p>Stock investing is a useful test case because decisions are:</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                "uncertain",
                "sequential",
                "context dependent",
                "constrained by capital",
                "affected by previous decisions",
                "evaluated over time rather than on a single question",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#7eb6ff]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>
              This experiment uses stock investing as a <strong className="text-[#f4f1ea]">decision-making test bed</strong>.
              It is <strong className="text-[#f4f1ea]">not</strong> intended to provide financial advice or demonstrate an
              automated trading strategy.
            </p>
          </div>
          <div className="mt-5 rounded-md border border-[#e4c36a]/40 bg-[#2a2210] px-4 py-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-[#f6d98a]">EXPERIMENTAL — NOT INVESTMENT ADVICE</p>
            <p className="mt-2 text-sm leading-6 text-[#f6d98a]/90">
              This is a historical simulation designed to explore AI decision-making. It is not a recommendation to buy or
              sell securities and is not an automated trading system.
            </p>
          </div>
        </section>

        {/* 3. What is tested */}
        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">WHAT IS THIS EXPERIMENT TESTING?</p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
            <FlowCard
              title="INPUT"
              items={[
                "Market data",
                "Technical context",
                "Portfolio state",
                "Available capital",
                "Decision constraints",
              ]}
            />
            <Arrow />
            <FlowCard title="JEV" items={["Structured decision model", dataset.experiment.model]} accent />
            <Arrow />
            <FlowCard title="DECISION" items={["BUY", "HOLD", "SELL", "NO ACTION"]} />
            <Arrow />
            <FlowCard title="PORTFOLIO" items={["Holdings change", "Cash changes", "Value marked at close"]} />
          </div>
          <div className="mt-5 grid gap-2 text-sm text-[#c9d2e3] sm:grid-cols-2">
            {[
              "Can Jev make decisions repeatedly rather than answer a single question?",
              "Can it make decisions while respecting portfolio constraints?",
              "Can it incorporate changing market and portfolio context?",
              "Can it decide when to enter and exit positions?",
              "How does its decision-making behave over a sustained historical replay?",
            ].map((question, index) => (
              <p key={question} className="rounded border border-white/5 bg-[#0b1220] px-3 py-2">
                <span className="mr-2 text-[#7eb6ff]">{index + 1}.</span>
                {question}
              </p>
            ))}
          </div>
          <p className="mt-4 rounded-md border border-white/10 bg-[#0b1220] px-4 py-3 text-sm leading-6 text-[#c9d2e3]">
            The experiment evaluates the quality and behavior of the decisions produced by Jev. Portfolio return is an
            outcome of the simulation, not the sole definition of decision quality.
          </p>
        </section>

        {/* 4. Scope */}
        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">EXPERIMENT SCOPE</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Scope k="Capital" v={inr(initial)} />
            <Scope k="Universe" v={dataset.experiment.universe} />
            <Scope k="Period" v={`${dataset.experiment.startDate} → ${dataset.experiment.endDate}`} />
            <Scope k="Trading sessions" v={String(dataset.days.length)} />
            <Scope k="Model" v={dataset.experiment.model} />
            <Scope k="Decision frequency" v="End of each trading session" />
            <Scope k="Execution" v="Next trading session OPEN" />
            <Scope k="Decision options" v="BUY / HOLD / SELL / NO ACTION" />
            <Scope k="Max positions" v={String(dataset.experiment.maxPositions)} />
            <Scope k="Max initial position allocation" v="20%" />
            <Scope k="Leverage" v="None" />
            <Scope k="Shorting" v="None" />
            <Scope k="Transaction cost" v="10 bps" />
            <Scope k="Slippage" v="5 bps" />
            <Scope k="Benchmark" v="NIFTY 100 buy-and-hold" />
          </div>
        </section>

        {/* 5. Guidelines */}
        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">EXPERIMENT GUIDELINES</p>
          <p className="mt-2 text-sm text-[#c9d2e3]">
            These rules were frozen before the replay and were not changed based on observed results.
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-[#c9d2e3] sm:grid-cols-2">
            {[
              "Jev evaluates eligible stocks at EOD.",
              "BUY on an unheld stock can initiate a position.",
              "BUY on an already-held stock does not add shares.",
              "HOLD maintains the existing state.",
              "SELL exits the entire existing position.",
              "SELL on an unheld stock does nothing.",
              "NO ACTION leaves the portfolio unchanged.",
              "Maximum 5 positions.",
              "Sell decisions are processed before new buys.",
              "A position slot is freed only after a sell actually executes.",
              "New buys are executed at the next trading session OPEN.",
              "Portfolio is marked using CLOSE.",
              "No leverage.",
              "No shorting.",
              "Transaction costs and slippage are included.",
              "Remaining capital stays in cash.",
            ].map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#7eb6ff]" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[#9aa4b8]">No future market information is supplied to Jev for a decision.</p>
        </section>

        {/* 6. What Jev saw */}
        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">WHAT INFORMATION DID JEV RECEIVE?</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#c9d2e3]">
            For each eligible stock on each decision date, Jev received structured market context and the live portfolio
            state — only information available as of that session’s close.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            <FlowCard
              title="MARKET CONTEXT"
              items={[
                "1 / 5 / 20 / 60 day returns",
                "SMA 20 / 50 / 200",
                "RSI",
                "Volatility",
                "Volume / volume ratio",
                "Distance from 52-week high",
                "Drawdown",
                "NIFTY 100 market returns",
                "Relative performance",
              ]}
            />
            <span className="hidden text-center text-[#7eb6ff] md:block">+</span>
            <FlowCard
              title="PORTFOLIO CONTEXT"
              items={["Current holdings", "Available cash", "Portfolio constraints", "Current position state"]}
            />
            <Arrow />
            <FlowCard title="JEV DECISION" items={["BUY", "HOLD", "SELL", "NO ACTION"]} accent />
          </div>
        </section>

        {/* 7. Result */}
        <section className="rounded-lg border border-[#3ddc97]/30 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#3ddc97]">RESULT</p>
          <div className="mt-4 flex flex-wrap items-end gap-3 text-3xl font-semibold tracking-tight md:text-4xl">
            <span>{inr(initial)}</span>
            <span className="text-[#9aa4b8]">→</span>
            <span className="text-[#3ddc97]">{inr(portfolio, 2)}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Jev simulated return" value={pct(jevReturn)} accent />
            <Stat label="NIFTY 100" value={pct(niftyReturn)} />
            <Stat label="Trades" value={String(trades)} />
            <Stat label="Successful decisions" value={V2_AUDIT.successfulDecisions.toLocaleString("en-IN")} />
            <Stat label="Max positions" value={String(dataset.experiment.maxPositions)} />
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-6 text-[#c9d2e3]">
            The result surprised me — but the return is not the experiment’s only output. The more interesting question is
            what Jev actually decided, when it decided it, and why those decisions produced this portfolio path.
          </p>
        </section>

        {/* 8. Audit */}
        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">CAN WE TRUST THE REPLAY?</p>
          <p className="mt-2 text-sm text-[#c9d2e3]">The V2 experiment was independently audited after completion.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              "Trade-level accounting",
              "Portfolio reconstruction",
              "Constraint validation",
              "Yahoo raw OPEN validation",
              "Benchmark reconciliation",
            ].map((item) => (
              <li key={item} className="flex items-center justify-between rounded border border-white/5 bg-[#0b1220] px-3 py-2">
                <span>{item}</span>
                <span className="font-semibold text-[#3ddc97]">✓ PASS</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-[#0b1220] px-4 py-3">
              <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">EXPERIMENT PORTFOLIO</p>
              <p className="mt-2 text-xl font-semibold text-[#3ddc97]">{inr(V2_AUDIT.experimentPortfolio, 6)}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-[#0b1220] px-4 py-3">
              <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">INDEPENDENT RECONSTRUCTION</p>
              <p className="mt-2 text-xl font-semibold">{inr(V2_AUDIT.independentPortfolio, 6)}</p>
            </div>
            <div className="rounded-md border border-[#3ddc97]/30 bg-[#10261c] px-4 py-3">
              <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">DIFFERENCE</p>
              <p className="mt-2 text-xl font-semibold text-[#3ddc97]">{inr(V2_AUDIT.difference)}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-[#c9d2e3]">
            The experiment database and methodology were not modified during the audit.
          </p>
          <p className="mt-2 text-xs leading-5 text-[#9aa4b8]">
            External NSE reference data was requested for all 19 trades, but NSE returned HTTP 503 for those requests.
            Those reference fields are therefore recorded as unavailable; the experiment’s Yahoo Finance data was not
            replaced.
          </p>
          <Link href="/experiments/phase3" className="mt-4 inline-block text-sm text-[#7eb6ff] hover:text-white">
            Open the audit explorer →
          </Link>
        </section>

        {/* 9. Limitations */}
        <section className="rounded-lg border border-[#e4c36a]/30 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#f6d98a]">IMPORTANT LIMITATIONS</p>
          <p className="mt-2 text-sm text-[#c9d2e3]">
            This is an experiment, not evidence that Jev can reliably outperform the market.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#c9d2e3]">
            {[
              "Historical simulation only.",
              "118 trading sessions is a short evaluation window.",
              "The universe uses current NIFTY 100 membership, introducing survivorship bias.",
              "Yahoo Finance data is an experimental data source and is not an authoritative commercial market-data feed.",
              "This is not live trading.",
              "Results do not establish future investment performance.",
              "The experiment was not designed as financial advice or a deployable trading strategy.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#e4c36a]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 10. Explore */}
        <section className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">EXPLORE THE EXPERIMENT</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ExploreCard
              href="/experiments/replay"
              title="1. REPLAY"
              lead="Watch the experiment unfold session by session."
              points={[
                "Jev’s decisions",
                "portfolio state",
                "holdings",
                "cash",
                "portfolio value",
                "trades as they occur",
              ]}
              note="This is the best place to understand the experiment as a sequence of decisions."
            />
            <ExploreCard
              href="/experiments/portfolio"
              title="2. PORTFOLIO"
              lead="See how the portfolio evolved over the experiment."
              points={["portfolio value", "holdings", "cash", "position changes", "performance versus the benchmark"]}
            />
            <ExploreCard
              href="/experiments/trades"
              title="3. TRADES"
              lead="Inspect every executed trade."
              points={[
                "decision date",
                "execution date",
                "ticker",
                "action",
                "execution price",
                "quantity",
                "transaction costs",
                "portfolio impact",
              ]}
            />
            <ExploreCard
              href="/experiments/analysis"
              title="4. ANALYSIS"
              lead="Explore the decision behavior behind the result."
              points={[
                "BUY / HOLD / SELL / NO ACTION behavior",
                "decision probabilities",
                "selected stocks",
                "timing",
                "patterns in Jev’s decisions",
                "portfolio behavior",
              ]}
            />
            <ExploreCard
              href="/experiments/phase3"
              title="5. AUDIT"
              lead="Verify the experiment rather than simply trusting the headline number."
              points={[
                "trade accounting",
                "portfolio accounting",
                "constraints",
                "execution prices",
                "benchmark calculation",
              ]}
              className="lg:col-span-2"
            />
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-[#0b1220] px-4 py-3 text-sm leading-7 text-[#c9d2e3]">
            <p>The Overview tells you WHAT happened.</p>
            <p>Replay shows you HOW it happened.</p>
            <p>Portfolio shows you WHERE the money moved.</p>
            <p>Trades shows you WHAT Jev actually did.</p>
            <p>Analysis helps understand WHY the decisions matter.</p>
            <p>Audit checks WHETHER the result is internally consistent.</p>
          </div>
        </section>

        {/* 11. Data & reproducibility */}
        {report ? (
          <details className="rounded-lg border border-white/10 bg-[#0e1626] p-5">
            <summary className="cursor-pointer text-[10px] tracking-[0.16em] text-[#9aa4b8]">
              DATA & REPRODUCIBILITY
            </summary>
            <p className="mt-3 text-sm text-[#c9d2e3]">
              Technical cache details for readers who want the underlying market-data footprint. This section is
              secondary to the decision-making story above.
            </p>
            <div className="mt-4">
              <MarketCache report={report} dataset={dataset} />
            </div>
          </details>
        ) : null}
      </div>
    </main>
  )
}

function MarketCache({ report, dataset }: { report: Report; dataset: ReplayDataset }) {
  const industries = new Map<string, number>()
  for (const stock of report.stocks) {
    industries.set(stock.industry, (industries.get(stock.industry) ?? 0) + 1)
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">MARKET DATA CACHE</h2>
        <p className="mt-1 text-sm text-[#c9d2e3]">
          Local Yahoo Finance cache behind {dataset.experiment.id}. Experiment window uses sessions from{" "}
          {dataset.experiment.startDate} through {dataset.experiment.endDate}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Stocks cached" value={`${report.counts.stocks_cached} / ${report.counts.stocks_requested}`} />
        <Stat label="Trading sessions in cache" value={String(report.sessions.trading_sessions)} />
        <Stat label="Failed downloads" value={String(report.counts.stocks_failed)} />
        <Stat label="Cache as of" value={report.universe.as_of} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="SOURCE">
          <Fact k="Vendor" v={`Yahoo Finance · yahoo-finance2 ${report.client_version}`} />
          <Fact k="Universe" v={report.universe.label} />
          <Fact k="Constituent file" v={report.universe.local_source} />
          <Fact k="Benchmark" v={`${report.benchmark.name} (${report.benchmark.yahoo_symbol})`} />
          <Fact k="Session clock" v={report.window.session_timezone} />
          <Fact k="Report time" v={`${report.generated_at_ist} IST`} />
        </Card>
        <Card title="CACHE WINDOW">
          <Fact k="First session requested" v={report.window.period1} />
          <Fact k="First trading session" v={report.sessions.first_trading_session} />
          <Fact k="Last trading session" v={report.sessions.last_trading_session} />
          <Fact k="Experiment start" v={dataset.experiment.startDate} />
          <Fact k="Experiment end" v={dataset.experiment.endDate} />
          <Fact k="Placeholder sessions excluded" v={report.sessions.placeholder_sessions.join(", ") || "—"} />
        </Card>
      </div>

      <Card title="ADJUSTMENT">
        <p className="text-sm leading-6 text-[#c9d2e3]">{report.adjustment_finding}</p>
      </Card>

      <Card title="LATER LISTINGS">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] tracking-wide text-[#9aa4b8]">
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="py-2 pr-3 font-medium">First real session</th>
                <th className="py-2 font-medium">Sessions before listing</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.later_listings.map((listing) => (
                <tr key={listing.nse_symbol} className="border-b border-white/5">
                  <td className="py-2 pr-3 font-medium">{listing.nse_symbol}</td>
                  <td className="py-2 pr-3 text-[#c9d2e3]">{listing.first_real_session}</td>
                  <td className="py-2 font-mono text-[#c9d2e3]">{listing.trading_sessions_before_listing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="SAMPLE BARS">
        <div className="space-y-6">
          {report.samples.map((sample) => (
            <div key={sample.yahoo_symbol}>
              <h3 className="text-sm font-medium">
                {sample.name} <span className="font-normal text-[#9aa4b8]">{sample.yahoo_symbol}</span>
              </h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] tracking-wide text-[#9aa4b8]">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Open</th>
                      <th className="py-2 pr-3 font-medium">High</th>
                      <th className="py-2 pr-3 font-medium">Low</th>
                      <th className="py-2 pr-3 font-medium">Close</th>
                      <th className="py-2 pr-3 font-medium">Adj close</th>
                      <th className="py-2 font-medium">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sample.first, ...sample.last].map((row) => (
                      <tr key={`${sample.yahoo_symbol}-${row.date}`} className="border-b border-white/5">
                        <td className="py-2 pr-3">{row.date}</td>
                        <td className="py-2 pr-3 font-mono">{formatPrice(row.open)}</td>
                        <td className="py-2 pr-3 font-mono">{formatPrice(row.high)}</td>
                        <td className="py-2 pr-3 font-mono">{formatPrice(row.low)}</td>
                        <td className="py-2 pr-3 font-mono">{formatPrice(row.close)}</td>
                        <td className="py-2 pr-3 font-mono">{formatPrice(row.adj_close)}</td>
                        <td className="py-2 font-mono">{row.volume == null ? "—" : row.volume.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="INDUSTRIES IN THE FILE">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {[...industries.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([industry, count]) => (
              <li key={industry} className="flex justify-between border-b border-white/5 py-1">
                <span>{industry}</span>
                <span className="text-[#9aa4b8]">{count}</span>
              </li>
            ))}
        </ul>
      </Card>
    </section>
  )
}

function formatPrice(value: number | null) {
  if (value == null) return "—"
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1220] px-4 py-3">
      <p className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight ${accent ? "text-[#3ddc97]" : "text-[#f4f1ea]"}`}>{value}</p>
    </div>
  )
}

function Scope({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-white/5 bg-[#0b1220] px-3 py-2">
      <p className="text-[10px] tracking-[0.14em] text-[#9aa4b8]">{k.toUpperCase()}</p>
      <p className="mt-1 break-words text-sm font-medium">{v}</p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0b1220] p-4">
      <h2 className="text-[10px] tracking-[0.16em] text-[#9aa4b8]">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <p className="grid grid-cols-[9.5rem_1fr] gap-3 text-sm">
      <span className="text-[#9aa4b8]">{k}</span>
      <span className="break-all text-[#f4f1ea]">{v}</span>
    </p>
  )
}

function FlowCard({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${accent ? "border-[#3ddc97]/30 bg-[#10261c]" : "border-white/10 bg-[#0b1220]"}`}>
      <p className={`text-[10px] tracking-[0.16em] ${accent ? "text-[#3ddc97]" : "text-[#9aa4b8]"}`}>{title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-[#c9d2e3]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function Arrow() {
  return (
    <p className="text-center text-lg text-[#7eb6ff]">
      <span className="md:hidden">↓</span>
      <span className="hidden md:inline">→</span>
    </p>
  )
}

function ExploreCard({
  href,
  title,
  lead,
  points,
  note,
  className = "",
}: {
  href: string
  title: string
  lead: string
  points: string[]
  note?: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border border-white/10 bg-[#0b1220] p-4 transition hover:border-[#7eb6ff]/40 ${className}`}
    >
      <p className="text-sm font-semibold text-[#7eb6ff]">{title}</p>
      <p className="mt-2 text-sm text-[#c9d2e3]">{lead}</p>
      <ul className="mt-3 space-y-1 text-xs text-[#9aa4b8]">
        {points.map((point) => (
          <li key={point}>• {point}</li>
        ))}
      </ul>
      {note ? <p className="mt-3 text-xs leading-5 text-[#c9d2e3]">{note}</p> : null}
    </Link>
  )
}
