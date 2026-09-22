/**
 * Phase 1: download the fixed NIFTY 100 universe once and write a data-quality report.
 * Does not call Jev. Safe to re-run: symbols with a complete cache file are skipped.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import YahooFinance from "yahoo-finance2";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataConfig = JSON.parse(readFileSync(join(root, "config/data.json"), "utf8"));
const csvPath = join(root, "data/universe/ind_nifty100list.csv");
const universePath = join(root, "config/universe.json");
const ohlcvDir = join(root, "data/raw/ohlcv");
const eventsDir = join(root, "data/raw/events");
const manifestPath = join(root, "data/raw/manifest.json");
const reportJsonPath = join(root, "results/phase1_data_quality.json");
const reportMdPath = join(root, "results/phase1_data_quality.md");

const PERIOD1 = dataConfig.period1;
const PERIOD2 = dataConfig.period2_exclusive;
const TZ = dataConfig.session_timezone;
const BENCHMARK = { yahoo: "^CNX100", file: "CNX100" };
const FORCE = process.argv.includes("--force");
const CONCURRENCY = 5;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function sessionDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function px(value) {
  if (value == null || Number.isNaN(value)) return "";
  return String(Math.round(value * 10000) / 10000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readConstituents() {
  const rows = [];
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = line.split(",");
    if (!headers) {
      headers = cells;
      continue;
    }
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    rows.push({
      nse_symbol: row.Symbol,
      yahoo_symbol: `${row.Symbol}.NS`,
      name: row["Company Name"],
      industry: row.Industry,
      series: row.Series,
      isin: row["ISIN Code"],
    });
  }
  if (rows.length !== 100) {
    throw new Error(`Expected 100 NIFTY 100 constituents, found ${rows.length}`);
  }
  return rows;
}

function writeUniverse(symbols) {
  const universe = {
    universe: "NIFTY100",
    label: "Fixed current NIFTY 100 universe",
    as_of: "2026-09-22",
    membership: "current_snapshot",
    historical_membership: false,
    source: "NSE Nifty Indices constituent file ind_nifty100list.csv",
    source_url: "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv",
    local_source: "data/universe/ind_nifty100list.csv",
    survivorship_note:
      "This is the constituent list published by NSE on the day it was downloaded (2026-09-22). It is not the historical membership of NIFTY 100. Stocks that left the index before this date are absent. Stocks that joined are included for their whole cached history.",
    benchmark: {
      name: "NIFTY 100",
      yahoo_symbol: "^CNX100",
      cache_file: "data/raw/ohlcv/CNX100.csv",
    },
    symbols,
  };
  writeFileSync(universePath, `${JSON.stringify(universe, null, 2)}\n`);
  return universe;
}

function cachePath(stem) {
  return join(ohlcvDir, `${stem}.csv`);
}

function isComplete(stem) {
  const path = cachePath(stem);
  if (!existsSync(path)) return false;
  const lines = readFileSync(path, "utf8").trim().split("\n");
  if (lines.length < 3) return false;
  const last = lines.at(-1).split(",")[0];
  return last >= "2026-09-22" && lines.length > 20;
}

async function fetchChart(symbol) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await yahooFinance.chart(symbol, {
        period1: PERIOD1,
        period2: PERIOD2,
        interval: "1d",
        events: "div|split",
        return: "array",
      });
    } catch (error) {
      lastError = error;
      await sleep(750 * attempt * attempt);
    }
  }
  throw lastError;
}

function eventList(events, key) {
  const value = events?.[key];
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function writeSymbol(stem, chart) {
  const quotes = (chart.quotes ?? []).filter((quote) => quote?.date);
  const lines = ["date,open,high,low,close,adj_close,volume"];
  const seen = new Set();
  let duplicateDates = 0;
  for (const quote of quotes) {
    const date = sessionDate(quote.date);
    if (seen.has(date)) {
      duplicateDates += 1;
      continue;
    }
    seen.add(date);
    lines.push(
      [
        date,
        px(quote.open),
        px(quote.high),
        px(quote.low),
        px(quote.close),
        px(quote.adjclose),
        quote.volume == null || Number.isNaN(quote.volume) ? "" : String(Math.round(quote.volume)),
      ].join(","),
    );
  }
  writeFileSync(cachePath(stem), `${lines.join("\n")}\n`);

  const events = {
    dividends: eventList(chart.events, "dividends").map((item) => ({
      date: sessionDate(item.date),
      amount: item.amount,
    })),
    splits: eventList(chart.events, "splits").map((item) => ({
      date: sessionDate(item.date),
      numerator: item.numerator,
      denominator: item.denominator,
      splitRatio: item.splitRatio,
    })),
  };
  writeFileSync(join(eventsDir, `${stem}.json`), `${JSON.stringify(events, null, 2)}\n`);
  return { rows: lines.length - 1, duplicateDates, currency: chart.meta?.currency ?? null };
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function readCsv(stem) {
  const text = readFileSync(cachePath(stem), "utf8").trim().split("\n");
  const header = text[0].split(",");
  return text.slice(1).map((line) => {
    const cells = line.split(",");
    const row = Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
    for (const field of ["open", "high", "low", "close", "adj_close", "volume"]) {
      row[field] = row[field] === "" ? null : Number(row[field]);
    }
    return row;
  });
}

function analyzeBars(rows, calendar) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const dates = rows.map((row) => row.date);
  let nullBars = 0;
  let ohlcViolations = 0;
  let zeroVolume = 0;
  let negativePrices = 0;
  let adjDiffDays = 0;
  for (const row of rows) {
    const values = [row.open, row.high, row.low, row.close];
    if (values.some((value) => value == null) || row.volume == null) nullBars += 1;
    if (values.some((value) => value != null && value < 0)) negativePrices += 1;
    if (row.volume === 0) zeroVolume += 1;
    if (values.every((value) => value != null)) {
      const upper = Math.max(row.open, row.close, row.low);
      const lower = Math.min(row.open, row.close, row.high);
      if (row.high + 0.05 < upper || row.low - 0.05 > lower) ohlcViolations += 1;
    }
    if (row.close != null && row.adj_close != null && Math.abs(row.close - row.adj_close) > 0.01) {
      adjDiffDays += 1;
    }
  }
  const missingDates = calendar.filter((date) => !byDate.has(date));
  const extraDates = dates.filter((date) => !calendar.includes(date));
  return {
    rows: rows.length,
    first: dates[0] ?? null,
    last: dates.at(-1) ?? null,
    null_bars: nullBars,
    ohlc_violations: ohlcViolations,
    zero_volume_days: zeroVolume,
    negative_prices: negativePrices,
    days_adj_close_differs: adjDiffDays,
    missing_vs_benchmark: missingDates.length,
    missing_dates: missingDates,
    extra_vs_benchmark: extraDates.length,
    extra_dates: extraDates,
  };
}

function splitBehavior(rows, splits) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const dates = rows.map((row) => row.date);
  return splits.map((split) => {
    const index = dates.indexOf(split.date);
    const previous = index > 0 ? rows[index - 1] : null;
    const current = byDate.get(split.date);
    const factor =
      split.denominator && split.numerator ? split.denominator / split.numerator : null;
    let overnight = null;
    let classification = "insufficient_prices";
    if (previous?.close && current?.close) {
      overnight = current.close / previous.close;
      const distanceToUnadjusted = factor == null ? Infinity : Math.abs(overnight - factor);
      const distanceToAdjusted = Math.abs(overnight - 1);
      classification =
        distanceToAdjusted < distanceToUnadjusted && distanceToAdjusted < 0.2
          ? "series_looks_split_adjusted"
          : "series_looks_unadjusted";
    }
    return {
      ...split,
      previous_close: previous?.close ?? null,
      close_on_ex_date: current?.close ?? null,
      overnight_ratio: overnight == null ? null : Math.round(overnight * 10000) / 10000,
      expected_unadjusted_ratio: factor,
      classification,
    };
  });
}

function sampleRows(rows) {
  const pick = (row) =>
    row && {
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      adj_close: row.adj_close,
      volume: row.volume,
    };
  return {
    first: rows.slice(0, 3).map(pick),
    last: rows.slice(-3).map(pick),
  };
}

async function downloadOne(label, stem, yahoo) {
  if (!FORCE && isComplete(stem)) {
    console.log(`cache ${label}`);
    return { label, stem, yahoo, status: "cached" };
  }
  try {
    const chart = await fetchChart(yahoo);
    const written = writeSymbol(stem, chart);
    console.log(`saved ${label} ${written.rows} rows`);
    return { label, stem, yahoo, status: "downloaded", ...written };
  } catch (error) {
    console.error(`FAILED ${label}: ${error.message}`);
    return { label, stem, yahoo, status: "failed", error: String(error.message || error) };
  }
}

function isFlatZero(row) {
  return Boolean(
    row &&
      row.volume === 0 &&
      row.open != null &&
      row.open === row.high &&
      row.high === row.low &&
      row.low === row.close,
  );
}

function isEmptyBar(row) {
  return !row || [row.open, row.high, row.low, row.close].every((value) => value == null);
}

function isRealBar(row) {
  return Boolean(row && row.close != null && row.volume > 0 && !isFlatZero(row));
}

function auditSessions(symbolNames) {
  const bySymbol = new Map(symbolNames.map((name) => [name, new Map(readCsv(name).map((row) => [row.date, row]))]));
  const firstRealDate = new Map();
  for (const name of symbolNames) {
    for (const [date, row] of bySymbol.get(name)) {
      if (isRealBar(row)) {
        firstRealDate.set(name, date);
        break;
      }
    }
  }
  const benchmarkRows = readCsv(BENCHMARK.file);
  const benchmarkByDate = new Map(benchmarkRows.map((row) => [row.date, row]));
  const placeholders = [];
  const trading = [];
  const benchmarkGaps = [];
  const badPrints = [];

  for (const date of benchmarkRows.map((row) => row.date)) {
    const flat = [];
    const empty = [];
    const real = [];
    for (const name of symbolNames) {
      const listedFrom = firstRealDate.get(name);
      if (!listedFrom || date < listedFrom) continue;
      const row = bySymbol.get(name).get(date);
      if (isRealBar(row)) real.push(name);
      else if (!row || isEmptyBar(row)) empty.push(name);
      else if (isFlatZero(row)) flat.push(name);
      else empty.push(name);
    }
    const benchmark = benchmarkByDate.get(date);
    const benchmarkReal = Boolean(
      benchmark && benchmark.close != null && benchmark.high != null && benchmark.low != null && benchmark.high !== benchmark.low,
    );
    if (real.length === 0 && !benchmarkReal) {
      placeholders.push(date);
      continue;
    }
    trading.push(date);
    if (!benchmarkReal) benchmarkGaps.push(date);
    if (flat.length || empty.length) {
      badPrints.push({
        date,
        real_bar_count: real.length,
        flat_zero_volume_count: flat.length,
        empty_count: empty.length,
        real_symbols: real.length <= 5 ? real : undefined,
        flat_symbols: flat.length <= 5 ? flat : undefined,
        empty_symbols: empty.length <= 8 ? empty : undefined,
        note:
          flat.length > 20
            ? "Open, high, low and close equal the previous session close, and volume is 0. The NIFTY 100 bar on this date is a normal traded session."
            : "Flat print with volume 0 on a session the rest of the universe traded.",
      });
    }
  }

  const laterListings = [];
  const holes = [];
  for (const name of symbolNames) {
    const realDates = trading.filter((date) => isRealBar(bySymbol.get(name).get(date)));
    const first = realDates[0] ?? null;
    if (!first) {
      holes.push({ nse_symbol: name, bad_or_missing_sessions: trading });
      continue;
    }
    const before = trading.filter((date) => date < first).length;
    if (before > 0) laterListings.push({ nse_symbol: name, first_real_session: first, trading_sessions_before_listing: before });
    const bad = trading.filter((date) => date >= first && !realDates.includes(date));
    if (bad.length) holes.push({ nse_symbol: name, first_real_session: first, bad_or_missing_sessions: bad });
  }

  return {
    raw_benchmark_rows: benchmarkRows.length,
    placeholder_sessions: placeholders,
    trading_sessions: trading.length,
    first_trading_session: trading[0] ?? null,
    last_trading_session: trading.at(-1) ?? null,
    benchmark_missing_on_trading_day: benchmarkGaps,
    bad_prints: badPrints,
    later_listings: laterListings,
    holes_after_listing: holes,
    trading_dates: trading,
  };
}

function markdownReport(report) {
  const lines = [];
  lines.push("# Phase 1 data quality report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at_ist} IST`);
  lines.push("");
  lines.push("## Observed");
  lines.push("");
  lines.push(`- Data source: Yahoo Finance chart API, client yahoo-finance2 ${report.client_version}.`);
  lines.push(`- Universe label: ${report.universe.label}.`);
  lines.push(`- Constituent file: ${report.universe.local_source}, captured ${report.universe.as_of}.`);
  lines.push(`- Stocks requested: ${report.counts.stocks_requested}.`);
  lines.push(`- Stocks cached: ${report.counts.stocks_cached}.`);
  lines.push(`- Stocks failed: ${report.counts.stocks_failed}.`);
  lines.push(`- Requested window: ${report.window.period1} through the session before ${report.window.period2_exclusive}.`);
  lines.push(`- Benchmark: ${report.benchmark.yahoo_symbol}.`);
  lines.push(`- Raw benchmark rows: ${report.sessions.raw_benchmark_rows}.`);
  lines.push(`- Rows treated as Yahoo placeholders, not trading sessions: ${report.sessions.placeholder_sessions.join(", ")}.`);
  lines.push(`- Trading sessions after that filter: ${report.sessions.trading_sessions}.`);
  lines.push(`- First / last trading session: ${report.sessions.first_trading_session} / ${report.sessions.last_trading_session}.`);
  lines.push(`- Cache directory: \`data/raw/ohlcv/\` and \`data/raw/events/\`.`);
  lines.push(`- Trading calendar: \`data/universe/trading_calendar.json\`.`);
  lines.push("");
  lines.push("## Missing and unusable bars");
  lines.push("");
  lines.push("A trading session is a date where the NIFTY 100 bar has a high-low range, or at least one stock has a bar with volume above zero. Dates where every stock is empty or a flat zero-volume print, and the index bar is empty, stay in the raw cache and are left off the trading calendar.");
  lines.push("");
  if (report.failed.length) {
    lines.push("Failed downloads:");
    lines.push("");
    for (const item of report.failed) lines.push(`- ${item.yahoo}: ${item.error}`);
    lines.push("");
  }
  lines.push(`Benchmark bar missing on a day stocks traded: ${report.sessions.benchmark_missing_on_trading_day.join(", ") || "none"}.`);
  lines.push("");
  lines.push("Unusable stock prints on trading sessions:");
  lines.push("");
  for (const print of report.sessions.bad_prints) {
    const who =
      print.flat_symbols?.join(", ") ||
      (print.flat_zero_volume_count ? `${print.flat_zero_volume_count} symbols, real bars only in ${(print.real_symbols || []).join(", ")}` : "none");
    lines.push(`- ${print.date}: flat zero-volume ${who}. ${print.note}`);
  }
  lines.push("");
  lines.push("History starts after the first trading session. The dates before the first real bar are not holes:");
  lines.push("");
  lines.push("| Symbol | First real session | Trading sessions before that |");
  lines.push("| --- | --- | ---: |");
  for (const listing of report.sessions.later_listings) {
    lines.push(`| ${listing.nse_symbol} | ${listing.first_real_session} | ${listing.trading_sessions_before_listing} |`);
  }
  lines.push("");
  lines.push(`Symbols with a bad or missing bar after their first real session: ${report.sessions.holes_after_listing.length}.`);
  lines.push("");
  lines.push("## Adjustment finding");
  lines.push("");
  lines.push(report.adjustment_finding);
  lines.push("");
  lines.push("## Sample raw rows");
  lines.push("");
  for (const sample of report.samples) {
    lines.push(`### ${sample.yahoo_symbol}`);
    lines.push("");
    lines.push("| date | open | high | low | close | adj_close | volume |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const row of [...sample.first, ...sample.last]) {
      lines.push(
        `| ${row.date} | ${row.open} | ${row.high} | ${row.low} | ${row.close} | ${row.adj_close} | ${row.volume} |`,
      );
    }
    lines.push("");
  }
  lines.push("## What this file is not");
  lines.push("");
  lines.push("No features were calculated. No portfolio was simulated. Jev was not called.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  mkdirSync(ohlcvDir, { recursive: true });
  mkdirSync(eventsDir, { recursive: true });
  mkdirSync(join(root, "results"), { recursive: true });

  const symbols = await readConstituents();
  const universe = writeUniverse(symbols);
  console.log(`universe ${symbols.length} symbols → ${universePath}`);

  const benchmarkResult = await downloadOne(BENCHMARK.yahoo, BENCHMARK.file, BENCHMARK.yahoo);
  const stockResults = await mapPool(symbols, CONCURRENCY, (symbol) =>
    downloadOne(symbol.yahoo_symbol, symbol.nse_symbol, symbol.yahoo_symbol),
  );

  const failed = [benchmarkResult, ...stockResults].filter((item) => item.status === "failed");
  if (benchmarkResult.status === "failed") {
    throw new Error(`Benchmark download failed: ${benchmarkResult.error}`);
  }

  const benchmarkRows = readCsv(BENCHMARK.file);
  const calendar = benchmarkRows.map((row) => row.date);
  const benchmarkStats = analyzeBars(benchmarkRows, calendar);

  const stocks = symbols.map((symbol) => {
    const download = stockResults.find((item) => item.yahoo === symbol.yahoo_symbol);
    if (download.status === "failed" || !existsSync(cachePath(symbol.nse_symbol))) {
      return {
        ...symbol,
        status: "failed",
        error: download.error ?? "missing cache",
      };
    }
    const rows = readCsv(symbol.nse_symbol);
    const stats = analyzeBars(rows, calendar);
    const events = JSON.parse(readFileSync(join(eventsDir, `${symbol.nse_symbol}.json`), "utf8"));
    const splits = splitBehavior(rows, events.splits ?? []);
    return {
      ...symbol,
      status: download.status,
      currency: "INR",
      ...stats,
      dividends: events.dividends ?? [],
      splits,
    };
  });

  const cached = stocks.filter((stock) => stock.status !== "failed");
  const sessions = auditSessions(cached.map((stock) => stock.nse_symbol));
  writeFileSync(
    join(root, "data/universe/trading_calendar.json"),
    `${JSON.stringify(
      {
        rule: "A date is a trading session when the NIFTY 100 bar has a high-low range, or at least one constituent has volume above zero. Other dated rows from Yahoo stay in the raw cache and are not trading sessions.",
        trading_dates: sessions.trading_dates,
        placeholder_sessions: sessions.placeholder_sessions,
        benchmark_missing_on_trading_day: sessions.benchmark_missing_on_trading_day,
      },
      null,
      2,
    )}\n`,
  );

  const splitChecks = cached.flatMap((stock) =>
    (stock.splits ?? []).map((split) => ({ symbol: stock.nse_symbol, ...split })),
  );
  const adjustedSplits = splitChecks.filter((item) => item.classification === "series_looks_split_adjusted").length;
  const unadjustedSplits = splitChecks.filter((item) => item.classification === "series_looks_unadjusted").length;
  const dividendEvents = cached.reduce((sum, stock) => sum + (stock.dividends?.length ?? 0), 0);
  const adjDiffSymbols = cached.filter((stock) => stock.days_adj_close_differs > 0).length;

  let adjustmentFinding;
  if (splitChecks.length === 0) {
    adjustmentFinding =
      "Yahoo returned no split events inside this window, so the split-adjustment behavior of `close` could not be measured here. `adj_close` differs from `close` on " +
      `${adjDiffSymbols} symbols, across days that also have dividend events (${dividendEvents} dividend events in total). ` +
      "`adj_close` is the dividend-adjusted series as of this download. It must not be passed to Jev as the price that was trading on an earlier date. `close` is the series to treat as the traded price until a later phase rebuilds a point-in-time adjustment.";
  } else {
    adjustmentFinding =
      `Yahoo reported ${splitChecks.length} split events. Overnight close ratios classify ${adjustedSplits} as already split-adjusted and ${unadjustedSplits} as unadjusted traded prices. ` +
      `Dividend events: ${dividendEvents}. Symbols where adj_close differs from close: ${adjDiffSymbols}. ` +
      "A split-adjusted history downloaded on 2026-09-22 embeds split factors whose ex-date is after a simulated decision date. That changes the rupee level, not the split-adjusted return. `adj_close` also embeds later dividends and is not a point-in-time price.";
  }

  const sampleNames = ["RELIANCE", "HDFCBANK", "INFY"].filter((name) =>
    cached.some((stock) => stock.nse_symbol === name),
  );
  const samples = sampleNames.map((name) => {
    const stock = cached.find((item) => item.nse_symbol === name);
    const rows = readCsv(name);
    return { yahoo_symbol: stock.yahoo_symbol, name: stock.name, ...sampleRows(rows) };
  });

  const generatedAt = new Date();
  const report = {
    phase: 1,
    generated_at_utc: generatedAt.toISOString(),
    generated_at_ist: generatedAt.toLocaleString("en-IN", { timeZone: TZ, hour12: false }),
    client_version: "4.0.2",
    jev_called: false,
    universe: {
      label: universe.label,
      as_of: universe.as_of,
      local_source: universe.local_source,
      source_url: universe.source_url,
      historical_membership: false,
    },
    window: {
      period1: PERIOD1,
      period2_exclusive: PERIOD2,
      session_timezone: TZ,
      warmup_reason: dataConfig.window_note,
    },
    cache: {
      ohlcv: "data/raw/ohlcv/",
      events: "data/raw/events/",
      manifest: "data/raw/manifest.json",
    },
    counts: {
      stocks_requested: symbols.length,
      stocks_cached: cached.length,
      stocks_failed: stocks.filter((stock) => stock.status === "failed").length,
      raw_benchmark_rows: sessions.raw_benchmark_rows,
      trading_sessions: sessions.trading_sessions,
    },
    benchmark: {
      name: "NIFTY 100",
      yahoo_symbol: "^CNX100",
      cache_file: "data/raw/ohlcv/CNX100.csv",
      raw_rows: benchmarkStats.rows,
      first_raw: benchmarkStats.first,
      last_raw: benchmarkStats.last,
      null_bars: benchmarkStats.null_bars,
      ohlc_violations: benchmarkStats.ohlc_violations,
      zero_volume_days: benchmarkStats.zero_volume_days,
      trading_sessions: sessions.trading_sessions,
      last: sessions.last_trading_session,
    },
    sessions: {
      raw_benchmark_rows: sessions.raw_benchmark_rows,
      placeholder_sessions: sessions.placeholder_sessions,
      trading_sessions: sessions.trading_sessions,
      first_trading_session: sessions.first_trading_session,
      last_trading_session: sessions.last_trading_session,
      benchmark_missing_on_trading_day: sessions.benchmark_missing_on_trading_day,
      bad_prints: sessions.bad_prints,
      later_listings: sessions.later_listings,
      holes_after_listing: sessions.holes_after_listing,
    },
    adjustment_finding: adjustmentFinding,
    split_checks: splitChecks,
    failed: failed.map((item) => ({ yahoo: item.yahoo, error: item.error })),
    stocks: cached.map((stock) => ({
      nse_symbol: stock.nse_symbol,
      yahoo_symbol: stock.yahoo_symbol,
      name: stock.name,
      industry: stock.industry,
      isin: stock.isin,
      rows: stock.rows,
      first: stock.first,
      last: stock.last,
      missing_vs_benchmark: stock.missing_vs_benchmark,
      null_bars: stock.null_bars,
      ohlc_violations: stock.ohlc_violations,
      zero_volume_days: stock.zero_volume_days,
      negative_prices: stock.negative_prices,
      days_adj_close_differs: stock.days_adj_close_differs,
      dividends: stock.dividends.length,
      splits: stock.splits.length,
    })),
    samples,
  };

  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, markdownReport(report));
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        source: "Yahoo Finance chart API via yahoo-finance2",
        client_version: "4.0.2",
        downloaded_at_utc: generatedAt.toISOString(),
        period1: PERIOD1,
        period2_exclusive: PERIOD2,
        interval: "1d",
        session_timezone: TZ,
        universe_label: universe.label,
        universe_as_of: universe.as_of,
        symbols: symbols.length,
        benchmark: "^CNX100",
        jev_called: false,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `report stocks=${report.counts.stocks_cached}/${report.counts.stocks_requested} sessions=${report.sessions.trading_sessions} holes=${report.sessions.holes_after_listing.length} failed=${report.counts.stocks_failed}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
