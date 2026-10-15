// Typed command/error/result contracts (2.0). Every mutation carries a CommandId,
// expected DealVersion, and correlation IDs end-to-end.
export type CommandId = string; // UUID v4, client- or server-generated, replay-safe
export type DealVersion = number; // optimistic concurrency on deals.version
export type LotRef = string; // supplier lot UUID (never merged by name)
export type PolicyVersion = string; // e.g. "v1"
export type DecisionId = string; // agent_runs.id
export interface Money { minor: number; currency: "EGP" | "USD"; }

export interface Command<T> { commandId: CommandId; dealId: string; expectedDealVersion: DealVersion; payload: T; }
export interface CommandResult<R> { commandId: CommandId; replayed: boolean; result: R; }
