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
	type CompilerDiagnostic,
	type DelegateImportFailure,
	type LinkedArtifactChild,
	type LinkedInterfaceClaim,
	type LinkedInterfaceImport,
	type LinkedModuleChildResolution,
	type LinkedClaimsArtifact,
	type LinkedModuleGraphArtifact,
	type ModuleLinkRequest,
	type ModuleLinkResolutionTable,
	computeLinkedInterfaces,
	delegateChildRenderPlan,
	delegateChildRendering,
	delegateChildResolutionRequests,
	linkClaimManifests,
	linkDelegateChildren,
	linkImportedModules,
	linkedModuleChildDiagnostics,
	linkedModuleImportRequests,
	linkedModuleClaimPlan,
	linkedModuleLoadSource,
	linkedSymbolRouteRequests,
	moduleLinkResolutionKey,
	planDelegateChildren,
	planLinkedModuleChildren,
	uniqueLinkedModuleChildren,
} from '@markless/compiler';
import { dirname, resolve } from 'pathe';
import { withQuery } from 'ufo';
import type { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import { MARKLESS_VIRTUAL_PREFIX } from './transform.ts';
import type {
	MarklessEnvironment,
	MarklessModuleLinkArtifact,
	MarklessRolldownOptions,
	MarklessTransformManifest,
} from './types.ts';
import { isRelativeImport, pathname } from './virtual-ids.ts';

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

// What the linker materialized, plus every delegate whose `import()` rejected:
// the failure keeps the source and the original error the pass cannot observe,
// and the pass's own diagnostics travel with them so a caller can report them.
export type DelegateChildMaterializationResult = {
	readonly materializations: Readonly<Record<string, ArtifactChildMaterialization>>;
	readonly importFailures: ReadonlyArray<DelegateImportFailure>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

export type DelegateWarnContext = { warn?: (message: string) => void };

// Reports the delegates whose `import()` rejected as build warnings. The pass
// owns the message; the module still skips, so this never fails the build.
export function warnDelegateImportFailures(
	pluginContext: DelegateWarnContext,
	result: Pick<DelegateChildMaterializationResult, 'diagnostics' | 'importFailures'>,
): void {
	if (typeof pluginContext.warn !== 'function' || result.importFailures.length === 0) return;
	const failed = new Set(result.importFailures.map((failure) => failure.source));
	for (const diagnostic of result.diagnostics) {
		if (diagnostic.source !== undefined && failed.has(diagnostic.source)) {
			pluginContext.warn(diagnostic.message);
		}
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
): Promise<DelegateChildMaterializationResult> {
	const resolution: Record<string, string> = {};
	for (const candidate of delegateChildResolutionRequests(candidates)) {
		const resolved = await context.resolve(candidate.importSource, parent, { skipSelf: true });
		const id = typeof resolved === 'string' ? resolved : resolved?.id;
		if (id) resolution[candidate.edgeId] = pathname(id);
	}
	const children = planDelegateChildren(candidates, resolution);
	const byEdge = new Map(candidates.map((candidate) => [candidate.edgeId, candidate]));
	const loaded = new Map<string, Record<string, unknown>>();
	const unloadable = new Map<string, { readonly message: string; readonly edgeIds: string[] }>();
	const renderings: Record<string, ArtifactChildMaterialization> = {};
	for (const child of children) {
		const candidate = byEdge.get(child.edgeId);
		const source = child.source;
		if (!child.loadable || !candidate || source === undefined) continue;
		if (!isAbsolute(source) || !existsSync(source) || !statSync(source).isFile()) continue;
		const failed = unloadable.get(source);
		if (failed) {
			failed.edgeIds.push(child.edgeId);
			continue;
		}
		let module = loaded.get(source);
		if (!module) {
			// Unimportable here (e.g. raw .ts without type stripping): not materialized, never a crash.
			try {
				module = (await import(pathToFileURL(source).href)) as Record<string, unknown>;
			} catch (error) {
				unloadable.set(source, {
					message: error instanceof Error ? error.message : String(error),
					edgeIds: [child.edgeId],
				});
				continue;
			}
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
	const importFailures = [...unloadable].map(([source, failure]) => ({
		source,
		edgeIds: [...failure.edgeIds],
		message: failure.message,
	}));
	const linked = linkDelegateChildren({ children, renderings, importFailures });
	return {
		materializations: linked.materializations,
		importFailures,
		diagnostics: linked.diagnostics,
	};
}

// Resolution and path math stay with the bundler by the ruling's own list of
// bundler concepts; the `module-link` pass reads the resulting table.
export function fallbackImportedSource(parent: string, specifier: string): string {
	const source = specifier.split('?')[0]!;
	return isRelativeImport(source) ? resolve(dirname(parent), source) : source;
}

export function linkedInterfaces(
	imports: ReadonlyArray<LinkedModuleChildResolution>,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
	claims: ReadonlyArray<LinkedInterfaceClaim> = [],
) {
	return computeLinkedInterfaces({
		imports: imports.map(
			(imported): LinkedInterfaceImport => ({
				specifier: imported.specifier,
				source: imported.source,
				interfaceHash: artifacts.get(imported.source)?.interfaceHash,
				moduleInterface: artifacts.get(imported.source)?.moduleGraphInterface,
			}),
		),
		claims,
	});
}

export function linkedInterfaceClaims(
	imports: ReadonlyArray<LinkedModuleChildResolution>,
	metadata: ModuleMetadataRegistry,
): LinkedInterfaceClaim[] {
	return imports.map((imported) => ({
		source: imported.source,
		symbols: sourceSymbolManifest(metadata, imported.source)?.symbols ?? [],
	}));
}

// The pass decides; composing a child it could not classify stays fail-closed.
export function throwLinkedModuleChildDiagnostics(
	metadata: ModuleMetadataRegistry,
	children: ReadonlyArray<LinkedModuleChildResolution>,
	parentManifest?: Pick<MarklessTransformManifest, 'captureMetadata'>,
) {
	const [diagnostic] = linkedModuleChildDiagnostics(children, {
		captureMetadataForSource: (source) => metadata.captureMetadataForSource(source),
		parentCaptureMetadataForSource: (parent) =>
			parentManifest?.captureMetadata ?? metadata.captureMetadataForSource(pathname(parent)),
	});
	if (diagnostic) throw new Error(diagnostic.message);
}
