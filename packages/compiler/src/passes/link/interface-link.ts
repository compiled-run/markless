// Pass `interface-link`: reduces the module interfaces a module imports into
// the linked interface map and the two invalidation keys a linker caches on,
// plus the link-time results that only exist once imported interfaces are
// known. Resolution is an input: the pass never resolves or loads a specifier,
// and virtual module naming stays with the caller that owns the module ids.
import { compileTsrxModule } from '../../compile-module.ts';
import {
	componentEdgeSymbolRoutes,
	type ComponentEdgeSymbolRoute,
} from '../../component-edge-instance.ts';
import type {
	CompileTsrxModuleResult,
	LinkedArtifactChild,
	LinkedBoundarySymbol,
	LinkedBoundarySymbolsInput,
	LinkedInterfaceClaim,
	LinkedInterfaceCompleteness,
	LinkedInterfaceImport,
	LinkedInterfacesArtifact,
	LinkedInterfacesInput,
	LinkedCompiledOutputs,
	ModuleGraphInterfaceArtifact,
	ModuleLinkArtifact,
} from '../../artifacts.ts';

export const INTERFACE_LINK_PASS_ID = 'interface-link';

// A cache-key decision over two compilations of one module: everything a
// consumer links against is unchanged and only the emitted render data moved.
// The caller keeps its cached link and republishes the render data instead of
// invalidating every module the link generated.
export function linkedRenderDataOnlyChange(
	previous: LinkedCompiledOutputs,
	next: LinkedCompiledOutputs,
): boolean {
	if (previous.interfaceHash !== next.interfaceHash || previous.code !== next.code) return false;
	if (JSON.stringify(previous.moduleImports) !== JSON.stringify(next.moduleImports)) return false;
	const withoutRenderData = (result: LinkedCompiledOutputs) =>
		result.virtualModules.filter((module) => module.type !== 'render-data');
	if (JSON.stringify(withoutRenderData(previous)) !== JSON.stringify(withoutRenderData(next))) {
		return false;
	}
	return JSON.stringify(previous.manifest) === JSON.stringify(next.manifest);
}

export function computeLinkedInterfaces(input: LinkedInterfacesInput): LinkedInterfacesArtifact {
	return {
		passId: INTERFACE_LINK_PASS_ID,
		interfaces: linkedInterfaceMap(input.imports),
		signature: interfaceHashSignature(input.imports),
		claimSignature: symbolClaimSignature(input.claims),
	};
}

// Keyed by the specifier the importer wrote, so a specifier whose interface
// arrives through another module (a barrel re-export) is one more resolved
// entry here, not a different key shape.
function linkedInterfaceMap(
	imports: ReadonlyArray<LinkedInterfaceImport>,
): Readonly<Record<string, ModuleGraphInterfaceArtifact>> {
	return Object.fromEntries(
		imports.flatMap((imported) =>
			imported.moduleInterface
				? ([[imported.specifier, imported.moduleInterface] as const] as const)
				: [],
		),
	);
}

// The key is over the resolved interface set — specifier, the source it
// resolved to, and that source's interface hash — so a module whose interface
// changed invalidates every importer of it, and a re-resolution to a different
// source does too.
function interfaceHashSignature(imports: ReadonlyArray<LinkedInterfaceImport>): string {
	return imports
		.map((imported) =>
			[imported.specifier, imported.source, imported.interfaceHash ?? 'missing']
				.map(encodeURIComponent)
				.join(':'),
		)
		.sort()
		.join('|');
}

// Cache key: every claim per source, merged and ordered, so a diverging later claim moves it.
function symbolClaimSignature(claims: ReadonlyArray<LinkedInterfaceClaim>): string {
	const rowsBySource = new Map<string, Set<string>>();
	for (const claim of claims) {
		const rows = rowsBySource.get(claim.source) ?? new Set<string>();
		for (const symbol of claim.symbols) rows.add(JSON.stringify(symbol));
		rowsBySource.set(claim.source, rows);
	}
	return [...rowsBySource.keys()]
		.sort()
		.map((source) => JSON.stringify([source, [...(rowsBySource.get(source) ?? [])].sort()]))
		.join('|');
}

export async function compileTsrxModuleLinkArtifact(input: {
	readonly filename: string;
	readonly source: string;
	readonly buildId?: string;
}): Promise<ModuleLinkArtifact> {
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		buildId: input.buildId,
		symbols: [],
	});
	return {
		moduleGraphInterface: compiled.moduleGraphInterface,
		interfaceHash: moduleInterfaceHash(compiled.moduleGraphInterface),
		moduleImports: compiled.semanticGraph.moduleImports,
	};
}

export function moduleInterfaceHash(value: ModuleGraphInterfaceArtifact | undefined): string {
	let hash = 0x811c9dc5;
	const source = JSON.stringify(hashedInterface(value));
	for (let index = 0; index < source.length; index++) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `mgi1-${(hash >>> 0).toString(36)}`;
}

/**
 * The interface as the hash reads it: the component's published arm markup is
 * left out, so an edit inside a child's own markup keeps reusing the parent the
 * way it always has. A parent that inlined that markup into an `@if` flip picks
 * the new markup up when it next compiles.
 */
function hashedInterface(value: ModuleGraphInterfaceArtifact | undefined): unknown {
	if (!value) return null;
	return {
		...value,
		render: {
			...value.render,
			components: value.render.components.map(({ armMaterial: _armMaterial, ...rest }) => rest),
		},
	};
}

export function prerenderInterfacesComplete(
	compiled: Pick<CompileTsrxModuleResult, 'semanticGraph'>,
	link: LinkedInterfaceCompleteness,
): boolean {
	return compiled.semanticGraph.componentEdges.every(
		(edge) =>
			!edge.importSource ||
			link.artifactChildMaterializations?.[edge.id] !== undefined ||
			link.importedModuleInterfaces?.[edge.importSource] !== undefined,
	);
}

export function linkedRenderDataBoundarySymbols(
	input: LinkedBoundarySymbolsInput,
): ReadonlyArray<LinkedBoundarySymbol> {
	if (
		!input.clientLink ||
		!input.compiled.publicRenderModule.renderDataModuleSource ||
		!prerenderInterfacesComplete(input.compiled, input.link)
	)
		return [];

	const emittedSymbolIds = new Set(
		input.compiled.symbolModules.modules.map((module) => module.symbolId),
	);
	const plannedSymbols = new Map(
		input.compiled.symbolResolver.symbols.map((symbol) => [symbol.id, symbol]),
	);
	const routes = componentEdgeSymbolRoutes(
		input.compiled,
		input.link.artifactChildMaterializations,
	);

	return input.compiled.protocolView.asyncBoundaries.flatMap((boundary, index) => {
		const symbolId = boundary.updateSymbolId;
		if (!symbolId || emittedSymbolIds.has(symbolId)) return [];
		const planned = plannedSymbols.get(symbolId);
		if (planned?.kind !== 'async-boundary-update') return [];

		const virtualModuleId = input.symbolModuleId(symbolId);
		const exportName = input.boundaryExportName(index);
		const row = { id: symbolId, chunk: virtualModuleId, exportName };
		return [
			{
				row,
				manifest: {
					symbolId,
					kind: 'async-boundary-update' as const,
					exportName,
					virtualModuleId,
				},
				module: {
					id: virtualModuleId,
					type: 'symbol' as const,
					symbolId,
					exportName,
					source: linkedRenderDataBoundarySymbolSource({
						boundaryId: boundary.id,
						exportName,
						renderDataId: input.renderDataId,
						resolverId: input.resolverId,
						routes,
					}),
				},
			},
		];
	});
}

function linkedRenderDataBoundarySymbolSource(input: {
	readonly boundaryId: string;
	readonly exportName: string;
	readonly renderDataId: string;
	readonly resolverId: string;
	readonly routes: ReadonlyArray<ComponentEdgeSymbolRoute>;
}): string {
	return [
		`import { marklessPrerenderData } from ${JSON.stringify(input.renderDataId)};`,
		`import { loadSymbol as marklessLoadLocalSymbol } from ${JSON.stringify(input.resolverId)};`,
		"import { renderPrerenderBoundary } from '@markless/web/fns/prerender-resume';",
		'function marklessLoadLinkedSymbol(symbolId) {',
		...input.routes.flatMap((route) => [
			`\tif (symbolId.startsWith(${JSON.stringify(route.prefix)})) {`,
			'importSource' in route
				? `\t\treturn import(${JSON.stringify(linkedRenderDataSymbolRouteSource(route.importSource))}).then((module) => module.loadSymbol(symbolId.slice(${route.prefix.length})));`
				: `\t\treturn marklessLoadLocalSymbol(symbolId.slice(${route.prefix.length}));`,
			'\t}',
		]),
		'\treturn marklessLoadLocalSymbol(symbolId);',
		'}',
		`export async function ${input.exportName}(context) {`,
		`\tconst rendered = await renderPrerenderBoundary(marklessPrerenderData, ${JSON.stringify(input.boundaryId)}, context.status, context.graph, marklessLoadLinkedSymbol);`,
		'\treturn { ...rendered, arm: context.status === "rejected" ? 2 : 0 };',
		'}',
	].join('\n');
}

function linkedRenderDataSymbolRouteSource(importSource: string): string {
	return importSource.includes('?')
		? `${importSource}&markless-symbols`
		: `${importSource}?markless-symbols`;
}

export function artifactChildCandidates(
	compiled: Pick<CompileTsrxModuleResult, 'publicRenderModule' | 'semanticGraph'>,
): ReadonlyArray<LinkedArtifactChild> {
	const definitions = compiled.publicRenderModule.componentDefinitions as ReadonlyArray<{
		readonly edges?: ReadonlyArray<{
			readonly id: string;
			readonly props: LinkedArtifactChild['props'];
			readonly projection?: LinkedArtifactChild['projection'];
		}>;
	}>;
	const definitionsByEdge = new Map(
		definitions.flatMap((definition) =>
			(definition.edges ?? []).map((edge) => [edge.id, edge] as const),
		),
	);
	return compiled.semanticGraph.componentEdges.flatMap((edge) => {
		if (!edge.importSource || !edge.importKind) return [];
		const definition = definitionsByEdge.get(edge.id);
		return definition
			? [
					{
						edgeId: edge.id,
						componentName: edge.childComponentName,
						importSource: edge.importSource,
						importKind: edge.importKind,
						...(edge.importedName ? { importedName: edge.importedName } : {}),
						hasChildren: edge.children.childCount > 0,
						props: definition.props,
						...(definition.projection ? { projection: definition.projection } : {}),
					},
				]
			: [];
	});
}
