// Defines the context object every hook body receives: one build's state, the
// normalized options, the development graph, and the readers the plugin resolved
// for its environment and root.
import type { LinkedModuleChildResolution } from '@markless/compiler';
import type { BuiltPrerenderRecords } from '../build/prerender.ts';
import type { createMarklessDevGraph } from '../dev.ts';
import type { ExecutionAttributionTables } from '../execution-log.ts';
import type { MarklessPluginState } from '../plugin-state.ts';
import type {
	MarklessEnvironment,
	MarklessRolldownOptions,
	MarklessTransformManifest,
} from '../types.ts';

export type Environment = MarklessEnvironment | ((context: unknown) => MarklessEnvironment);

export type InternalMarklessRolldownOptions = MarklessRolldownOptions & {
	emitResumeModules?: boolean;
	inlineResumerDebug?: boolean;
	prerender?: boolean;
	productionResumeModuleUrls?: Map<string, string>;
	productionPrerenderWakeModuleUrls?: Map<string, string>;
	// Created here, not by the host: the settle chunk exists only for pages the
	// client build actually emitted one for, and the server prerender pass reads
	// the same options object back.
	productionSettleModuleUrls?: Map<string, string>;
	prerenderWakeChannel?: boolean;
	publicPath?: (fileName: string) => string;
	updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
};

export type MarklessHookContext = {
	readonly state: MarklessPluginState;
	readonly internalOptions: InternalMarklessRolldownOptions;
	readonly dev: ReturnType<typeof createMarklessDevGraph>;
	// The configured environment, read only where a call arrives without one.
	readonly environment: Environment;
	// Every entry is written by the link driver, so the linked-child fields are
	// present even though the shared state map is typed by its narrower shape.
	readonly linkedChildren: Map<string, LinkedModuleChildResolution>;
	readonly prerenderRecordsBySource?: ReadonlyMap<string, BuiltPrerenderRecords>;
	getEnvironment(context: unknown): MarklessEnvironment;
	getRoot(): string | undefined;
	attributionTables(manifests: Iterable<MarklessTransformManifest>): ExecutionAttributionTables;
};
