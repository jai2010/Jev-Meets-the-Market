/** Frozen session constraints shown on Overview and Replay. */
export const TRADING_SESSION_RULES: string[] = [
  "Initial capital ₹10,00,000",
  "Universe: current NIFTY 100",
  "Maximum 5 open positions",
  "Maximum 20% purchase notional per new position",
  "No leverage",
  "No shorting",
  "Decide at session EOD",
  "Execute at next trading session OPEN",
  "Sell existing positions before new buys",
  "BUY candidates ranked by chosen-action probability (ticker tie-break)",
  "BUY on an already-held name does not add shares",
  "HOLD on a held name maintains the position",
  "SELL exits the entire held position",
  "HOLD or SELL on an unheld name is no action",
  "NO_ACTION leaves the book unchanged",
  "A position slot frees only after a SELL actually executes",
  "Transaction cost 10 bps; slippage 5 bps",
  "Portfolio marked at CLOSE",
  "Benchmark: NIFTY 100 buy-and-hold",
]

export function TradingRulesList({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={compact ? "space-y-1.5 text-[11px] leading-4 text-[#c9d2e3]" : "space-y-2 text-sm leading-5 text-[#c9d2e3]"}>
      {TRADING_SESSION_RULES.map((rule) => (
        <li key={rule} className="flex gap-2">
          <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-[#7eb6ff]" />
          <span>{rule}</span>
        </li>
      ))}
    </ul>
  )
}
