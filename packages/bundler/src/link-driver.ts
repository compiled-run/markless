// Performs the I/O the `module-link` and `delegate-children` compiler passes
// may not: resolves specifiers, forces child loads, awaits sealing, imports a
// delegate's compiled JavaScript, then calls the passes. Nothing here decides
// what a child is or what it contributes; those verdicts belong to
// `@markless/compiler`, whose passes have no resolve, no load and no import.
import { existsSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	type ArtifactChildMaterialization,
	type CaptureAnalysisArtifact,
	type LinkedArtifactChild,
	type LinkedModuleChildResolution,
	type LinkedClaimsArtifact,
	type LinkedModuleGraphArtifact,
	type ModuleLinkRequest,
	type ModuleLinkResolutionTable,
	delegateChildRenderPlan,
	delegateChildRendering,
	delegateChildResolutionRequests,
	linkClaimManifests,
	linkDelegateChildren,
	linkImportedModules,
	linkedModuleImportRequests,
	linkedModuleClaimPlan,
	linkedModuleLoadSource,
	linkedSymbolRouteRequests,
	moduleLinkResolutionKey,
	planDelegateChildren,
	planLinkedModuleChildren,
	uniqueLinkedModuleChildren,
} from '@markless/compiler';
import { withQuery } from 'ufo';
import type { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import { MARKLESS_VIRTUAL_PREFIX } from './transform.ts';
import type {
	MarklessEnvironment,
	MarklessModuleLinkArtifact,
	MarklessRolldownOptions,
	MarklessTransformManifest,
} from './types.ts';
import { pathname } from './virtual-ids.ts';

type ResolvedImport = { readonly id: string; readonly external?: unknown } | string | null;

export type LinkResolveContext = {
	resolve(
		source: string,
		importer?: string,
		options?: { readonly skipSelf?: boolean },
	): Promise<ResolvedImport>;
};

export type LinkLoadContext = {
	load?: (input: { readonly id: string }) => Promise<unknown> | unknown;
	getModuleInfo?: (id: string) => unknown;
};

export type LinkForceOptions = Pick<
	MarklessRolldownOptions & { prerenderWakeChannel?: boolean },
	'dev' | 'devServer' | 'prerenderWakeChannel'
>;

export type LinkGraphReaders = {
	readonly moduleArtifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>;
	readonly metadata: ModuleMetadataRegistry;
	// A parent mid-transform is not in the registry yet, so its own manifest
	// answers for it.
	readonly parentManifest?: Pick<MarklessTransformManifest, 'captureMetadata'>;
	// Set only while linking render data reached from a materialized route root.
	// The pass records the `(root, source)` reach; the id that transports it is
	// still minted here.
	readonly renderDataReachRoot?: string;
	readonly reachedRenderDataSource?: (source: string, root: string) => string;
};

// The symbols-only route of a source: the module id a parent's resolver reaches
// a child's symbols through. Virtual module naming is the bundler's.
export function symbolRouteSource(source: string): string {
	return withQuery(source, { 'markless-symbols': null });
}

// The resolver every emitted sibling of a source must share. Virtual module
// naming is the bundler's, so the id is spelled here and handed to the pass.
function resolverVirtualModuleId(source: string): string {
	return `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodeURIComponent(source)}`;
}

// Runs the `claim-manifest` pass over the registry once the barrier says every
// requested source has finished publishing. Waiting is the driver's; deciding
// who owns what is the pass's.
export function linkedClaims(
	metadata: ModuleMetadataRegistry,
	sources: ReadonlyArray<string>,
): LinkedClaimsArtifact<MarklessTransformManifest> {
	for (const source of sources) metadata.assertSourceClaimsSealed(source);
	return linkClaimManifests({
		byEmittedModule: metadata.symbolClaimMap(),
		sources: sources.map((source) => ({
			source,
			resolverId: resolverVirtualModuleId(source),
		})),
	});
}

export function sourceSymbolManifest(
	metadata: ModuleMetadataRegistry,
	source: string,
): MarklessTransformManifest | undefined {
	const artifact = linkedClaims(metadata, [source]);
	const contradiction = artifact.diagnostics[0];
	if (contradiction) throw new Error(contradiction.message);
	return artifact.bySource[source];
}

async function resolveModuleLinkRequests(
	context: LinkResolveContext,
	requests: ReadonlyArray<ModuleLinkRequest>,
	fallbackSource: (parent: string, specifier: string) => string,
): Promise<ModuleLinkResolutionTable> {
	const entries = await Promise.all(
		requests.map(async (request) => {
			const resolved = await context.resolve(request.specifier, request.parent, {
				skipSelf: true,
			});
			const id =
				typeof resolved === 'string'
					? resolved
					: resolved && 'id' in resolved
						? String(resolved.id)
						: undefined;
			return [
				moduleLinkResolutionKey(request.specifier, request.parent),
				id === undefined
					? {
							id: pathname(fallbackSource(request.parent, request.specifier)),
							external: false,
							kind: 'fallback' as const,
						}
					: {
							id: pathname(id),
							external:
								typeof resolved === 'object' && resolved !== null
									? Boolean(resolved.external)
									: false,
							kind: 'resolved' as const,
						},
			] as const;
		}),
	);
	return Object.fromEntries(entries);
}

export async function resolveImportedModuleInterfaces(
	context: LinkResolveContext,
	parent: string,
	moduleImports: ReadonlyArray<{ readonly source: string }>,
	fallbackSource: (parent: string, specifier: string) => string,
): Promise<LinkedModuleChildResolution[]> {
	const requests = linkedModuleImportRequests(parent, moduleImports);
	return planLinkedModuleChildren(
		requests,
		await resolveModuleLinkRequests(context, requests, fallbackSource),
	);
}

export async function resolveImportedChildren(
	context: LinkResolveContext,
	parent: string,
	manifest: Pick<MarklessTransformManifest, 'symbolRoutes'>,
	fallbackSource: (parent: string, specifier: string) => string,
): Promise<LinkedModuleChildResolution[]> {
	const requests = linkedSymbolRouteRequests(parent, manifest.symbolRoutes);
	return planLinkedModuleChildren(
		requests,
		await resolveModuleLinkRequests(context, requests, fallbackSource),
	);
}

// Loads every child the pass says still needs one, publishes the claim sources
// it named, and awaits sealing. An externalized child yields no load source, so
// a bare external id can never reach `this.load`.
export async function forceImportedModules(
	context: LinkLoadContext,
	children: ReadonlyArray<LinkedModuleChildResolution>,
	moduleArtifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
	metadata: ModuleMetadataRegistry,
	options: LinkForceOptions,
	environment: MarklessEnvironment,
): Promise<void> {
	for (const child of children) {
		const loadSource = linkedModuleLoadSource(child, moduleArtifacts.has(child.source));
		if (loadSource !== undefined) {
			if (options.dev === true) {
				await options.devServer?.transformRequest(loadSource, environment);
			} else if (typeof context.load === 'function') {
				await context.load({ id: loadSource });
			}
		}
		// Read the child's metadata only once it has been forced: the claim plan
		// is a fact about the loaded module, not about the request for it.
		const plan = linkedModuleClaimPlan({
			child,
			captureMetadata: metadata.captureMetadataForSource(child.source),
			clientEnvironment: environment === 'client',
			completeWakeVariants: options.prerenderWakeChannel === true,
			symbolRouteSource,
			resumeSource: (source) => withQuery(source, { 'markless-resume': null }),
			wakeSource: (source) => withQuery(source, { 'markless-prerender-wake': null }),
		});
		if (plan.expectClaims && typeof context.getModuleInfo === 'function') {
			metadata.expectSourceSymbolClaims(child.source, plan.claimSources);
		}
		if (plan.claimSources.length > 0) {
			if (options.dev === true) {
				await Promise.all(
					plan.claimSources.map((source) =>
						options.devServer?.transformRequest(source, environment),
					),
				);
			} else if (typeof context.load === 'function') {
				await Promise.all(plan.claimSources.map((id) => context.load?.({ id })));
			}
		}
		if (plan.seal) await metadata.sealSourceSymbolClaims(child.source);
	}
}

export function mergeLinkedModuleChildren(
	...sets: ReadonlyArray<ReadonlyArray<LinkedModuleChildResolution>>
): LinkedModuleChildResolution[] {
	return uniqueLinkedModuleChildren(sets.flat());
}

// The pass call itself: readers are bound here so the pass never touches the
// bundler's registry, its virtual module names, or a plugin context.
export function linkModuleGraph(
	children: ReadonlyArray<LinkedModuleChildResolution>,
	readers: LinkGraphReaders,
): LinkedModuleGraphArtifact {
	return linkImportedModules({
		children,
		moduleArtifacts: readers.moduleArtifacts,
		captureMetadataForSource: (source) => readers.metadata.captureMetadataForSource(source),
		parentCaptureMetadataForSource: (parent) => parentCaptureMetadata(parent, readers),
		symbolRouteSource,
		...(readers.renderDataReachRoot !== undefined && readers.reachedRenderDataSource
			? {
					renderDataReachRoot: readers.renderDataReachRoot,
					reachedRenderDataSource: readers.reachedRenderDataSource,
				}
			: {}),
	});
}

function parentCaptureMetadata(
	parent: string,
	readers: LinkGraphReaders,
): CaptureAnalysisArtifact | undefined {
	return (
		readers.parentManifest?.captureMetadata ??
		readers.metadata.captureMetadataForSource(pathname(parent))
	);
}

// Whether the bundler considers this id an entry module. Reading a plugin
// context is bundler I/O; what an entry may compose is the pass's verdict.
export function moduleIsEntry(
	context: { getModuleInfo?(id: string): { readonly isEntry?: boolean } | null },
	id: string,
): boolean {
	try {
		return context.getModuleInfo?.(id)?.isEntry === true;
	} catch {
		// Unknown entry posture cannot authorize page-root materialization.
		return false;
	}
}

// Performs the I/O the `delegate-children` pass may not: resolves each edge,
// imports the dependency's compiled JavaScript, and calls its `renderSsr`. The
// build-time `import()` of a dependency's dist is pre-existing; it is the one
// place a linker executes code the compiler did not produce, which is exactly
// why it lives here and not in the pass.
export async function materializeDelegateChildren(
	context: LinkResolveContext,
	parent: string,
	candidates: ReadonlyArray<LinkedArtifactChild>,
): Promise<Record<string, ArtifactChildMaterialization>> {
	const resolution: Record<string, string> = {};
	for (const candidate of delegateChildResolutionRequests(candidates)) {
		const resolved = await context.resolve(candidate.importSource, parent, { skipSelf: true });
		const id = typeof resolved === 'string' ? resolved : resolved?.id;
		if (id) resolution[candidate.edgeId] = pathname(id);
	}
	const children = planDelegateChildren(candidates, resolution);
	const byEdge = new Map(candidates.map((candidate) => [candidate.edgeId, candidate]));
	const loaded = new Map<string, Record<string, unknown>>();
	const renderings: Record<string, ArtifactChildMaterialization> = {};
	for (const child of children) {
		const candidate = byEdge.get(child.edgeId);
		const source = child.source;
		if (!child.loadable || !candidate || source === undefined) continue;
		if (!isAbsolute(source) || !existsSync(source) || !statSync(source).isFile()) continue;
		let module = loaded.get(source);
		if (!module) {
			module = (await import(pathToFileURL(source).href)) as Record<string, unknown>;
			loaded.set(source, module);
		}
		const component =
			candidate.importKind === 'default'
				? module.default
				: candidate.importKind === 'namespace'
					? module
					: module[candidate.importedName ?? candidate.componentName];
		const renderSsr = (component as { readonly renderSsr?: unknown } | undefined)?.renderSsr;
		if (typeof renderSsr !== 'function') continue;
		const plan = delegateChildRenderPlan(candidate);
		if (!plan.ok) throw new Error(plan.diagnostic.message);
		const rendering = delegateChildRendering(
			candidate,
			await renderSsr.call(component, plan.props),
		);
		if (!rendering.ok) throw new Error(rendering.diagnostic.message);
		renderings[child.edgeId] = rendering.rendering;
	}
	return linkDelegateChildren({ children, renderings }).materializations;
}
