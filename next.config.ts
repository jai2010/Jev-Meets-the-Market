import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  outputFileTracingIncludes: {
    "/experiments/phase3": [
      "./data/processed/phase4/jev_experiment_v2.duckdb",
      "./data/processed/phase4/jev_experiment_v2.duckdb.wal",
      "./data/processed/jev_decisions.duckdb",
    ],
    "/api/audit/day": [
      "./data/processed/phase4/jev_experiment_v2.duckdb",
      "./data/processed/phase4/jev_experiment_v2.duckdb.wal",
    ],
    "/experiments/replay": [
      "./data/processed/phase4/jev_experiment_v2.duckdb",
      "./data/processed/phase4/jev_experiment_v2.duckdb.wal",
      "./data/processed/phase4/jev_experiment.duckdb",
      "./data/processed/phase4/jev_experiment.duckdb.wal",
      "./data/processed/market.duckdb",
      "./data/universe/trading_calendar.json",
      "./data/raw/ohlcv/CNX100.csv",
    ],
  },
};

export default nextConfig;
