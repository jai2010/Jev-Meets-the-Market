import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { buildDemoDataset, demoBenchmarkValue, demoPortfolioValue } from "../src/replay/demo"
import {
  chartThroughIndex,
  dayNumber,
  isFinale,
  maxDrawdown,
  returnFrom,
  skipTarget,
  snapshotAt,
  visibleSnapshot,
} from "../src/replay/engine"
import { clearReplayDatasetCache, loadReplayDataset } from "../src/replay/load"
import type { ReplayDataset } from "../src/replay/types"

const dates = ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"]

describe("historical replay engine", () => {
  it("starts on the first trading day and ends on the last", () => {
    const dataset = buildDemoDataset(dates)
    expect(snapshotAt(dataset, 0).date).toBe(dates[0])
    expect(snapshotAt(dataset, 99).date).toBe(dates[3])
    expect(dayNumber(0)).toBe(1)
    expect(dayNumber(3)).toBe(4)
    expect(dataset.days).toHaveLength(4)
  })

  it("changes the visible date with the day index", () => {
    const dataset = buildDemoDataset(dates)
    expect(dataset.days.map((day) => day.date)).toEqual(dates)
    expect(snapshotAt(dataset, 2).date).toBe("2026-03-12")
  })

  it("keeps decision counts, portfolio, benchmark, and positions on the stored snapshot", () => {
    const dataset = buildDemoDataset(dates)
    const day = snapshotAt(dataset, 2)
    const total = day.decisionCounts.BUY + day.decisionCounts.HOLD + day.decisionCounts.SELL + day.decisionCounts.NO_ACTION
    expect(total).toBe(day.stocksEvaluated)
    expect(day.portfolioValue).toBe(demoPortfolioValue(2, dataset.experiment.initialCapital))
    expect(day.benchmarkValue).toBe(demoBenchmarkValue(2, dataset.experiment.initialCapital))
    expect(visibleSnapshot(dataset, 2, 4)?.positions).toEqual(day.positions)
    expect(visibleSnapshot(dataset, 2, 2)?.portfolioValue).toBe(dataset.days[1].portfolioValue)
    expect(chartThroughIndex(2, 1)).toBe(1)
  })

  it("maps the slider and skip-to-end onto trading days", () => {
    expect(skipTarget(4)).toEqual({ index: 3, stage: 4 })
    expect(isFinale(3, 4, 4)).toBe(true)
    expect(isFinale(2, 4, 4)).toBe(false)
    const dataset = buildDemoDataset(dates)
    expect(snapshotAt(dataset, skipTarget(dataset.days.length).index)).toBe(dataset.days.at(-1))
  })

  it("uses the final stored snapshot for the ending portfolio", () => {
    const dataset = buildDemoDataset(dates)
    const last = dataset.days[dataset.days.length - 1]
    expect(returnFrom(dataset.experiment.initialCapital, last.portfolioValue)).toBeCloseTo(last.portfolioValue / 1_000_000 - 1)
    expect(maxDrawdown(dataset.days.map((day) => day.portfolioValue))).toBeLessThanOrEqual(0)
  })

  it("is deterministic and does not call Jev", () => {
    expect(buildDemoDataset(dates)).toEqual(buildDemoDataset(dates))
    const source = [
      "src/replay/load.ts",
      "src/replay/demo.ts",
      "src/replay/engine.ts",
      "src/replay/partial-v1.ts",
      "app/experiments/replay/page.tsx",
      "app/experiments/replay/replay-view.tsx",
    ]
      .map((path) => read(path))
      .join("\n")
    expect(source).not.toMatch(/ai-gateway|requestDecision|requestWithRetry|jev:test|jev:backtest/)
  })

  it("loads recorded results when they exist and otherwise stays in demo mode", async () => {
    clearReplayDatasetCache()
    const empty = mkdtempSync(join(tmpdir(), "replay-empty-"))
    expect((await loadReplayDataset(empty)).mode).toBe("demo")

    const recordedRoot = mkdtempSync(join(tmpdir(), "replay-recorded-"))
    const recorded: ReplayDataset = {
      mode: "recorded",
      experiment: {
        id: "JEV-RECORDED-TEST",
        startDate: "2026-04-01",
        endDate: "2026-04-02",
        initialCapital: 1_000_000,
        universe: "NIFTY 100 (current)",
        maxPositions: 5,
        maxAllocation: 0.2,
        execution: "NEXT_OPEN",
        transactionCost: 0.001,
        slippage: 0.0005,
        model: "typesafe-ai/jev",
        promptVersion: "decision_schema_v1",
      },
      days: [
        {
          date: "2026-04-01",
          dayNumber: 1,
          stocksEvaluated: 100,
          decisionCounts: { BUY: 1, HOLD: 97, SELL: 1, NO_ACTION: 1 },
          portfolioValue: 1_010_000,
          cash: 200_000,
          investedValue: 810_000,
          benchmarkValue: 1_004_000,
          positions: [{ ticker: "INFY", value: 810_000, returnPct: 0.01, daysHeld: 1 }],
          highlightedDecisions: [],
          decisions: [],
          tradesExecuted: [],
        },
      ],
    }
    mkdirSync(join(recordedRoot, "data/processed/replay"), { recursive: true })
    writeFileSync(join(recordedRoot, "data/processed/replay/experiment.json"), JSON.stringify(recorded))
    clearReplayDatasetCache()
    const loaded = await loadReplayDataset(recordedRoot)
    expect(loaded.mode).toBe("recorded")
    expect(loaded.experiment.id).toBe("JEV-RECORDED-TEST")
    expect(loaded.days[0].portfolioValue).toBe(1_010_000)
  })

  it("loads the interrupted V1 partial run as labeled test data without writing V1 files", async () => {
    clearReplayDatasetCache()
    const root = resolve(import.meta.dirname, "..")
    const watched = [
      "data/processed/phase4/jev_experiment.duckdb",
      "data/processed/phase4/jev_experiment.duckdb.wal",
      "data/processed/phase4/progress.json",
      "data/processed/replay/manifest.json",
    ].map((path) => {
      const full = resolve(root, path)
      const before = statSync(full)
      return { full, mtimeMs: before.mtimeMs, size: before.size }
    })

    const dataset = await loadReplayDataset(root)
    expect(dataset.mode).toBe("partial")
    expect(dataset.experiment.id).toBe("JEV-20260922-V1")
    expect(dataset.days[0]?.date).toBe("2026-03-10")
    expect(dataset.days.at(-1)?.date).toBe("2026-05-11")
    expect(dataset.experiment.endDate).toBe("2026-05-11")

    const mid = dataset.days.find((day) => day.date === "2026-05-08")
    expect(mid).toBeTruthy()
    expect(mid!.portfolioValue).toBeCloseTo(1_206_189.4812144751, 5)
    expect(mid!.positions.length).toBeGreaterThan(0)
    expect(mid!.positions.length).toBeLessThanOrEqual(5)
    expect(mid!.decisions.length).toBeGreaterThan(0)
    expect(mid!.decisions.every((decision) => typeof decision.ticker === "string" && decision.ticker.length > 0)).toBe(true)

    const early = dataset.days.find((day) => day.date === "2026-03-10")
    const later = dataset.days.find((day) => day.date === "2026-03-25")
    expect(early?.decisions.map((decision) => decision.ticker).sort()).not.toEqual(
      later?.decisions.map((decision) => decision.ticker).sort(),
    )

    expect(read("src/replay/partial-v1.ts")).not.toMatch(/RELIANCE|HDFCBANK|INFY/)
    expect(read("app/experiments/replay/replay-view.tsx")).not.toMatch(/RELIANCE|HDFCBANK|INFY/)

    for (const file of watched) {
      const after = statSync(file.full)
      expect(after.mtimeMs).toBe(file.mtimeMs)
      expect(after.size).toBe(file.size)
    }
  }, 120_000)
})

function read(path: string): string {
  return readFileSync(resolve(import.meta.dirname, "..", path), "utf8")
}
