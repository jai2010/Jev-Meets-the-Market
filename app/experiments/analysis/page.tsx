import { connection } from "next/server"
import { loadReplayDataset } from "@/src/replay/load"
import { AnalysisView } from "./analysis-view"

export default async function AnalysisPage() {
  await connection()
  const dataset = await loadReplayDataset()
  return <AnalysisView dataset={dataset} />
}
