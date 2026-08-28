// Performs the I/O the `module-link` and `delegate-children` compiler passes
// may not: resolves specifiers, forces child loads, awaits sealing, imports a
// delegate's compiled JavaScript, then calls the passes. Nothing here decides
// what a child is or what it contributes; those verdicts belong to
// `@markless/compiler`, whose passes have no resolve, no load and no import.
import { existsSync, readFileSync, statSync } from 'node:fs';
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
	type ModuleGraphInterfaceArtifact,
	type ModuleLinkRequest,
	type ModuleLinkResolutionTable,
	compileTsrxModuleLinkArtifact,
	computeLinkedInterfaces,
	delegateChildRenderPlan,
	delegateChildRendering,
	delegateChildResolutionRequests,
	linkBarrelComponents,
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
import { dirname, relative, resolve } from 'pathe';
import { withQuery } from 'ufo';
import type { BuildDelegateLoader, DelegateSpecifierResolve } from './build/delegate-loader.ts';
import { yieldToEventLoop } from './event-loop.ts';
import type { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import { MARKLESS_VIRTUAL_PREFIX } from './transform.ts';
import type {
	MarklessEnvironment,
	MarklessModuleLinkArtifact,
	MarklessRolldownOptions,
	MarklessTransformManifest,
} from './types.ts';
import { TSRX_SOURCE_FILE, isRelativeImport, pathname } from './virtual-ids.ts';

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

// The walk in `module-link` asks; this performs the I/O it may not: resolves
// each specifier the walk reached, and reads the module-graph interface of each
// file it reached, compiling one this build has not linked yet. The pass is
// called again after every round until it asks for nothing more.
const BARREL_WALK_ROUNDS = 32;

export async function linkBarrelComponentInterfaces(
	context: LinkResolveContext,
	parent: string,
	moduleImports: ReadonlyArray<{ readonly source: string }>,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
	buildId: string | undefined,
): Promise<{
	readonly interfaces: Record<string, ModuleGraphInterfaceArtifact>;
	readonly children: ReadonlyArray<LinkedModuleChildResolution>;
}> {
	const resolution: Record<string, string | null> = {};
	const interfacesByFile = new Map<string, ModuleGraphInterfaceArtifact | null>();
	const rebase = (target: string) => {
		const specifier = relative(dirname(parent), target);
		return specifier.startsWith('.') ? specifier : `./${specifier}`;
	};
	const packageBarrels = await packageBarrelSpecifiers(context, parent, moduleImports, rebase);
	const passImports =
		packageBarrels.size === 0
			? moduleImports
			: moduleImports.map((moduleImport) => {
					const barrel = packageBarrels.get(moduleImport.source);
					return barrel ? { ...moduleImport, source: barrel.specifier } : moduleImport;
				});
	for (const barrel of packageBarrels.values()) {
		resolution[moduleLinkResolutionKey(barrel.specifier, parent)] = barrel.id;
	}
	const passInput = () => ({
		parent,
		moduleImports: passImports,
		resolution,
		moduleInterface: (filename: string) => interfacesByFile.get(filename),
		rebase,
	});

	let artifact = linkBarrelComponents(passInput());
	for (
		let round = 0;
		artifact.pendingResolutions.length + artifact.pendingInterfaces.length > 0;
		round += 1
	) {
		if (round === BARREL_WALK_ROUNDS) {
			throw new Error(
				`MARKLESS_COMPONENT_BARREL_UNRESOLVED: Module ${JSON.stringify(parent)} re-exports through more than ${BARREL_WALK_ROUNDS} chained barrels.`,
			);
		}
		await Promise.all(
			artifact.pendingResolutions.map(async (request) => {
				const resolved = await context.resolve(request.specifier, request.parent, {
					skipSelf: true,
				});
				const id = typeof resolved === 'string' ? resolved : resolved?.id;
				resolution[moduleLinkResolutionKey(request.specifier, request.parent)] = id
					? pathname(String(id))
					: null;
			}),
		);
		await Promise.all(
			artifact.pendingInterfaces.map(async (filename) => {
				interfacesByFile.set(filename, await barrelModuleInterface(filename, artifacts, buildId));
			}),
		);
		artifact = linkBarrelComponents(passInput());
	}
	// The pass decides; a barrel it could not follow stays fail-closed.
	const [diagnostic] = artifact.diagnostics;
	if (diagnostic) throw new Error(diagnostic.message);
	return {
		interfaces: republishPackageBarrels(artifact.interfaces, packageBarrels),
		children: artifact.children,
	};
}

// The walk saw the dependency barrel under the path spelling it was offered;
// the importing module wrote the package specifier, so that is the key its
// compile looks the interface up by.
function republishPackageBarrels(
	linked: Record<string, ModuleGraphInterfaceArtifact>,
	packageBarrels: ReadonlyMap<string, PackageBarrel>,
): Record<string, ModuleGraphInterfaceArtifact> {
	if (packageBarrels.size === 0) return linked;
	const reexported = new Set(
		Object.values(linked).flatMap((entry) =>
			(entry.reexports ?? []).map((reexport) => reexport.source),
		),
	);
	const interfaces = { ...linked };
	for (const [source, barrel] of packageBarrels) {
		const entry = linked[barrel.specifier];
		if (!entry) continue;
		interfaces[source] = entry;
		// One key per interface: a second spelling of the same file makes the
		// compiler's filename fallback ambiguous.
		if (!reexported.has(barrel.specifier)) delete interfaces[barrel.specifier];
	}
	return interfaces;
}

type PackageBarrel = { readonly specifier: string; readonly id: string };

/**
 * A dependency package's barrel, offered to the walk under the path spelling it
 * follows. Only a package that declares it ships Markless source is followed:
 * its modules compile in this build, so an interface for them can exist. Any
 * other dependency contributes none and the call behind it stays fail-closed.
 */
async function packageBarrelSpecifiers(
	context: LinkResolveContext,
	parent: string,
	moduleImports: ReadonlyArray<{ readonly source: string }>,
	rebase: (target: string) => string,
): Promise<ReadonlyMap<string, PackageBarrel>> {
	const specifiers = [...new Set(moduleImports.map((moduleImport) => moduleImport.source))].filter(
		(source) =>
			!isRelativeImport(source) &&
			!isAbsolute(source) &&
			!source.startsWith('\0') &&
			!TSRX_SOURCE_FILE.test(source),
	);
	const entries = await Promise.all(
		specifiers.map(async (source) => {
			const resolved = await context.resolve(source, parent, { skipSelf: true });
			if (typeof resolved === 'object' && resolved !== null && Boolean(resolved.external)) {
				return null;
			}
			const raw = typeof resolved === 'string' ? resolved : resolved?.id;
			if (!raw) return null;
			const id = pathname(String(raw));
			if (!isAbsolute(id) || !MARKLESS_SOURCE_FILE.test(id)) return null;
			if (!existsSync(id) || !statSync(id).isFile()) return null;
			if (!shipsMarklessSource(dirname(id))) return null;
			return [source, { specifier: rebase(id), id }] as const;
		}),
	);
	return new Map(entries.filter((entry) => entry !== null));
}

const MARKLESS_SOURCE_FILE = /\.(?:m?ts|tsx|tsrx)$/;

const shipsMarklessSourceByDirectory = new Map<string, boolean>();

// `publishConfig.marklessShipsSource` is the package's own declaration that its
// tarball is source compiled by the consumer's build.
function shipsMarklessSource(directory: string): boolean {
	const cached = shipsMarklessSourceByDirectory.get(directory);
	if (cached !== undefined) return cached;
	const manifest = resolve(directory, 'package.json');
	const parent = dirname(directory);
	let ships = false;
	if (existsSync(manifest)) {
		try {
			const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
			ships = parsed?.publishConfig?.marklessShipsSource === true;
		} catch {
			ships = false;
		}
	} else if (parent !== directory) {
		ships = shipsMarklessSource(parent);
	}
	shipsMarklessSourceByDirectory.set(directory, ships);
	return ships;
}

async function barrelModuleInterface(
	filename: string,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
	buildId: string | undefined,
): Promise<ModuleGraphInterfaceArtifact | null> {
	const known = artifacts.get(filename)?.moduleGraphInterface;
	if (known) return known;
	if (!existsSync(filename) || !statSync(filename).isFile()) return null;
	await yieldToEventLoop();
	const linked = await compileTsrxModuleLinkArtifact({
		filename,
		source: readFileSync(filename, 'utf8'),
		buildId,
	});
	return linked.moduleGraphInterface;
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
				// Sequential, and it has to stay that way: loading these in parallel let
				// module registration land in completion order, so an unchanged tree built
				// different chunk contents (and a different chunk COUNT) run to run.
				for (const id of plan.claimSources) await context.load({ id });
			}
		}
		if (plan.seal) await metadata.sealSourceSymbolClaims(child.source);
	}
	await awaitChildClaimPublications(metadata, children);
}

/**
 * Re-enters the publication barrier immediately before claims are read. A server
 * transform publishes no client claims, so it has no seal of its own, and any
 * await between forcing a child and reading it reopens the window a sibling can
 * start compiling in. Callers must invoke this with no further await before the
 * read: the registry state it settles is the state the read sees.
 */
export async function awaitChildClaimPublications(
	metadata: ModuleMetadataRegistry,
	children: ReadonlyArray<LinkedModuleChildResolution>,
): Promise<void> {
	for (const child of children) await metadata.awaitSourceClaimsPublished(child.source);
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

// A dependency that ships TypeScript source: Node refuses to type-strip under
// node_modules, so a plain `import()` can never load one of these.
const SOURCE_SHIPPED_DELEGATE = /\.(?:m|c)?tsx?$|\.tsrx$/;

// How a delegate module is executed. The build environment's module runner is
// the only loader that can run a source-shipped package, because it applies the
// same transform pipeline the app's own modules go through.
export type DelegateModuleImport = (source: string) => Promise<unknown>;

// One module table per build: a delegate imported by several pages is executed
// once, and a delegate that failed once is not retried on every later edge.
export type DelegateModuleCache = ReturnType<typeof createDelegateModuleCache>;

export function createDelegateModuleCache() {
	const loaded = new Map<string, Record<string, unknown>>();
	const failures = new Map<string, string>();
	return {
		failureFor(source: string) {
			return failures.get(source);
		},
		moduleFor(source: string) {
			return loaded.get(source);
		},
		async load(
			source: string,
			importModule: DelegateModuleImport | undefined,
		): Promise<Record<string, unknown> | undefined> {
			const cached = loaded.get(source);
			if (cached) return cached;
			if (failures.has(source)) return undefined;
			let firstMessage: string | undefined;
			// The runner runs first for source-shipped delegates; a plain `import()`
			// of raw TypeScript is refused before it can produce a module.
			for (const load of importModule && SOURCE_SHIPPED_DELEGATE.test(source)
				? [importModule, nodeImport]
				: [nodeImport, ...(importModule ? [importModule] : [])]) {
				try {
					const module = (await load(source)) as Record<string, unknown>;
					loaded.set(source, module);
					return module;
				} catch (error) {
					firstMessage ??= error instanceof Error ? error.message : String(error);
				}
			}
			failures.set(source, firstMessage ?? 'the delegate module could not be loaded.');
			return undefined;
		},
		clear() {
			loaded.clear();
			failures.clear();
		},
	};
}

function nodeImport(source: string): Promise<unknown> {
	return import(pathToFileURL(source).href);
}

// The build's own module table and loader, so every delegate edge in a build
// shares one execution of a given dependency. A dev server hands over its module
// runner; `vite build` has none, so the build-mode loader compiles the delegate
// itself and resolves its imports through the build's own resolver.
export function delegateLoadOptions(
	ctx: {
		readonly state: {
			readonly delegateModules: DelegateModuleCache;
			readonly buildDelegateLoader: BuildDelegateLoader;
		};
		readonly internalOptions: {
			readonly devServer?: { readonly importModule?: DelegateModuleImport };
		};
	},
	resolveContext: LinkResolveContext,
) {
	const { buildDelegateLoader } = ctx.state;
	const resolve = buildDelegateSpecifierResolve(resolveContext);
	return {
		modules: ctx.state.delegateModules,
		importModule:
			ctx.internalOptions.devServer?.importModule ??
			((source: string) => buildDelegateLoader.load(source, resolve)),
	};
}

function buildDelegateSpecifierResolve(context: LinkResolveContext): DelegateSpecifierResolve {
	return async (specifier, importer) => {
		const resolved = await context.resolve(specifier, importer, { skipSelf: true });
		if (typeof resolved === 'string') return resolved;
		if (!resolved || resolved.external) return undefined;
		return String(resolved.id);
	};
}

// Performs the I/O the `delegate-children` pass may not: resolves each edge,
// loads the dependency's module, and calls its `renderSsr`. It is the one place
// a linker executes code the compiler did not produce, which is exactly why it
// lives here and not in the pass.
export async function materializeDelegateChildren(
	context: LinkResolveContext,
	parent: string,
	candidates: ReadonlyArray<LinkedArtifactChild>,
	options: {
		readonly modules?: DelegateModuleCache;
		readonly importModule?: DelegateModuleImport;
	} = {},
): Promise<DelegateChildMaterializationResult> {
	const resolution: Record<string, string> = {};
	for (const candidate of delegateChildResolutionRequests(candidates)) {
		const resolved = await context.resolve(candidate.importSource, parent, { skipSelf: true });
		const id = typeof resolved === 'string' ? resolved : resolved?.id;
		if (id) resolution[candidate.edgeId] = pathname(id);
	}
	const children = planDelegateChildren(candidates, resolution);
	const byEdge = new Map(candidates.map((candidate) => [candidate.edgeId, candidate]));
	const modules = options.modules ?? createDelegateModuleCache();
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
		// A delegate no loader could execute is not materialized, never a crash.
		const module = await modules.load(source, options.importModule);
		if (!module) {
			unloadable.set(source, {
				message: modules.failureFor(source) ?? 'the delegate module could not be loaded.',
				edgeIds: [child.edgeId],
			});
			continue;
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
