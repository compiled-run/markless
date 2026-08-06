// The execution log's accounting lives in exactly one place: the instrument the
// bundler emits (@markless/bundler execution-log.ts), which is the only copy any
// page runs. This module keeps the shared types that the SSR renderer and the
// inline resumer import, and nothing that would fork the arithmetic again.
export type MarklessExecutionLogMode = 'auto' | 'never' | 'always';
export { describeMarklessEventTarget } from './execution-log-target.ts';
export type MarklessExecutionEventRecord = {
	readonly hostNodeId: string;
	readonly symbolIds?: ReadonlyArray<string>;
};
export type MarklessExecutionModuleSize = {
	readonly raw: number;
	readonly gzip?: number;
	readonly chunk?: string;
	readonly estimated?: boolean;
	readonly instrument?: true;
};
export type MarklessExecutionModuleSizes = ReadonlyMap<string, MarklessExecutionModuleSize>;
export type MarklessExecutionAttribution = Readonly<
	Record<string, Readonly<Record<string, string>>>
>;

// The cumulative ledger every producer publishes into: window.__marklessExecutionLedger.
export const MARKLESS_EXECUTION_LEDGER_GLOBAL = '__marklessExecutionLedger';

export type MarklessExecutionLedgerPart = {
	readonly app: number;
	readonly framework: number;
	readonly instrument: number;
	readonly inline: number;
};

export type MarklessExecutionLedgerTurn = {
	readonly kind: string;
	readonly label?: string;
	readonly delta: { readonly app: number; readonly framework: number; readonly instrument: number };
	readonly modules: ReadonlyArray<string>;
};

export type MarklessExecutionLedger = {
	// Chunk granularity: several modules in one chunk are each charged the whole
	// chunk's raw byte length (see the U2 size-map checkpoint for why per-module
	// shipped lengths are not reachable).
	readonly unit: 'chunk-raw-bytes' | 'estimated-source-bytes';
	readonly load: MarklessExecutionLedgerPart & { readonly modules: ReadonlyArray<string> };
	readonly total: MarklessExecutionLedgerPart;
	readonly turns: ReadonlyArray<MarklessExecutionLedgerTurn>;
	readonly incomplete: null | { readonly reason: 'unmapped-id'; readonly ids: ReadonlyArray<string> };
};
