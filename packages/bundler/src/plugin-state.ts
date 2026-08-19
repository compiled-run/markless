// Holds one build's mutable bookkeeping: virtual modules, owners, per-transform id sets,
// execution-log sizes. Registration applies the `claim-manifest` pass verdicts here;
// which module owns a claim is decided by the pass, not by this table.
import { linkedResolverClaimVerdict, planEmittedClaimOwnership } from '@markless/compiler';
import type { createMarklessDevGraph } from './dev.ts';
import { hasExecutionLogModuleHook, requalifyExecutionLogModuleHook } from './execution-log.ts';
import { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import type {
	MarklessEnvironment,
	MarklessModuleLinkArtifact,
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';
import {
	isPrerenderWakeSourceRequest,
	isResumeSourceRequest,
	pathname,
	resolveVirtualId,
} from './virtual-ids.ts';

// The emitted-id vocabulary the claim rules ask about. Spelling a variant is the
// bundler's; deciding what a variant means for ownership is the pass's.
const CLAIM_ID_NAMING = {
	sourcePathOf: pathname,
	isResumeRequest: isResumeSourceRequest,
	isWakeRequest: isPrerenderWakeSourceRequest,
} as const;

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

// Stores what a transform emitted, feeds the development graph, and applies the
// claim ownership the `claim-manifest` pass decided. Nothing here chooses an
// owner or merges a claim.
export function registerTransformArtifacts(
	state: MarklessPluginState,
	input: {
		owner: string;
		source: string;
		manifestSource: string;
		result: TransformTsrxModuleResult;
		dev: ReturnType<typeof createMarklessDevGraph>;
		environment: MarklessEnvironment;
		finalPublication?: boolean;
		tracksSourceClaimPublication?: boolean;
		replaceOwnedArtifacts?: boolean;
		updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
	},
) {
	const ids = new Set<string>();
	const renderDataHashes = new Map<string, string>();
	for (const module of input.result.virtualModules) {
		if (input.finalPublication === false && module.type === 'resolver') continue;
		const isClientSymbol = input.environment === 'client' && module.type === 'symbol';
		// The symbol virtual module id embeds the source filename, so it is the
		// collision-free execution-log id: re-key the injected hook (dev builds)
		// and the size estimate to that same id so the join always resolves.
		const stored = isClientSymbol
			? { ...module, source: requalifyExecutionLogModuleHook(module.source, module.id) }
			: module;
		const current = state.virtualModules.get(module.id);
		if (module.type === 'resolver' && current?.type === 'resolver') {
			const verdict = linkedResolverClaimVerdict({
				resolverId: module.id,
				current: current.symbolClaims,
				next: module.symbolClaims,
			});
			if (verdict.action === 'keep-current') continue;
			if (verdict.action === 'diverged') throw new Error(verdict.diagnostic.message);
		}
		// Parallel sibling transforms share this id: canonical render data must not be replaced.
		if (
			module.type !== 'render-data' ||
			current?.type !== 'render-data' ||
			current.canonicalRenderData !== true ||
			module.canonicalRenderData === true
		) {
			state.virtualModules.set(module.id, stored);
		}
		ids.add(module.id);
		const owners = state.virtualModuleOwners.get(module.id) ?? new Set<string>();
		owners.add(input.owner);
		state.virtualModuleOwners.set(module.id, owners);
		if (module.type === 'render-data') {
			renderDataHashes.set(resolveVirtualId(module.id), renderDataHash(module.source));
		}
		if (isClientSymbol) {
			state.executionLogEstimatedSizes.set(module.id, stored.source.length);
			if (hasExecutionLogModuleHook(stored.source))
				state.executionLogEmittedIds.set(module.id, module.id);
		}
	}
	state.moduleMetadata.recordCaptureMetadata(input.source, input.result.manifest);
	if (input.finalPublication !== false) {
		recordEmittedClaimOwnership(state, {
			source: input.source,
			emittedModule: input.manifestSource,
			manifest: input.result.manifest,
			virtualModules: input.result.virtualModules,
		});
		if (input.tracksSourceClaimPublication === true) {
			state.moduleMetadata.finishSourceSymbolClaims(input.source, input.manifestSource);
		}
	}
	state.moduleLinkArtifacts.set(input.source, {
		moduleGraphInterface: input.result.moduleGraphInterface,
		interfaceHash: input.result.interfaceHash,
		moduleImports: input.result.moduleImports,
	});
	const previouslyOwned = state.transformVirtualModules.get(input.owner) ?? new Set<string>();
	if (input.replaceOwnedArtifacts === true) {
		for (const staleId of previouslyOwned) {
			if (ids.has(staleId)) continue;
			const owners = state.virtualModuleOwners.get(staleId);
			owners?.delete(input.owner);
			if (!owners || owners.size === 0) {
				state.virtualModuleOwners.delete(staleId);
				state.virtualModules.delete(staleId);
			}
		}
		state.transformVirtualModules.set(input.owner, ids);
	} else {
		state.transformVirtualModules.set(input.owner, new Set([...previouslyOwned, ...ids]));
	}
	input.dev.record(input.source, ids, input.environment);
	if (renderDataHashes.size > 0) input.updateDevPrerenderHashes?.(renderDataHashes);
}

// Applies one ownership verdict: displaced owners lose their claims, the chosen
// owner records the manifest the pass returned.
export function recordEmittedClaimOwnership(
	state: MarklessPluginState,
	input: {
		readonly source: string;
		readonly emittedModule: string;
		readonly manifest: MarklessTransformManifest;
		readonly virtualModules: ReadonlyArray<MarklessVirtualModule>;
		readonly overrideManifest?: MarklessTransformManifest;
	},
): void {
	const ownership = planEmittedClaimOwnership({
		source: input.source,
		emittedModule: input.emittedModule,
		manifest: input.manifest,
		resolverModuleId: input.virtualModules.find((module) => module.type === 'resolver')?.id,
		wakeOwnsRoutes: state.moduleMetadata.hasSymbolClaims(
			input.manifest.resolver.virtualModuleId,
		),
		claimOwners: [...state.moduleMetadata.symbolClaimMap().keys()],
		naming: CLAIM_ID_NAMING,
	});
	const contradiction = ownership.diagnostics[0];
	if (contradiction) throw new Error(contradiction.message);
	for (const displaced of ownership.displacedOwners) {
		state.moduleMetadata.deleteSymbolClaims(displaced);
	}
	state.moduleMetadata.recordSymbolClaims(
		ownership.owner,
		input.overrideManifest ?? ownership.manifest,
	);
}

function renderDataHash(source: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `mrd1-${(hash >>> 0).toString(36)}`;
}
