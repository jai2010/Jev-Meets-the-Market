import { fileURLToPath } from "node:url"
import { buildFeatures } from "../src/features/build"

async function main() {
  const result = await buildFeatures(fileURLToPath(new URL("..", import.meta.url)))
  console.log(
    `features rows=${result.summary.feature_rows} ready=${result.summary.decision_ready_rows} first=${result.summary.first_decision_ready_date} validation=${result.summary.validation}`,
  )
  if (result.violations.length > 0) {
    console.error(`validation failed with ${result.violations.length} violation(s)`)
    process.exit(1)
  }
}

main()
