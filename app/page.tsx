import Link from "next/link";
import { connection } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type SampleRow = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adj_close: number | null;
  volume: number | null;
};

type Report = {
  generated_at_ist: string;
  client_version: string;
  jev_called: boolean;
  universe: {
    label: string;
    as_of: string;
    local_source: string;
    source_url: string;
    historical_membership: boolean;
  };
  window: {
    period1: string;
    period2_exclusive: string;
    session_timezone: string;
    warmup_reason: string;
  };
  cache: { ohlcv: string; events: string; manifest: string };
  counts: {
    stocks_requested: number;
    stocks_cached: number;
    stocks_failed: number;
    raw_benchmark_rows: number;
    trading_sessions: number;
  };
  benchmark: {
    name: string;
    yahoo_symbol: string;
    cache_file: string;
    last: string;
  };
  sessions: {
    raw_benchmark_rows: number;
    placeholder_sessions: string[];
    trading_sessions: number;
    first_trading_session: string;
    last_trading_session: string;
    benchmark_missing_on_trading_day: string[];
    bad_prints: {
      date: string;
      real_bar_count: number;
      flat_zero_volume_count: number;
      real_symbols?: string[];
      flat_symbols?: string[];
      note: string;
    }[];
    later_listings: { nse_symbol: string; first_real_session: string; trading_sessions_before_listing: number }[];
    holes_after_listing: { nse_symbol: string; first_real_session: string; bad_or_missing_sessions: string[] }[];
  };
  adjustment_finding: string;
  failed: { yahoo: string; error: string }[];
  problem_stocks: {
    nse_symbol: string;
    yahoo_symbol: string;
    name: string;
    rows: number;
    first: string;
    last: string;
    missing_vs_benchmark: number;
    missing_dates: string[];
    null_bars: number;
    ohlc_violations: number;
    zero_volume_days: number;
  }[];
  stocks: {
    nse_symbol: string;
    yahoo_symbol: string;
    name: string;
    industry: string;
    rows: number;
    first: string;
    last: string;
    missing_vs_benchmark: number;
    null_bars: number;
    zero_volume_days: number;
    dividends: number;
    splits: number;
  }[];
  samples: { yahoo_symbol: string; name: string; first: SampleRow[]; last: SampleRow[] }[];
};

function loadReport(): Report | null {
  const path = join(process.cwd(), "results/phase1_data_quality.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

function inr(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function Home() {
  await connection();
  const report = loadReport();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 text-zinc-900">
      <p className="text-xs font-medium tracking-[0.18em] text-zinc-500">JEV INVESTMENT LAB · PHASE 1</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Market data cache</h1>
      <p className="mt-3 max-w-2xl text-lg leading-7 text-zinc-600">
        Fixed current NIFTY 100 universe, stored locally. Jev has not been asked to decide anything.
      </p>
      <p className="mt-4 text-sm">
        <Link className="underline decoration-zinc-300 underline-offset-2" href="/experiments/phase3">
          Phase 3 decision audit
        </Link>
        <span className="mx-2 text-zinc-400">·</span>
        <Link className="underline decoration-zinc-300 underline-offset-2" href="/experiments/replay">
          Historical replay
        </Link>
      </p>

      {!report ? (
        <p className="mt-10 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
          No quality report yet. From the project root, run <code>npm run download</code>.
        </p>
      ) : (
        <ReportView report={report} />
      )}
    </main>
  );
}

function ReportView({ report }: { report: Report }) {
  const industries = new Map<string, number>();
  for (const stock of report.stocks) {
    industries.set(stock.industry, (industries.get(stock.industry) ?? 0) + 1);
  }
  const holesOnlyOnSharedBadDay = report.sessions.holes_after_listing.filter(
    (hole) => hole.bad_or_missing_sessions.length === 1 && hole.bad_or_missing_sessions[0] === "2025-03-18",
  ).length;
  const otherHoles = report.sessions.holes_after_listing.filter((hole) =>
    hole.bad_or_missing_sessions.some((date) => date !== "2025-03-18"),
  );

  return (
    <div className="mt-10 space-y-12">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Stocks cached" value={`${report.counts.stocks_cached} / ${report.counts.stocks_requested}`} />
        <Stat label="Trading sessions" value={String(report.sessions.trading_sessions)} />
        <Stat label="Failed downloads" value={String(report.counts.stocks_failed)} />
        <Stat label="Bad prints after listing" value={String(report.sessions.holes_after_listing.length)} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card title="Source">
          <Fact k="Vendor" v={`Yahoo Finance chart API, yahoo-finance2 ${report.client_version}`} />
          <Fact k="Universe" v={report.universe.label} />
          <Fact k="List date" v={report.universe.as_of} />
          <Fact k="Constituent file" v={report.universe.local_source} />
          <Fact k="Benchmark" v={`${report.benchmark.name} (${report.benchmark.yahoo_symbol})`} />
          <Fact k="Session clock" v={report.window.session_timezone} />
          <Fact k="Report time" v={`${report.generated_at_ist} IST`} />
        </Card>
        <Card title="Window">
          <Fact k="First session requested" v={report.window.period1} />
          <Fact k="First trading session" v={report.sessions.first_trading_session} />
          <Fact k="Last trading session" v={report.sessions.last_trading_session} />
          <Fact k="Raw benchmark rows" v={String(report.sessions.raw_benchmark_rows)} />
          <Fact k="Price cache" v={report.cache.ohlcv} />
          <Fact k="Event cache" v={report.cache.events} />
          <p className="mt-4 text-sm leading-6 text-zinc-600">{report.window.warmup_reason}</p>
        </Card>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Coverage</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Yahoo also returned dated rows that are not trading sessions: every constituent is empty or a flat
          zero-volume print, and the index bar is empty. Those rows stay in the raw files and are left off the
          trading calendar: {report.sessions.placeholder_sessions.join(", ")}.
        </p>
        {report.failed.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {report.failed.map((item) => (
              <li key={item.yahoo} className="rounded border border-red-200 bg-red-50 px-3 py-2">
                {item.yahoo}: {item.error}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm leading-6 text-zinc-800">
          NIFTY 100 itself has no bar on {report.sessions.benchmark_missing_on_trading_day.join(", ") || "no trading day"}, while
          the stocks do.
        </p>
        <ul className="mt-4 space-y-3 text-sm leading-6">
          {report.sessions.bad_prints.map((print) => (
            <li key={print.date}>
              <span className="font-medium">{print.date}.</span> {print.flat_zero_volume_count} flat zero-volume
              prints, {print.real_bar_count} real bars
              {print.real_symbols ? ` (${print.real_symbols.join(", ")})` : ""}
              {print.flat_symbols ? `. Symbols: ${print.flat_symbols.join(", ")}` : ""}. {print.note}
            </li>
          ))}
        </ul>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-xs tracking-wide text-zinc-500">
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="py-2 pr-3 font-medium">First real session</th>
                <th className="py-2 font-medium">Sessions before listing</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.later_listings.map((listing) => (
                <tr key={listing.nse_symbol} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 font-medium">{listing.nse_symbol}</td>
                  <td className="py-2 pr-3">{listing.first_real_session}</td>
                  <td className="py-2">{listing.trading_sessions_before_listing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          {report.sessions.holes_after_listing.length} symbols have at least one unusable bar after they start
          trading. {holesOnlyOnSharedBadDay} of those are only the 2025-03-18 print. The other names are{" "}
          {otherHoles.map((hole) => `${hole.nse_symbol} (${hole.bad_or_missing_sessions.join(", ")})`).join("; ")}.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Adjustment</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">{report.adjustment_finding}</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Sample bars</h2>
        <div className="mt-4 space-y-8">
          {report.samples.map((sample) => (
            <div key={sample.yahoo_symbol}>
              <h3 className="font-medium">
                {sample.name}{" "}
                <span className="font-normal text-zinc-500">{sample.yahoo_symbol}</span>
              </h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-300 text-xs tracking-wide text-zinc-500">
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
                      <tr key={`${sample.yahoo_symbol}-${row.date}`} className="border-b border-zinc-100">
                        <td className="py-2 pr-3">{row.date}</td>
                        <td className="py-2 pr-3">{inr(row.open)}</td>
                        <td className="py-2 pr-3">{inr(row.high)}</td>
                        <td className="py-2 pr-3">{inr(row.low)}</td>
                        <td className="py-2 pr-3">{inr(row.close)}</td>
                        <td className="py-2 pr-3">{inr(row.adj_close)}</td>
                        <td className="py-2">{row.volume == null ? "—" : row.volume.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Industries in the file</h2>
        <p className="mt-2 text-sm text-zinc-600">
          NSE industry labels from the constituent file. Sector index prices were not downloaded.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
          {[...industries.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([industry, count]) => (
              <li key={industry} className="flex justify-between border-b border-zinc-100 py-1">
                <span>{industry}</span>
                <span className="text-zinc-500">{count}</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3">
      <p className="text-xs tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 px-4 py-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <p className="grid grid-cols-[9rem_1fr] gap-3 text-sm">
      <span className="text-zinc-500">{k}</span>
      <span className="break-all">{v}</span>
    </p>
  );
}
