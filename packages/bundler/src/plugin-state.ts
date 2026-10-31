// Holds one build's mutable bookkeeping: virtual modules, owners, per-transform id sets,
// execution-log sizes. Registration applies the `claim-manifest` pass verdicts here;
// which module owns a claim is decided by the pass, not by this table.
import {
	linkedResolverClaimVerdict,
	planEmittedClaimOwnership,
	renderDataContentHash,
} from '@markless/compiler';
import type { LinkedModuleChildResolution } from '@markless/compiler';
import type { createMarklessDevGraph } from './dev.ts';
import { createBuildDelegateLoader } from './build/delegate-loader.ts';
import {
	createDelegateModuleCache,
	moduleLinkArtifact,
	publishModuleLinkArtifact,
} from './link-driver.ts';
import { hasExecutionLogModuleHook, requalifyExecutionLogModuleHook } from './execution-log.ts';
import { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import { symbolExecutionLogId } from './module-id.ts';
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
	readonly resolvedChildren: ReadonlyArray<LinkedModuleChildResolution>;
	readonly linkedStyleModuleIds: ReadonlyArray<string>;
};

export type MarklessPluginState = ReturnType<typeof createPluginState>;

export function createPluginState() {
	const virtualModules = new Map<string, MarklessVirtualModule>();
	const moduleMetadata = new ModuleMetadataRegistry();
	const prerenderWakeCapabilities = new Map<string, boolean>();
	// Per environment: whether a source is linked is a fact about this environment's compile of it.
	const moduleLinkArtifactsByEnvironment = new Map<
		MarklessEnvironment,
		Map<string, MarklessModuleLinkArtifact>
	>();
	const moduleLinkArtifacts = (environment: MarklessEnvironment) => {
		const existing = moduleLinkArtifactsByEnvironment.get(environment);
		if (existing) return existing;
		const created = new Map<string, MarklessModuleLinkArtifact>();
		moduleLinkArtifactsByEnvironment.set(environment, created);
		return created;
	};
	const linkedTransformCache = new Map<string, LinkedTransformCacheEntry>();
	const importedChildren = new Map<string, ImportedChild>();
	const importedChildSources = new Set<string>();
	const emittedClientResolverSources = new Set<string>();
	const transformVirtualModules = new Map<string, Set<string>>();
	// Source -> the scoped-style module ids of the source and every linked child under it.
	const styleClosures = new Map<string, ReadonlySet<string>>();
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
	const regeneratingVirtualModules = new Map<string, Promise<void>>();
	// An edit clears the child's capture metadata, and Vite can answer its re-request from cache.
	const recoveringChildMetadata = new Set<string>();
	const delegateModules = createDelegateModuleCache();
	const buildDelegateLoader = createBuildDelegateLoader();

	return {
		delegateModules,
		buildDelegateLoader,
		virtualModules,
		moduleMetadata,
		prerenderWakeCapabilities,
		moduleLinkArtifacts,
		moduleLinkArtifactsByEnvironment,
		linkedTransformCache,
		importedChildren,
		importedChildSources,
		emittedClientResolverSources,
		transformVirtualModules,
		styleClosures,
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
			delegateModules.clear();
			buildDelegateLoader.clear();
			clientSymbolEntrySources.clear();
			clientRouteArtifactSources.clear();
			clientRouteArtifactMaterializations.clear();
			transformedClientPrimarySources.clear();
			virtualModules.clear();
			moduleMetadata.clear();
			moduleLinkArtifactsByEnvironment.clear();
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
		recordSymbolClaims?: boolean;
		root?: string;
		tracksSourceClaimPublication?: boolean;
		replaceOwnedArtifacts?: boolean;
		// A dev server's edit compiles a first pass that must replace the stale final artifact.
		devServer?: boolean;
		// The request whose final compile replaces this first pass.
		request?: string;
		updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
	},
) {
	const ids = new Set<string>();
	const renderDataHashes = new Map<string, string>();
	for (const module of input.result.virtualModules) {
		const isClientSymbol = input.environment === 'client' && module.type === 'symbol';
		const logId = isClientSymbol ? symbolExecutionLogId(module.id, input.root) : module.id;
		const stored = {
			...module,
			...(isClientSymbol
				? { source: requalifyExecutionLogModuleHook(module.source, logId) }
				: {}),
			...(input.finalPublication === false &&
			(module.type === 'resolver' ||
				module.type === 'symbol' ||
				((module.type === 'render-data' || module.type === 'render-data-served') &&
					input.devServer !== true))
				? { provisional: true }
				: {}),
		};
		const published = publishesVirtualModule(stored, state.virtualModules.get(module.id));
		if (published) {
			state.virtualModules.set(module.id, stored);
		}
		ids.add(module.id);
		const owners = state.virtualModuleOwners.get(module.id) ?? new Set<string>();
		owners.add(input.owner);
		state.virtualModuleOwners.set(module.id, owners);
		if (module.type === 'render-data') {
			// The `render-data-module` pass's own hash, so the dev prerender feed and a published component agree.
			renderDataHashes.set(resolveVirtualId(module.id), renderDataContentHash(module.source));
		}
		if (isClientSymbol && published) {
			state.executionLogEstimatedSizes.set(logId, stored.source.length);
			if (hasExecutionLogModuleHook(stored.source))
				state.executionLogEmittedIds.set(logId, module.id);
		}
	}
	state.moduleMetadata.recordCaptureMetadata(input.source, input.result.manifest, {
		provisional: input.finalPublication === false && input.devServer !== true,
	});
	if (input.finalPublication !== false && input.recordSymbolClaims !== false) {
		recordEmittedClaimOwnership(state, {
			source: input.source,
			emittedModule: input.manifestSource,
			manifest: input.result.manifest,
			virtualModules: input.result.virtualModules,
		});
		if (input.tracksSourceClaimPublication === true) {
			state.moduleMetadata.finishSourceSymbolClaims(
				input.environment,
				input.source,
				input.manifestSource,
			);
		}
	}
	publishModuleLinkArtifact(
		state.moduleLinkArtifacts(input.environment),
		input.source,
		moduleLinkArtifact(input.result),
		{
			provisionalUntil: input.finalPublication === false ? input.request : undefined,
			dev: input.devServer === true,
		},
	);
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

// First-pass ids must resolve during linking, but cannot replace finalized code.
function publishesVirtualModule(
	next: MarklessVirtualModule,
	current: MarklessVirtualModule | undefined,
): boolean {
	if (!current) return true;
	if (next.provisional === true) return false;
	if (current.provisional === true) return true;
	if (next.type === 'resolver' && current.type === 'resolver') {
		const verdict = linkedResolverClaimVerdict({
			resolverId: next.id,
			current: current.symbolClaims,
			next: next.symbolClaims,
		});
		if (verdict.action === 'diverged') throw new Error(verdict.diagnostic.message);
		return verdict.action === 'replace';
	}
	// Parallel sibling transforms share this id: canonical render data must not be replaced.
	return !(
		(next.type === 'render-data' || next.type === 'render-data-served') &&
		current.type === next.type &&
		current.canonicalRenderData === true &&
		next.canonicalRenderData !== true
	);
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

// Id bookkeeping for the scoped-style modules a render-data module links: they
// are registered under the same owner so a rebuild retires them with it, and
// recorded against their source for the development graph. Which styles a
// render-data module links is the `render-data-module` pass's answer.
export function registerRenderDataStyles(
	state: MarklessPluginState,
	input: {
		readonly owner: string;
		readonly source: string;
		readonly modules: ReadonlyArray<MarklessVirtualModule>;
		readonly dev: ReturnType<typeof createMarklessDevGraph>;
	},
) {
	if (input.modules.length === 0) return;
	const ids = new Set(state.transformVirtualModules.get(input.owner) ?? []);
	for (const module of input.modules) {
		state.virtualModules.set(module.id, module);
		ids.add(module.id);
		const owners = state.virtualModuleOwners.get(module.id) ?? new Set<string>();
		owners.add(input.owner);
		state.virtualModuleOwners.set(module.id, owners);
	}
	state.transformVirtualModules.set(input.owner, ids);
	input.dev.record(
		input.source,
		input.modules.map((module) => module.id),
		'client',
	);
}
