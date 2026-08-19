// Holds one build's mutable bookkeeping: virtual modules, owners, per-transform id sets,
// execution-log sizes.
import { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import type {
	MarklessModuleLinkArtifact,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';

export type ImportedChild = {
	readonly parent: string;
	readonly specifier: string;
	readonly source: string;
	readonly componentEdgeId?: string;
};

export type LinkedTransformCacheEntry = {
	readonly source: string;
	readonly manifestSource: string;
	readonly code: string;
	readonly importedInterfaceHashes: string;
	readonly importedSymbolClaims: string;
	readonly input: TransformTsrxModuleInput;
	readonly result: TransformTsrxModuleResult;
	readonly linkedChildHasBrowserTriggers: boolean;
};

export type MarklessPluginState = ReturnType<typeof createPluginState>;

export function createPluginState() {
	const virtualModules = new Map<string, MarklessVirtualModule>();
	const moduleMetadata = new ModuleMetadataRegistry();
	const prerenderWakeCapabilities = new Map<string, boolean>();
	const moduleLinkArtifacts = new Map<string, MarklessModuleLinkArtifact>();
	const linkedTransformCache = new Map<string, LinkedTransformCacheEntry>();
	const importedChildren = new Map<string, ImportedChild>();
	const importedChildSources = new Set<string>();
	const emittedClientResolverSources = new Set<string>();
	const transformVirtualModules = new Map<string, Set<string>>();
	const virtualModuleOwners = new Map<string, Set<string>>();
	const clientSymbolEntrySources = new Set<string>();
	const prerenderWakeSources = new Set<string>();
	const clientRouteArtifactSources = new Set<string>();
	const clientRouteArtifactMaterializations = new Map<
		string,
		NonNullable<TransformTsrxModuleInput['artifactChildMaterializations']>
	>();
	const transformedClientPrimarySources = new Set<string>();
	const executionLogEstimatedSizes = new Map<string, number>();
	// Every id this build injects a hook for, keyed to the module it was injected
	// into: the size map owes an entry to each one the bundle actually carries.
	const executionLogEmittedIds = new Map<string, string>();
	// Only an owner's transform registers its generated modules, and Vite reuses a
	// soft-invalidated owner's cached result, so a fetch can miss with nothing left to
	// re-register it; without regenerating here Vite reads the id off disk as a filename.
	const regeneratingVirtualModules = new Set<string>();
	// An edit clears the child's capture metadata, and Vite can answer its re-request from cache.
	const recoveringChildMetadata = new Set<string>();

	return {
		virtualModules,
		moduleMetadata,
		prerenderWakeCapabilities,
		moduleLinkArtifacts,
		linkedTransformCache,
		importedChildren,
		importedChildSources,
		emittedClientResolverSources,
		transformVirtualModules,
		virtualModuleOwners,
		clientSymbolEntrySources,
		prerenderWakeSources,
		clientRouteArtifactSources,
		clientRouteArtifactMaterializations,
		transformedClientPrimarySources,
		executionLogEstimatedSizes,
		executionLogEmittedIds,
		regeneratingVirtualModules,
		recoveringChildMetadata,
		// Clears exactly what buildStart cleared inline; prerenderWakeCapabilities and the
		// two in-flight re-entry guards were never part of that reset and stay untouched.
		reset() {
			clientSymbolEntrySources.clear();
			clientRouteArtifactSources.clear();
			clientRouteArtifactMaterializations.clear();
			transformedClientPrimarySources.clear();
			virtualModules.clear();
			moduleMetadata.clear();
			moduleLinkArtifacts.clear();
			linkedTransformCache.clear();
			importedChildren.clear();
			importedChildSources.clear();
			emittedClientResolverSources.clear();
			transformVirtualModules.clear();
			virtualModuleOwners.clear();
			executionLogEstimatedSizes.clear();
			executionLogEmittedIds.clear();
		},
	};
}
