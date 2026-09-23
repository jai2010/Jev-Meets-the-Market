# Jev Meets the Market

### An experiment in using Jev for sequential investment decisions

[**Try the experiment →**](https://jevstock.vercel.app/)

[**View the source →**](https://github.com/jai2010/Jev-Meets-the-Market)

---

## The experiment

Everyone seems to be building something with Jev.

So here's mine.

I wanted to see what happens when you put **Jev, a probabilistic decision model, into a domain as complex and uncertain as investing.**

I'm not particularly good with stocks. That's actually what made this interesting to me.

The question wasn't:

> Can Jev predict which stock will go up?

It was:

> **Can Jev actually make useful investment decisions when it has to make a sequence of decisions and live with the consequences of those decisions?**

So I gave Jev **₹10 lakh** and the **NIFTY 100** universe and let it run.

---

## Watch the experiment

[**▶ Watch the Jev experiment recording**](https://github.com/user-attachments/assets/79b6de38-3aeb-485c-9eae-dace14724fd7)

---

## How it works

At the end of each trading day, Jev evaluates eligible stocks and makes one of four decisions:

- **BUY** — initiate a position
- **HOLD** — maintain the current position
- **SELL** — exit an existing position
- **NO_ACTION** — do nothing

The decision is executed at the **next trading session's opening price**.

The portfolio has a few simple constraints:

- Maximum 5 holdings
- Maximum 20% allocation to any one position
- No leverage
- No short selling

Transaction costs and slippage are included in the simulation.

---

## The result

The result was pretty interesting.

| | Jev | NIFTY 100 |
|---|---:|---:|
| Starting capital | ₹10,00,000 | ₹10,00,000 |
| Ending value | **₹11,22,525** | ₹10,11,109 |
| Return | **+12.25%** | +1.11% |
| Max drawdown | **-3.65%** | — |
| Trading sessions | 118 | 118 |

Jev finished the experiment at **₹11.23 lakh**, compared with **₹10.11 lakh** for a NIFTY 100 buy-and-hold portfolio.

I was genuinely surprised by the result.

Not because I think six months of results proves that Jev can beat the market. It doesn't.

The sample is too short, there are known data limitations, and the experiment has survivorship bias.

What surprised me was the **possibility**.

Could a general-purpose decision model actually make useful decisions in a domain as messy as investing?

That made me want to go much deeper into the decisions themselves.

---

## What I'm really interested in

The return is actually not the part I'm most interested in.

I want to understand:

- Why did Jev buy a particular stock?
- Why did it ignore another?
- Why did it sell when it did?
- How confident was it?
- Which signals appear to influence its decisions?
- What happened after each decision?
- Was the reasoning actually useful, or did the outcome simply happen to work this time?

Every decision is recorded, so the experiment can be replayed and inspected.

The goal is to understand not just **what Jev did**, but **how it behaves as a decision-maker**.

---

## The decision loop

The experiment is essentially:

```text
Market data
     ↓
Point-in-time features
     ↓
Jev evaluates the stock
     ↓
BUY / HOLD / SELL / NO_ACTION
     ↓
Portfolio constraints
     ↓
Next-day execution
     ↓
Portfolio valuation
     ↓
Repeat
```

The important part is that each decision is made using information that was available **at that point in time**.

The subsequent market outcome is not available when the decision is made.

---

## Recording the experiment

The experiment records the decisions rather than just the final portfolio value.

That includes:

- Decision date
- Stock
- Decision
- Decision probability
- Portfolio state
- Execution
- Position changes
- Portfolio value
- Benchmark value

This makes it possible to replay the experiment and inspect the decision history.

---

## What this is — and isn't

This is an experiment in **AI decision-making**.

It is not:

- A live trading system
- Financial advice
- A production trading strategy
- An automated brokerage system
- Proof that Jev can predict markets
- Proof that Jev can outperform the market
- A claim about future investment returns

I also do **not** claim that this prototype is scalable to real-time trading.

The interesting question for me is whether a probabilistic decision model can operate meaningfully inside a complex decision loop.

---

## Limitations

### Short evaluation period

The experiment covers only **118 trading sessions**.

That's nowhere near enough to establish long-term investment performance.

### Survivorship bias

The experiment uses the current NIFTY 100 universe applied backward across the historical period.

This introduces survivorship bias.

### Market data

The experiment uses Yahoo Finance daily market data for this prototype.

Yahoo Finance is convenient for experimentation but is not treated as an authoritative market-data source.

There are also known data-quality anomalies in the dataset that are documented in the experiment results.

### No automated trading

Nothing here connects to a brokerage account or executes real trades.

This is a historical decision experiment and replay system.

---

## Why I built this

There are plenty of AI systems that can generate an answer.

I'm increasingly interested in systems that **make decisions**.

A decision has:

- a state
- constraints
- an action
- uncertainty
- consequences
- an outcome

That creates a feedback loop:

**Observe → Decide → Act → Evaluate**

Can Jev operate meaningfully inside that loop?

That's what **Can Jev Invest?** is trying to explore.

---

## What's next?

The next phase is less about the portfolio return and more about the behaviour of the decision model.

I'm looking at:

- Decision patterns
- Confidence vs. outcomes
- BUY decisions and subsequent returns
- SELL decisions
- Portfolio construction
- Decision consistency
- Behaviour across different market conditions

The goal is to understand whether there is something interesting underneath the result — or whether I simply got an interesting six-month outcome.

---

## Run it yourself

```bash
git clone https://github.com/jai2010/Jev-Meets-the-Market.git
cd Jev-Meets-the-Market

npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

---

## Stack

- **Jev** — probabilistic decision model
- **Next.js**
- **TypeScript**
- **DuckDB**
- **Yahoo Finance** — experimental market data
- **Vercel AI Gateway**

---

## Experiment details

**Experiment:** Can Jev Invest?

**Capital:** ₹10,00,000

**Universe:** NIFTY 100

**Period:** March 10, 2026 → August 31, 2026

**Trading sessions:** 118

**Maximum holdings:** 5

**Maximum position size:** 20%

**Execution:** Next trading session open

**Benchmark:** NIFTY 100 buy-and-hold

---

## Disclaimer

This is an experimental software project and **not financial advice**.

The results should not be interpreted as evidence of future investment performance or as a recommendation to buy or sell any security.

The experiment is intended to explore AI decision-making, not to provide an investable trading strategy.

---

## Links

🌐 **[Run the experiment](https://jevstock.vercel.app/)**

💻 **[GitHub repository](https://github.com/jai2010/Jev-Meets-the-Market)**

---

**Can Jev invest?**

That's what I'm trying to find out.
