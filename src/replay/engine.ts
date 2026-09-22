import type { ReplayDataset, ReplaySnapshot } from "./types"

export type ReplayStage = 0 | 1 | 2 | 3 | 4

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, Math.round(index)))
}

export function dayNumber(index: number): number {
  return index + 1
}

export function snapshotAt(dataset: ReplayDataset, index: number): ReplaySnapshot {
  return dataset.days[clampIndex(index, dataset.days.length)]
}

/** Portfolio figures stay on the previous snapshot until the day's update stage. */
export function visibleSnapshot(dataset: ReplayDataset, index: number, stage: ReplayStage): ReplaySnapshot | null {
  const through = stage >= 4 ? index : index - 1
  if (through < 0) return null
  return dataset.days[clampIndex(through, dataset.days.length)]
}

export function chartThroughIndex(index: number, stage: ReplayStage): number {
  return stage >= 4 ? index : index - 1
}

export function nextTradingDate(dataset: ReplayDataset, index: number): string | null {
  const next = dataset.days[index + 1]
  return next ? next.date : null
}

export function skipTarget(length: number): { index: number; stage: ReplayStage } {
  return { index: Math.max(0, length - 1), stage: 4 }
}

export function isFinale(index: number, length: number, stage: ReplayStage): boolean {
  return length > 0 && index === length - 1 && stage === 4
}

export function maxDrawdown(values: number[]): number {
  if (values.length === 0) return 0
  let peak = values[0]
  let worst = 0
  for (const value of values) {
    if (value > peak) peak = value
    const drawdown = peak === 0 ? 0 : value / peak - 1
    if (drawdown < worst) worst = drawdown
  }
  return worst
}

export function tradeCount(dataset: ReplayDataset): number {
  return dataset.days.reduce((sum, day) => sum + day.tradesExecuted.length, 0)
}

export function returnFrom(initial: number, value: number): number {
  if (initial === 0) return 0
  return value / initial - 1
}
