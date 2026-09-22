export const PROMPT_VERSION = "decision_schema_v1"
export const MODEL = "typesafe-ai/jev"
export const RUN_ID = "JEV-20260922-V1-PHASE3-TEST"
export const ACTIONS = ["BUY", "HOLD", "SELL", "NO_ACTION"] as const
export type Action = (typeof ACTIONS)[number]

/** Versioned instructions. Do not edit this text for the same experiment id. */
export const DECISION_INSTRUCTIONS = `You are making a portfolio decision using only the information contained in the supplied state.

Do not assume any future information.
Do not invent missing information.
Do not use knowledge of subsequent market movements.
Choose the action that is most justified by the supplied evidence.
BUY means initiate a position.
HOLD means maintain an existing position.
SELL means exit an existing position.
NO_ACTION means do not change the portfolio state.
Return only the requested structured decision.

BUY does not mean the stock will definitely rise. It means that, given the available evidence, taking a position is preferable to remaining out of the position.

Given only the market state and portfolio state available at this decision timestamp, what action should the portfolio take for this stock going into the next trading session?`

export const ACTION_CRITERIA: Record<Action, string> = {
  BUY: "Initiate a position.",
  HOLD: "Maintain an existing position.",
  SELL: "Exit an existing position.",
  NO_ACTION: "Do not change the portfolio state.",
}
