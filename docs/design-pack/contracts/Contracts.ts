// Original application contracts; not a substitute for generated Claude types.
export type Mode = 'eco'|'balanced'|'quality'|'sports';
export type Effort = 'low'|'medium'|'high'|'xhigh'|'max'|number;
export type Task = 'general'|'coding'|'agentic_coding'|'math'|'engineering'|'finance'|'strategy'|'legal'|'healthcare'|'economics';
export type SourceFact<T> = {value:T|null;sourceUrl:string;fetchedAt:string;schemaVersion:string;variantId?:string};
export interface ModelRecord {
  runtimeId:string;provider:string;backend:string;displayName:string;
  accountAvailability:'verified'|'unknown'|'unavailable';availabilityEvidence:SourceFact<string>;
  supportedEfforts:Effort[];capabilities:SourceFact<{tools:boolean;contextTokens:number;maxOutputTokens:number;modalities:string[]}>;
  aaId:string|null;aaVariantId:string|null;benchmarkVersion:string|null;
  taskScores:Partial<Record<Task,SourceFact<number>>>;
  prices:SourceFact<{inputPerMillion:number;outputPerMillion:number;cacheReadPerMillion:number|null;cacheWrite5mPerMillion:number|null;cacheWrite1hPerMillion:number|null}>;
  benchmarkCostPerTask:SourceFact<number>;latencyMs:SourceFact<number>;
  routable:boolean;exclusions:string[];
}
export interface ControlState {
  sessionId:string;revision:number;mode:Mode;routing:'auto'|'manual_hold'|'disabled';
  creditsConsent:boolean;apiEquivalentBudgetUsd:number;
  accountBilling:'unknown'|'reported_enabled'|'reported_disabled'|'unavailable';
  holdModel:string|null;holdEffort:Effort|null;taskOverride:Task|null;
}
export type Control = {id:string;expectedRevision:number;sessionId:string} & (
  {kind:'set_mode';mode:Mode}|{kind:'set_routing';routing:'auto'|'manual_hold'}|
  {kind:'set_credit_consent';allowed:boolean;apiEquivalentBudgetUsd:number}|
  {kind:'set_task';task:Task|null});
export interface Receipt {
  id:string;sessionId:string;sequence:number;turnId:string;step:number;agentId:string|null;
  timestamp:string;controlRevision:number;mode:Mode;task:Task;risk:'normal'|'high'|'unknown';
  original:{model:string;effort?:Effort};selected:{model:string;effort?:Effort};
  apexForwarded:{model:string;effort?:Effort};responseModel:string|null;hostEffectiveEffort:Effort|null;
  status:'queued'|'streaming'|'complete'|'aborted'|'error'|'paused';reasonCodes:string[];
  snapshotHashes:string[];estimateUsd:{lower:number;upper:number;basis:string}|null;
  observedApiEquivalentUsd:number|null;actualBilledCreditsUsd:number|null;
  usage:{uncachedInput:number;cacheRead:number;cacheWrite:number;output:number}|null;
}
