import Link from "next/link"

const ITEMS = [
  { href: "/", label: "Overview", id: "overview" },
  { href: "/experiments/replay", label: "Replay", id: "replay" },
  { href: "/experiments/portfolio", label: "Portfolio", id: "portfolio" },
  { href: "/experiments/trades", label: "Trades", id: "trades" },
  { href: "/experiments/analysis", label: "Analysis", id: "analysis" },
  { href: "/experiments/phase3", label: "Audit", id: "phase3" },
] as const

export type ExperimentNavId = (typeof ITEMS)[number]["id"]

export function ExperimentNav({ active }: { active: ExperimentNavId }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 md:px-6">
      <div>
        <p className="text-[11px] tracking-[0.18em] text-[#9aa4b8]">JEV INVESTMENT LAB</p>
        <p className="text-xs text-[#c9d2e3]">Real market data. Real decisions. Historical experiment.</p>
      </div>
      <nav className="flex flex-wrap items-center justify-end gap-3 text-xs text-[#9aa4b8]">
        {ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={item.id === active ? "text-white" : "hover:text-white"}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="hidden text-right text-[10px] tracking-wide text-[#9aa4b8] lg:block">
        <p>NIFTY 100 UNIVERSE</p>
        <p>EXPERIMENTAL — NOT INVESTMENT ADVICE</p>
      </div>
    </header>
  )
}
