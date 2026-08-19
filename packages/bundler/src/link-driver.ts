// Performs the I/O the `module-link` compiler pass may not: resolves
// specifiers, forces child loads, awaits sealing, then calls the pass. Nothing
// here decides what a child is or what it contributes; those verdicts belong to
// `@markless/compiler`'s `module-link` pass, which has no resolve and no load.
import {
	type CaptureAnalysisArtifact,
	type LinkedModuleChildResolution,
	type LinkedModuleGraphArtifact,
	type ModuleLinkRequest,
	type ModuleLinkResolutionTable,
	linkImportedModules,
	linkedModuleImportRequests,
	linkedModuleClaimPlan,
	linkedModuleLoadSource,
	linkedSymbolRouteRequests,
	moduleLinkResolutionKey,
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
};

// The symbols-only route of a source: the module id a parent's resolver reaches
// a child's symbols through. Virtual module naming is the bundler's.
export function symbolRouteSource(source: string): string {
	return withQuery(source, { 'markless-symbols': null });
}

export function sourceSymbolManifest(
	metadata: ModuleMetadataRegistry,
	source: string,
): MarklessTransformManifest | undefined {
	const resolverId = `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodeURIComponent(source)}`;
	return metadata.sourceSymbolClaims(source, resolverId);
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
