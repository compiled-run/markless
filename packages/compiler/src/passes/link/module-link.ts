// Pass `module-link`: turns the specifiers a module imports, plus the linker's
// resolution table, into the typed imported-child graph the rest of the link
// stage reads. Resolution and loading are inputs, never work this pass does: it
// has no `resolve` and no `load`, so an externalized dependency cannot be
// loaded from here, and a child's kind is decided from its resolution and its
// compiled artifact rather than from the name of its file.
import type {
	CaptureAnalysisArtifact,
	CompilerDiagnostic,
	ExtractedCaptureSymbol,
	LinkedInterfaceImport,
	LinkedModuleChildKind,
	LinkedModuleChildResolution,
	LinkedModuleGraphArtifact,
	LinkedModuleGraphInput,
	LinkedModuleClaimPlan,
	LinkedSymbolClaimManifest,
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceLinkedComponent,
	ModuleGraphInterfaceReexport,
	ModuleLinkRequest,
	ModuleLinkResolutionTable,
	RenderDataReachRecord,
	SymbolResolverModuleInput,
} from '../../artifacts.ts';
import { computeLinkedInterfaces } from './interface-link.ts';

export const MODULE_LINK_PASS_ID = 'module-link';

// A TSRX source is a compiler fact about a file, not a bundler fact about an id.
const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;
// The only extension rule left: it decides nothing about a module that has a
// compiled artifact, it only names the author-time helpers that never had one.
const PLAIN_TYPESCRIPT_SOURCE = /\.[cm]?tsx?$/;

export function moduleLinkResolutionKey(specifier: string, importer: string): string {
	return `${specifier}@${importer}`;
}

// The imports whose interfaces this module links: TSRX sources only, because a
// plain module contributes no module-graph interface to link against.
export function linkedModuleImportRequests(
	parent: string,
	moduleImports: ReadonlyArray<{ readonly source: string }>,
): ModuleLinkRequest[] {
	return moduleImports
		.filter((moduleImport) => TSRX_SOURCE_FILE.test(moduleImport.source))
		.map((moduleImport) => ({ parent, specifier: moduleImport.source }));
}

// The children this module composes, one per symbol route the manifest records.
export function linkedSymbolRouteRequests(
	parent: string,
	symbolRoutes:
		| ReadonlyArray<{ readonly importSource: string; readonly componentEdgeId?: string }>
		| undefined,
): ModuleLinkRequest[] {
	return (symbolRoutes ?? []).map((route) => ({
		parent,
		specifier: route.importSource,
		...(route.componentEdgeId ? { componentEdgeId: route.componentEdgeId } : {}),
	}));
}

export function planLinkedModuleChildren(
	requests: ReadonlyArray<ModuleLinkRequest>,
	resolution: ModuleLinkResolutionTable,
): LinkedModuleChildResolution[] {
	return requests.map((request) => {
		const resolved = resolution[moduleLinkResolutionKey(request.specifier, request.parent)];
		return {
			parent: request.parent,
			specifier: request.specifier,
			source: resolved?.id ?? request.specifier,
			...(request.componentEdgeId ? { componentEdgeId: request.componentEdgeId } : {}),
			externalized: resolved?.external === true,
		};
	});
}

export function linkedModuleChildKey(child: LinkedModuleChildResolution): string {
	return `${child.parent}\0${child.specifier}\0${child.source}`;
}

export function uniqueLinkedModuleChildren<Child extends LinkedModuleChildResolution>(
	children: ReadonlyArray<Child>,
): Child[] {
	return [...new Map(children.map((child) => [linkedModuleChildKey(child), child])).values()];
}

export function linkImportedModules(input: LinkedModuleGraphInput): LinkedModuleGraphArtifact {
	const children = input.children.map((child) => ({
		...child,
		kind: linkedModuleChildKind(child, input),
	}));
	return {
		passId: MODULE_LINK_PASS_ID,
		children,
		interfaces: computeLinkedInterfaces({
			imports: children.map(
				(child): LinkedInterfaceImport => ({
					specifier: child.specifier,
					source: child.source,
					interfaceHash: input.moduleArtifacts.get(child.source)?.interfaceHash,
					moduleInterface: input.moduleArtifacts.get(child.source)?.moduleGraphInterface,
				}),
			),
			claims: [],
		}).interfaces,
		routeArtifacts: Object.fromEntries(
			children.map((child) => [child.source, input.symbolRouteSource(child.source)]),
		),
		reachedRenderData: linkedRenderDataReach(children, input),
		diagnostics: linkedModuleChildDiagnostics(children, input),
	};
}

// `(root, source)` is the linked fact this pass records. The key is opaque on
// purpose: read it back through `renderDataReachImportSources` rather than
// splitting the string.
export function renderDataReachKey(root: string, source: string): string {
	return `${root}\0${source}`;
}

// Whether a render-data link is qualified by a route root at all, and by which
// one. A source that is itself a materialized root answers for itself; anything
// else is only reached if the caller was told which root reached it.
export function linkedRenderDataReachRoot(input: {
	readonly source: string;
	readonly materializedSources: ReadonlySet<string> | ReadonlyMap<string, unknown>;
	readonly reachedFrom: string | undefined;
}): string | undefined {
	return input.materializedSources.has(input.source) ? input.source : input.reachedFrom;
}

// The per-specifier module sources a parent imports to reach its children's
// render data. Every specifier of one `(root, source)` reach resolves to the
// same module source, so flattening the records cannot disagree with itself.
export function renderDataReachImportSources(
	artifact: Pick<LinkedModuleGraphArtifact, 'reachedRenderData'>,
): Record<string, string> {
	const sources: Record<string, string> = {};
	for (const record of Object.values(artifact.reachedRenderData)) {
		for (const specifier of record.specifiers) sources[specifier] = record.moduleSource;
	}
	return sources;
}

function linkedRenderDataReach(
	children: ReadonlyArray<LinkedModuleChildResolution>,
	input: LinkedModuleGraphInput,
): Record<string, RenderDataReachRecord> {
	const root = input.renderDataReachRoot;
	const moduleSource = input.reachedRenderDataSource;
	if (root === undefined || !moduleSource) return {};

	const reach: Record<string, RenderDataReachRecord> = {};
	for (const child of children) {
		const key = renderDataReachKey(root, child.source);
		const existing = reach[key];
		reach[key] = existing
			? { ...existing, specifiers: [...existing.specifiers, child.specifier] }
			: {
					root,
					source: child.source,
					specifiers: [child.specifier],
					moduleSource: moduleSource(child.source, root),
				};
	}
	return reach;
}

// The kind is the reading at link time. A child still being loaded reads as
// `unresolved`; re-run `linkedModuleChildDiagnostics` once loading has settled
// to get the verdict the fail-closed check acts on.
function linkedModuleChildKind(
	child: LinkedModuleChildResolution,
	readers: Pick<
		LinkedModuleGraphInput,
		'captureMetadataForSource' | 'parentCaptureMetadataForSource'
	>,
): LinkedModuleChildKind {
	// A delegate the resolver kept external has no compiled artifact in this
	// build by construction, and nothing here may ask for one.
	if (child.externalized) return 'external-delegate';
	const childMetadata = readers.captureMetadataForSource(child.source);
	const parentMetadata = readers.parentCaptureMetadataForSource(child.parent);
	if (
		parentMetadata &&
		childMetadata?.passId === parentMetadata.passId &&
		Array.isArray(childMetadata.extractedSymbols) &&
		Array.isArray(childMetadata.diagnostics)
	) {
		return 'compiled-tsrx';
	}
	// Plain TypeScript source components (for example @markless/router's Html)
	// are author-time helpers, not compiled TSRX artifacts. A built JavaScript
	// component has no such excuse and stays fail-closed below.
	if (!childMetadata && PLAIN_TYPESCRIPT_SOURCE.test(child.source)) return 'plain-ts';
	return 'unresolved';
}

export function linkedModuleChildDiagnostics(
	children: ReadonlyArray<LinkedModuleChildResolution>,
	readers: Pick<
		LinkedModuleGraphInput,
		'captureMetadataForSource' | 'parentCaptureMetadataForSource'
	>,
): CompilerDiagnostic[] {
	return children.flatMap((child) =>
		linkedModuleChildKind(child, readers) === 'unresolved'
			? [linkedModuleChildMetadataDiagnostic(child)]
			: [],
	);
}

function linkedModuleChildMetadataDiagnostic(
	child: LinkedModuleChildResolution,
): CompilerDiagnostic {
	return {
		code: 'MARKLESS_CAPTURE_METADATA_MISSING',
		severity: 'error',
		phase: 'capture-analysis',
		title: 'Imported child has no current capture metadata',
		message: `MARKLESS_CAPTURE_METADATA_MISSING: Parent module ${JSON.stringify(child.parent)} composes imported child ${JSON.stringify(child.specifier)}, but its compiled artifact has no current capture metadata. Rebuild the child with the current Markless compiler and clear any stale build cache.`,
		why: 'Composing a child whose capture metadata is stale or absent would link captures against an artifact this compiler did not produce.',
		passId: MODULE_LINK_PASS_ID,
		artifactKeys: ['linkedModuleGraph'],
		source: child.source,
		suggestions: [
			{
				message:
					'Rebuild the child with the current Markless compiler and clear any stale build cache.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_METADATA_MISSING',
	};
}

// The one module a linker must force before this child can be read, or nothing
// when it is already linked. An externalized child is never a load: it has no
// module in this build to load, which is the whole point of the kind.
export function linkedModuleLoadSource(
	child: LinkedModuleChildResolution,
	linked: boolean,
): string | undefined {
	return linked || child.externalized ? undefined : child.source;
}

// What the linker must publish and wait for once the child has been loaded and
// its capture metadata is readable.
export function linkedModuleClaimPlan(input: {
	readonly child: LinkedModuleChildResolution;
	readonly captureMetadata: CaptureAnalysisArtifact | undefined;
	readonly clientEnvironment: boolean;
	readonly completeWakeVariants: boolean;
	readonly symbolRouteSource: (source: string) => string;
	readonly resumeSource: (source: string) => string;
	readonly wakeSource: (source: string) => string;
}): LinkedModuleClaimPlan {
	if (!input.clientEnvironment) return { claimSources: [], expectClaims: false, seal: false };
	if (!input.captureMetadata?.extractedSymbols.length)
		return { claimSources: [], expectClaims: false, seal: true };
	const source = input.child.source;
	return {
		claimSources: [
			...(input.completeWakeVariants
				? [source, input.resumeSource(source), input.wakeSource(source)]
				: []),
			input.symbolRouteSource(source),
		],
		expectClaims: true,
		seal: true,
	};
}

/**
 * The two reasons a composed child's symbol needs the parent to bind it.
 *
 * `prop-bound` is the original one: the child's symbol captures a prop, and only
 * the parent's edge knows what that prop is. `widget-callback` is the second: the
 * child's symbol dispatches to a callback slot on its own widget graph, and only
 * the parent's edge knows which consumer handler answers it. They are separate
 * claims because a prop-bound row rebinds the symbol's *other* capture slots
 * against the parent edge too, which a widget-callback row must not do — the
 * child's own graph reads and its trigger record stay the child's.
 */
export type LinkedImportedClaimKind = 'prop-bound' | 'widget-callback';

export function linkedImportedClaimKind(
	captureSymbol: ExtractedCaptureSymbol,
): LinkedImportedClaimKind | undefined {
	if (captureSymbol.captureSlots.some((slot) => slot.propName !== undefined)) return 'prop-bound';
	return captureSymbol.captureSlots.some((slot) =>
		slot.routes.some((route) => route.kind === 'widget-callback-route'),
	)
		? 'widget-callback'
		: undefined;
}

// The parent-bound symbol rows a composed child contributes. A child only
// contributes rows once its claims and its capture metadata agree on a symbol
// the parent has to bind — through a prop, or through a widget callback slot.
export function linkedImportedSymbolInputs(input: {
	readonly children: ReadonlyArray<LinkedModuleChildResolution>;
	readonly captureMetadataForSource: (source: string) => CaptureAnalysisArtifact | undefined;
	readonly symbolClaimsForSource: (source: string) => LinkedSymbolClaimManifest | undefined;
}): SymbolResolverModuleInput['symbols'] {
	return input.children.flatMap((child) => {
		const captureMetadata = input.captureMetadataForSource(child.source);
		const claimManifest = input.symbolClaimsForSource(child.source);
		if (!captureMetadata || !claimManifest || !child.componentEdgeId) return [];
		return claimManifest.symbols.flatMap((symbol) => {
			const captureSymbol = captureMetadata.extractedSymbols.find(
				(candidate: ExtractedCaptureSymbol) => candidate.symbolId === symbol.symbolId,
			);
			const claimKind = captureSymbol ? linkedImportedClaimKind(captureSymbol) : undefined;
			if (!captureSymbol || !claimKind) return [];
			return [
				{
					id: `imported:${encodeURIComponent(child.source)}:${symbol.symbolId}`,
					chunk: symbol.virtualModuleId,
					exportName: symbol.exportName,
					componentEdgeId: child.componentEdgeId,
					claimKind,
					captureSymbol,
				},
			];
		});
	});
}

// A child that expects prop-bound claims but contributed no row has not
// published yet; the linker retries rather than emitting a half-linked resolver.
export function linkedImportedClaimsMissing(input: {
	readonly children: ReadonlyArray<LinkedModuleChildResolution>;
	readonly symbols: SymbolResolverModuleInput['symbols'];
	readonly captureMetadataForSource: (source: string) => CaptureAnalysisArtifact | undefined;
}): boolean {
	return input.children.some((child) => {
		// Edgeless children never get a symbol-input row; do not wait on one.
		if (!child.componentEdgeId) return false;
		const expectsClaims = input
			.captureMetadataForSource(child.source)
			?.extractedSymbols.some(
				(symbol: ExtractedCaptureSymbol) =>
					linkedImportedClaimKind(symbol) !== undefined,
			);
		return (
			expectsClaims === true &&
			!input.symbols.some((symbol) => symbol.componentEdgeId === child.componentEdgeId)
		);
	});
}

export function linkedChildrenHaveBrowserTriggers(input: {
	readonly children: ReadonlyArray<LinkedModuleChildResolution>;
	readonly symbolClaimsForSource: (source: string) => LinkedSymbolClaimManifest | undefined;
	readonly browserTriggerCapability: (source: string) => boolean | undefined;
}): boolean {
	return input.children.some((child) => {
		const manifest = input.symbolClaimsForSource(child.source);
		return (
			(manifest !== undefined && linkedManifestHasBrowserTriggers(manifest)) ||
			input.browserTriggerCapability(child.source) === true
		);
	});
}

export function linkedManifestHasBrowserTriggers(manifest: LinkedSymbolClaimManifest): boolean {
	return manifest.symbols.some(
		(symbol) => symbol.kind === 'event-handler' || symbol.kind === 'behavior',
	);
}

/**
 * Component parts are shipped as a barrel: `checkbox/index.ts` re-exports the
 * `.tsrx` files, and an app may read it through another `export * as checkbox`.
 * A plain `.ts` module has no render data of its own, so the chain is followed
 * to the `.tsrx` modules that do, and every reached component is reported with
 * its specifier rebased to the module that imports the barrel.
 *
 * The same walk carries the family's shared definitions: `export { famState as
 * state } from './fam.tsrx'` reaches no component, but it is the ratified
 * `family.state()` surface, so the chain is republished as re-exports whose
 * sources are rebased for the importing module. The shared-call resolver walks
 * those exactly as it walks an authored barrel's; a chain that reaches no
 * published definition contributes nothing and stays fail-closed there.
 *
 * Resolution and reading are inputs, never work this pass does. A specifier the
 * driver has not resolved yet, or a file whose interface it has not read yet,
 * comes back as `pendingResolutions` / `pendingInterfaces`; the driver fills
 * them and calls again until both are empty.
 */
export type BarrelComponentLinkInput = {
	readonly parent: string;
	readonly moduleImports: ReadonlyArray<{ readonly source: string }>;
	/**
	 * `specifier@importer` (see `moduleLinkResolutionKey`) to the module id it
	 * resolves to, or `null` when the resolver answered with nothing. An absent
	 * key has not been asked yet.
	 */
	readonly resolution: Readonly<Record<string, string | null>>;
	/**
	 * The module-graph interface of a file the driver has already read: `null`
	 * when that file has none, `undefined` when it has not been read yet.
	 */
	readonly moduleInterface: (filename: string) => ModuleGraphInterfaceArtifact | null | undefined;
	/** The specifier `parent` must use to import `target`. Path math is the driver's. */
	readonly rebase: (target: string) => string;
};

export type BarrelComponentLinkArtifact = {
	readonly passId: typeof MODULE_LINK_PASS_ID;
	readonly interfaces: Record<string, ModuleGraphInterfaceArtifact>;
	readonly children: LinkedModuleChildResolution[];
	readonly diagnostics: CompilerDiagnostic[];
	readonly pendingResolutions: ModuleLinkRequest[];
	readonly pendingInterfaces: string[];
};

/**
 * What one barrel level publishes: the components reached under it, and the
 * re-exports that reach a shared definition, sources already rebased for the
 * module that imports the outermost barrel.
 */
type BarrelWalk = {
	readonly linkedComponents: ModuleGraphInterfaceLinkedComponent[];
	readonly sharedReexports: ModuleGraphInterfaceReexport[];
};

export function linkBarrelComponents(
	input: BarrelComponentLinkInput,
): BarrelComponentLinkArtifact {
	const interfaces: Record<string, ModuleGraphInterfaceArtifact> = {};
	const children: LinkedModuleChildResolution[] = [];
	const diagnostics: CompilerDiagnostic[] = [];
	const pendingResolutions: ModuleLinkRequest[] = [];
	const pendingInterfaces: string[] = [];

	// `undefined` means "ask the driver"; `null` means "the driver asked and got nothing".
	const resolveId = (specifier: string, importer: string): string | null | undefined => {
		const key = moduleLinkResolutionKey(specifier, importer);
		if (!Object.hasOwn(input.resolution, key)) {
			pendingResolutions.push({ parent: importer, specifier });
			return undefined;
		}
		return input.resolution[key] ?? null;
	};
	const readInterface = (filename: string): ModuleGraphInterfaceArtifact | null | undefined => {
		const known = input.moduleInterface(filename);
		if (known === undefined) pendingInterfaces.push(filename);
		return known;
	};

	// One child per module the walk reached, however many exports reached it.
	const linkChild = (source: string, specifier: string): void => {
		const child = { parent: input.parent, specifier, source, externalized: false };
		if (children.some((existing) => linkedModuleChildKey(existing) === linkedModuleChildKey(child)))
			return;
		children.push(child);
	};

	const walkBarrel = (
		filename: string,
		prefix: ReadonlyArray<string>,
		seen: ReadonlySet<string>,
	): BarrelWalk => {
		if (seen.has(filename)) return { linkedComponents: [], sharedReexports: [] };
		const reexports = readInterface(filename)?.reexports ?? [];
		const linkedComponents: ModuleGraphInterfaceLinkedComponent[] = [];
		const sharedReexports: ModuleGraphInterfaceReexport[] = [];
		for (const reexport of reexports) {
			const target = resolveId(reexport.source, filename);
			if (target === undefined) continue;
			if (target === null) {
				diagnostics.push(barrelUnresolvedDiagnostic(filename, reexport));
				continue;
			}
			const exportPath = [...prefix, reexport.exportName];
			const specifier = input.rebase(target);
			if (!TSRX_SOURCE_FILE.test(target)) {
				const nested = walkBarrel(
					target,
					reexport.importedName === '*' ? exportPath : prefix,
					new Set([...seen, filename]),
				);
				linkedComponents.push(...nested.linkedComponents);
				// The nested barrel is republished under the specifier this module
				// would import it by, so one re-export segment steps into it.
				if (nested.sharedReexports.length > 0) {
					interfaces[specifier] = {
						passId: 'module-graph-interface',
						filename: target,
						exports: [],
						reexports: nested.sharedReexports,
						render: { version: 1, components: [] },
					};
					sharedReexports.push({
						exportName: reexport.exportName,
						importedName: reexport.importedName,
						source: specifier,
					});
				}
				continue;
			}
			const targetInterface = readInterface(target);
			if (!targetInterface) continue;
			const component = targetInterface.render.components.find(
				(candidate) => candidate.exportName === reexport.importedName,
			);
			const sharedDefinition = targetInterface.sharedDefinitions?.some(
				(candidate) => candidate.exportName === reexport.importedName,
			);
			if (!component && !sharedDefinition) continue;
			interfaces[specifier] = targetInterface;
			linkChild(target, specifier);
			if (component) {
				linkedComponents.push({
					exportPath,
					source: specifier,
					importKind: reexport.importedName === 'default' ? 'default' : 'named',
					...(reexport.importedName === 'default'
						? {}
						: { importedName: reexport.importedName }),
					componentName: component.componentName,
				});
			}
			if (sharedDefinition) {
				sharedReexports.push({
					exportName: reexport.exportName,
					importedName: reexport.importedName,
					source: specifier,
				});
			}
		}
		return { linkedComponents, sharedReexports };
	};

	for (const moduleImport of input.moduleImports) {
		if (TSRX_SOURCE_FILE.test(moduleImport.source)) continue;
		if (!moduleImport.source.startsWith('.')) continue;
		const barrel = resolveId(moduleImport.source, input.parent);
		// An import that names no module in this build is not a barrel to follow.
		if (barrel === undefined || barrel === null) continue;
		const { linkedComponents, sharedReexports } = walkBarrel(barrel, [], new Set());
		if (linkedComponents.length === 0 && sharedReexports.length === 0) continue;
		interfaces[moduleImport.source] = {
			passId: 'module-graph-interface',
			filename: barrel,
			exports: [],
			linkedComponents,
			...(sharedReexports.length > 0 ? { reexports: sharedReexports } : {}),
			render: { version: 1, components: [] },
		};
	}

	return {
		passId: MODULE_LINK_PASS_ID,
		interfaces,
		children,
		diagnostics,
		pendingResolutions,
		pendingInterfaces,
	};
}

function barrelUnresolvedDiagnostic(
	filename: string,
	reexport: ModuleGraphInterfaceReexport,
): CompilerDiagnostic {
	return {
		code: 'MARKLESS_COMPONENT_BARREL_UNRESOLVED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Component barrel re-export does not resolve',
		message: `MARKLESS_COMPONENT_BARREL_UNRESOLVED: ${JSON.stringify(filename)} re-exports ${JSON.stringify(reexport.exportName)} from ${JSON.stringify(reexport.source)}, which does not resolve to a module.`,
		why: 'A barrel names the parts module rather than the components, so a re-export that resolves to nothing would silently drop every component behind it.',
		passId: MODULE_LINK_PASS_ID,
		artifactKeys: ['linkedModuleGraph'],
		source: filename,
		suggestions: [
			{
				message: `Check that ${JSON.stringify(reexport.source)} exists next to ${JSON.stringify(filename)} and is reachable by this build's resolver.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_BARREL_UNRESOLVED',
	};
}
