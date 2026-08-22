import type {
	CaptureSlot,
	GeneratedSymbolModule,
	PublicRenderPlanAsyncBoundaryArms,
	PublicRenderPlanBranchArms,
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	RenderDataArtifact,
	RenderDataBranch,
	SemanticGraphArtifact,
	SemanticMarkupChunk,
	SemanticMarkupSlot,
	SemanticGraphDependency,
	SemanticModuleImport,
	SymbolModulesArtifact,
	SymbolModulesDiagnostic,
	SymbolModulesInput,
	SymbolResolverPlan,
} from '../artifacts.ts';
import { PROTOCOL_PROPS_GRAPH_NODE_ID } from '@markless/serializer';
import type { SourceSpan } from '../diagnostics.ts';
import {
	armChildDescent,
	type ArmChildProp,
	type ArmImportedInterfaces,
} from './arm-child-content.ts';
import { asNodes, isNode, type AnyNode } from '../ast/nodes.ts';
import {
	arrayNode,
	arrowFunctionNode,
	binaryNode,
	callNode,
	computedMemberNode,
	conditionalNode,
	constDeclarationNode,
	type EmissionNode,
	type EmissionPrintInput,
	type EmissionSite,
	exportNamedDeclarationNode,
	forStatementNode,
	functionDeclarationNode,
	graphDeleteCall,
	graphMethodCall,
	graphReadCall,
	graphScalarWriteCall,
	graphUpdateCall,
	graphWriteCall,
	identifierNode,
	ifStatementNode,
	jsonValueNode,
	letDeclarationNode,
	literalNode,
	logicalNode,
	memberChainNode,
	memberNode,
	moduleImportNode,
	moduleProgramNode,
	newNode,
	objectNode,
	optionalComputedMemberNode,
	optionalMemberNode,
	parseEmissionSource,
	postfixUpdateNode,
	printEmittedModule,
	propertyNode,
	returnStatementNode,
	shorthandPropertyNode,
	spreadNode,
	stringArrayNode,
	stringKeyPropertyNode,
	unaryNode,
	withLeadingBlockComment,
	type EmittedModule,
} from './emit-codegen.ts';
import { moduleScopeLines, SSR_CALLBACKS_PROP_NAME } from './public-render/shared.ts';

export function emitSymbolModules(input: SymbolModulesInput): SymbolModulesArtifact {
	const moduleDeclarations = sourceModuleScopeLines(input.source);
	const localNamesBySymbol = rowLocalNamesBySymbol(input.renderData);
	const captureSlotsBySymbol = new Map(
		input.captureAnalysis.extractedSymbols.flatMap((symbol) =>
			symbol.loaderSymbolId
				? []
				: [
						[
							symbol.symbolId,
							symbol.captureSlots.filter((slot) =>
								slot.routes.some(
									(route) =>
										route.componentEdgeId !== undefined ||
										// A composing module supplies this slot's edge.
										route.kind === 'widget-callback-route',
								),
							),
						] as const,
					],
		),
	);
	// A callback prop a widget answers a slot with is invoked with the dispatched
	// arguments, exactly like a directly bound callback route — the difference is
	// only that the runtime, not the compiler, names which symbol answers.
	const slotAnsweringEdges = input.captureAnalysis.extractedSymbols.flatMap((symbol) =>
		symbol.captureSlots.flatMap((slot) =>
			slot.routes.flatMap((route) =>
				route.kind === 'callback-slot-route'
					? [{ componentName: route.rootComponentName, propName: route.rootPropName }]
					: [],
			),
		),
	);
	const boundCallbackSymbolIds = new Set([
		...input.captureAnalysis.extractedSymbols.flatMap((symbol) =>
			symbol.captureSlots.flatMap((slot) =>
				slot.routes.flatMap((route) =>
					route.kind === 'callback-route' ? [route.callbackSymbolId] : [],
				),
			),
		),
		...(slotAnsweringEdges.length === 0
			? []
			: (input.symbolResolver?.symbols ?? []).flatMap((symbol) => {
					if (symbol.kind !== 'callback-prop') return [];
					const edge = (input.semanticGraph?.componentEdges ?? []).find(
						(candidate) => candidate.id === symbol.componentEdgeId,
					);
					return slotAnsweringEdges.some(
						(answered) =>
							answered.propName === symbol.propName &&
							answered.componentName === edge?.childComponentName,
					)
						? [symbol.id]
						: [];
				})),
	]);
	const unsupportedCaptureSymbolIds = new Set(
		input.captureAnalysis.extractedSymbols.flatMap((symbol) =>
			!symbol.loaderSymbolId && symbol.captureSlots.some((slot) =>
				slot.routes.some((route) => route.kind === 'unsupported-opaque'),
			)
				? [symbol.symbolId]
				: [],
		),
	);

	const asyncComputedNodeIds = asyncComputedGraphNodeIds(input.semanticGraph);
	const branchArms = renderBranchArms(input, asyncComputedNodeIds);
	const boundaryArmsById = renderBoundaryArms(input.renderData, asyncComputedNodeIds);
	const sourceFileName = input.source?.filename ?? 'markless-module.tsrx';
	const authoredSource = input.source?.source ?? '';
	return {
		passId: 'symbol-modules',
		modules: input.symbolResolver.symbols.flatMap((symbol) => {
			if (unsupportedCaptureSymbolIds.has(symbol.id)) return [];
			if (symbol.kind === 'branch-update') {
				const arms = branchArms.armsBySite.get(symbol.branchSiteId);
				if (!arms) return [];
				return [
					{
						symbolId: symbol.id,
						kind: symbol.kind,
						exportName: symbolExportName(symbol.id),
						source: emitBranchUpdateModuleNodes({ symbol, arms, sourceFileName, authoredSource })
							.code,
					},
				];
			}
			if (symbol.kind === 'async-boundary-update') {
				const arms = boundaryArmsById.get(symbol.boundaryId);
				if (!arms) return [];
				return [
					{
						symbolId: symbol.id,
						kind: symbol.kind,
						exportName: symbolExportName(symbol.id),
						source: emitAsyncBoundaryUpdateModuleNodes({
							symbol,
							arms,
							sourceFileName,
							authoredSource,
						}).code,
					},
				];
			}
			return emitSymbolModule(
				symbol,
				localNamesBySymbol.get(symbol.id) ?? emptyLocalNames,
				captureSlotsBySymbol.get(symbol.id) ?? [],
				boundCallbackSymbolIds.has(symbol.id),
				moduleDeclarations,
				input.semanticGraph?.moduleImports ?? [],
				input.semanticGraph,
				input.renderData,
				input.omitAuthoredSource === true,
				sourceFileName,
			);
		}),
		diagnostics: [...input.captureAnalysis.diagnostics, ...branchArms.diagnostics],
	};
}

function sourceModuleScopeLines(source: SymbolModulesInput['source']): string[] {
	if (!source) return [];
	try {
		return moduleScopeLines(source.source, source.filename);
	} catch {
		// The semantic pass owns parse diagnostics. Do not let this closure
		// projection replace its structured compile error with a raw parser error.
		return [];
	}
}

// A bare read of an async computed lands on the snapshot root, not the awaited
// result; lower it the way the view-record producer already does.
function asyncComputedGraphNodeIds(
	semanticGraph: SymbolModulesInput['semanticGraph'],
): ReadonlySet<string> {
	return new Set(
		(semanticGraph?.graphBindings ?? []).flatMap((binding) =>
			binding.kind === 'computed' && binding.async === true ? [binding.id] : [],
		),
	);
}

function armPartReadPath(
	graphNodeId: string,
	path: ReadonlyArray<string>,
	asyncComputedNodeIds: ReadonlySet<string>,
): ReadonlyArray<string> {
	return path.length === 0 && asyncComputedNodeIds.has(graphNodeId) ? ['value'] : path;
}

// The first refusal recorded for a branch is the one its diagnostic reports.
type ArmRefusal = {
	readonly detail: string;
	readonly span?: SourceSpan;
};

type ArmPartsContext = {
	readonly renderData: RenderDataArtifact;
	readonly asyncComputedNodeIds: ReadonlySet<string>;
	// Branch flips only: boundary arms re-render through a module that can run components.
	readonly inline?: {
		readonly semanticGraph: SemanticGraphArtifact;
		readonly symbolResolver: SymbolResolverPlan;
		readonly importedInterfaces?: ArmImportedInterfaces;
	};
	readonly refusals?: ArmRefusal[];
};

function renderBranchArms(
	input: SymbolModulesInput,
	asyncComputedNodeIds: ReadonlySet<string>,
): {
	readonly armsBySite: ReadonlyMap<string, PublicRenderPlanBranchArms>;
	readonly diagnostics: ReadonlyArray<SymbolModulesDiagnostic>;
} {
	const renderData = input.renderData;
	if (!renderData) return { armsBySite: new Map(), diagnostics: [] };
	const armsBySite = new Map<string, PublicRenderPlanBranchArms>();
	const diagnostics: SymbolModulesDiagnostic[] = [];
	for (const branch of renderData.branches ?? []) {
		if (branch.update === 'boundary') continue;
		const refusals: ArmRefusal[] = [];
		const context: ArmPartsContext = {
			renderData,
			asyncComputedNodeIds,
			...(input.semanticGraph
				? {
						inline: {
							semanticGraph: input.semanticGraph,
							symbolResolver: input.symbolResolver,
							...(input.source?.importedModuleInterfaces
								? { importedInterfaces: input.source.importedModuleInterfaces }
								: {}),
						},
					}
				: {}),
			refusals,
		};
		const arms = branch.armChunkIds.map((chunkId) => renderChunkParts(context, chunkId));
		if (arms.some((arm) => arm === null)) {
			// A branch nobody asks to flip ships no symbol, so it needs no diagnostic.
			const symbol = input.symbolResolver.symbols.find(
				(candidate) =>
					candidate.kind === 'branch-update' &&
					candidate.branchSiteId === branch.branchSiteId,
			);
			if (symbol)
				diagnostics.push(branchArmUnsupportedDiagnostic(branch, refusals[0], symbol.id));
			continue;
		}
		armsBySite.set(branch.branchSiteId, {
			branchSiteId: branch.branchSiteId,
			testRead: branch.testReads[0] ?? null,
			arms: arms as PublicRenderPlanBranchArms['arms'],
			...(branch.armTests ? { armTests: branch.armTests } : {}),
			...(branch.declaredEmptyArms ? { declaredEmptyArms: branch.declaredEmptyArms } : {}),
		});
	}
	return { armsBySite, diagnostics };
}

function branchArmUnsupportedDiagnostic(
	branch: RenderDataBranch,
	refusal: ArmRefusal | undefined,
	symbolId: string,
): SymbolModulesDiagnostic {
	const label = branch.kind === 'switch' ? '@switch' : '@if';
	const detail = refusal?.detail ?? 'it holds content that has no compiled markup';
	// A prop is the caller's to change, and a caller that never changes it ships
	// correctly today, so only a test this file can write blocks the build.
	const decidedByProp = branch.testReads.every((read) => read.graphNodeId.startsWith('prop:'));
	return {
		code: 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		severity: decidedByProp ? 'warning' : 'error',
		phase: 'public-render',
		title: `Changing this ${label} cannot rebuild what it shows`,
		message: `this ${label} (${branch.testSource}) cannot be rebuilt when ${branch.testSource} changes because ${detail}.`,
		why: 'Showing or hiding this content replaces it wholesale from compiled markup plus value reads. A component is rebuilt from the markup its own file compiled, so one that brings state of its own, shows a function it was handed, or — when it comes from another file — shows a value that keeps changing while it is shown has nothing left to be rebuilt from, and the browser would ask for code the build never wrote. That failure stops every other update in the same component.',
		...(refusal?.span ? { primarySpan: refusal.span } : {}),
		passId: 'symbol-modules',
		artifactKeys: ['renderData', 'symbolResolver', 'symbolModules'],
		symbolId,
		source: branch.testSource,
		suggestions: [
			{
				message: `Move the component outside the ${label} and hide it with an attribute, lift its state up to the component that owns the ${label}, or keep the ${label} content to plain elements, text, and state reads.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	};
}

function renderBoundaryArms(
	renderData: RenderDataArtifact | undefined,
	asyncComputedNodeIds: ReadonlySet<string>,
): ReadonlyMap<string, PublicRenderPlanAsyncBoundaryArms> {
	if (!renderData) return new Map();
	return new Map((renderData.boundaries ?? []).flatMap((boundary) => {
		const chunkIds = [boundary.armChunkIds.try, boundary.armChunkIds.catch].filter(
			(candidate): candidate is string => candidate !== undefined,
		);
		const arms = chunkIds.map((chunkId) =>
			renderChunkParts({ renderData, asyncComputedNodeIds }, chunkId),
		);
		if (arms.some((arm) => arm === null)) return [];
		return [[boundary.boundaryId, {
			boundaryId: boundary.boundaryId,
			arms: arms as PublicRenderPlanAsyncBoundaryArms['arms'],
		}] as const];
	}));
}

function renderChunkParts(
	context: ArmPartsContext,
	chunkId: string,
	scope?: ArmPropScope,
	// Set while rendering the markup of a child component spliced into the arm.
	child?: ArmChildScope,
): PublicRenderPlanBranchArms['arms'][number] | null {
	const { renderData, asyncComputedNodeIds } = context;
	const refuse = (detail: string, span?: SourceSpan) => {
		context.refusals?.push({ detail, ...(span ? { span } : {}) });
		return null;
	};
	const chunk = (child?.chunks ?? renderData.chunks).find((candidate) => candidate.id === chunkId);
	if (!chunk) return refuse('its content has no compiled markup');
	const parts: Array<PublicRenderPlanBranchArms['arms'][number][number]> = [];
	const pushText = (text: string) => {
		const clean = text.replace(/<!--markless-slot:\d+-->/g, '');
		if (!clean) return;
		const last = parts[parts.length - 1];
		if (last && 'text' in last) parts[parts.length - 1] = { text: last.text + clean };
		else parts.push({ text: clean });
	};
	for (let staticIndex = 0; staticIndex < chunk.statics.length; staticIndex++) {
		pushText(chunk.statics[staticIndex] ?? '');
		for (const slot of chunk.slots.filter((candidate) => candidate.staticIndex === staticIndex)) {
			if (slot.kind === 'text' && slot.residue.kind === 'graph-read') {
				const scoped = scopedPropPart(scope, slot.residue.graphNodeId, slot.residue.path);
				if (scoped === 'unsupported')
					return refuse('a value it shows comes from a prop the flip cannot recompute');
				// A value inside an imported child refreshes through records that
				// module owns, and this module cannot address them, so only a value
				// that is already decided may be shown there.
				if (child?.imported && (!scoped || 'read' in scoped))
					return refuse(
						`<${child.componentName}> shows a value that changes after it is shown`,
					);
				if (scoped) {
					if ('text' in scoped) pushText(scoped.text);
					else parts.push(scoped);
					continue;
				}
				parts.push({ read: {
					graphNodeId: slot.residue.graphNodeId,
					path: armPartReadPath(
						slot.residue.graphNodeId,
						slot.residue.path,
						asyncComputedNodeIds,
					),
				} });
				continue;
			}
			if (slot.kind === 'child-component') {
				if (child?.imported)
					return refuse(`<${child.componentName}> shows a component of its own`);
				const childParts = childComponentParts(context, slot);
				if (childParts === null)
					return refuse(
						`<${slot.childComponentName}> has to run to produce its content`,
						componentEdgeSpan(context, slot.componentEdgeId),
					);
				for (const part of childParts) {
					if ('text' in part) pushText(part.text);
					else parts.push(part);
				}
				continue;
			}
			if (slot.kind === 'repeat') {
				const repeat = renderData.repeats.find((candidate) => candidate.repeatId === slot.repeatId);
				const row = repeat ? renderData.chunks.find((candidate) => candidate.id === repeat.rowChunkId) : undefined;
				if (!repeat?.collectionGraphNodeId || !row)
					return refuse('it repeats over a collection with no compiled row');
				const rowParts: Array<{ text: string } | { read: { graphNodeId: string; path: ReadonlyArray<string> } } | { itemPath: ReadonlyArray<string> }> = [];
				for (let rowIndex = 0; rowIndex < row.statics.length; rowIndex++) {
					const text = (row.statics[rowIndex] ?? '').replace(/<!--markless-slot:\d+-->/g, '');
					if (text) rowParts.push({ text });
					for (const rowSlot of row.slots.filter((candidate) => candidate.staticIndex === rowIndex)) {
						if (rowSlot.kind !== 'text')
							return refuse(`a repeated row inside it holds a ${rowSlot.kind} binding`);
						if (rowSlot.residue.kind === 'repeat-item') rowParts.push({ itemPath: rowSlot.residue.path });
						else if (rowSlot.residue.kind === 'graph-read') rowParts.push({ read: { graphNodeId: rowSlot.residue.graphNodeId, path: armPartReadPath(rowSlot.residue.graphNodeId, rowSlot.residue.path, asyncComputedNodeIds) } });
						else return refuse('a repeated row inside it reads a value that cannot be recomputed');
					}
				}
				parts.push({ repeat: {
					read: { graphNodeId: repeat.collectionGraphNodeId, path: repeat.collectionPath },
					rowParts,
				} });
				continue;
			}
			return refuse(`it holds a ${slot.kind} binding`);
		}
	}
	return parts;
}

// One prop name to the value a flip rebuilds the child's markup with.
type ArmPropScope = ReadonlyMap<string, ArmChildProp>;

// The child component whose own markup is being spliced into the arm.
type ArmChildScope = {
	readonly chunks: ReadonlyArray<SemanticMarkupChunk>;
	readonly imported: boolean;
	readonly componentName: string;
};

/**
 * The part a scoped prop read contributes, `null` when the read is not a prop
 * (the caller keeps its own graph read), `'unsupported'` when the flip cannot
 * answer it.
 */
function scopedPropPart(
	scope: ArmPropScope | undefined,
	graphNodeId: string,
	path: ReadonlyArray<string>,
): { readonly text: string } | { readonly read: { graphNodeId: string; path: ReadonlyArray<string> } } | 'unsupported' | null {
	if (!scope) return null;
	const name = graphNodeId === 'prop:props' ? path[0] : graphNodeId.slice('prop:'.length);
	const rest = graphNodeId === 'prop:props' ? path.slice(1) : path;
	if (!graphNodeId.startsWith('prop:') || name === undefined) return null;
	const prop = scope.get(name);
	// A name the caller never passed is a static undefined, which renders empty.
	if (!prop) return { text: '' };
	if (prop.kind === 'unreadable') return 'unsupported';
	if (prop.kind === 'read')
		return { read: { graphNodeId: prop.graphNodeId, path: [...prop.path, ...rest] } };
	let value: unknown = prop.value;
	for (const segment of rest) {
		if (value === null || value === undefined) return { text: '' };
		if (typeof value !== 'object') return 'unsupported';
		value = (value as Record<string, unknown>)[segment];
	}
	if (value !== null && typeof value === 'object') return 'unsupported';
	return { text: armTextEscape(value) };
}

function armTextEscape(value: unknown): string {
	return ARM_TEXT_ESCAPES.reduce(
		(text, [from, to]) => text.replaceAll(from, to),
		value === null || value === undefined ? '' : String(value),
	);
}

/**
 * The parts a child component contributes to the arm its parent rebuilds.
 *
 * The child's markup is render data like any other chunk, so a flip rebuilds it
 * from the child's own statics and reads with the caller's props substituted in.
 * Falls back to the older constant-string admission so a child this descent
 * cannot express keeps compiling exactly as it did.
 */
function childComponentParts(
	context: ArmPartsContext,
	slot: Extract<SemanticMarkupSlot, { readonly kind: 'child-component' }>,
): PublicRenderPlanBranchArms['arms'][number] | null {
	const descent = armChildDescent(
		context.renderData,
		context.inline?.semanticGraph,
		slot,
		context.inline?.importedInterfaces,
	);
	if (descent) {
		const parts = renderChunkParts(context, descent.chunkId, descent.props, {
			chunks: descent.chunks,
			imported: descent.imported,
			componentName: slot.childComponentName,
		});
		if (parts) return parts;
	}
	const markup = staticChildComponentMarkup(context, slot);
	return markup === null ? null : [{ text: markup }];
}

// A child a flip can rebuild without running it: one constant string, wired to nothing.
function staticChildComponentMarkup(
	context: ArmPartsContext,
	slot: Extract<SemanticMarkupSlot, { readonly kind: 'child-component' }>,
): string | null {
	const semanticGraph = context.inline?.semanticGraph;
	if (!semanticGraph || slot.projectionChunkId) return null;
	const edge = semanticGraph.componentEdges.find(
		(candidate) => candidate.id === slot.componentEdgeId,
	);
	if (!edge || edge.importSource || edge.props.length > 0 || edge.children.childCount > 0)
		return null;
	if (
		semanticGraph.graphBindings.some(
			(binding) => binding.componentName === edge.childComponentName,
		)
	)
		return null;
	const chunk = context.renderData.chunks.find(
		(candidate) => candidate.id === slot.childTemplateId,
	);
	if (!chunk || chunk.slots.length > 0) return null;
	const hostNodeIds = new Set(chunk.hosts.map((host) => host.hostNodeId));
	const wired = [
		...semanticGraph.events,
		...semanticGraph.behaviors,
		...semanticGraph.overlays,
		...semanticGraph.elementHandleBindings,
		...context.inline.symbolResolver.symbols,
	].some(
		(record) =>
			'hostNodeId' in record &&
			typeof record.hostNodeId === 'string' &&
			hostNodeIds.has(record.hostNodeId),
	);
	return wired ? null : chunk.statics.join('');
}

function componentEdgeSpan(
	context: ArmPartsContext,
	componentEdgeId: string,
): SourceSpan | undefined {
	return context.inline?.semanticGraph.componentEdges.find(
		(candidate) => candidate.id === componentEdgeId,
	)?.sourceSpan;
}

const emptyLocalNames = new Set<string>();

function rowLocalNamesBySymbol(
	renderData: RenderDataArtifact | undefined,
): ReadonlyMap<string, ReadonlySet<string>> {
	const localNamesBySymbol = new Map<string, Set<string>>();
	const addLocal = (symbolId: string, itemName: string): void => {
		let localNames = localNamesBySymbol.get(symbolId);
		if (!localNames) {
			localNames = new Set();
			localNamesBySymbol.set(symbolId, localNames);
		}
		localNames.add(itemName);
	};
	if (renderData) {
		for (const repeat of renderData.repeats) {
			const rowHostIds = renderChunkHostIds(renderData, repeat.rowChunkId);
			for (const interaction of renderData.interactions) {
				if (!rowHostIds.has(interaction.hostNodeId)) continue;
				for (const symbolId of interaction.symbolIds) addLocal(symbolId, repeat.itemName);
			}
		}
	}
	return localNamesBySymbol;
}

// Row modules execute outside the authored @for callback. The repeat runtime
// supplies the item through context.locals, so symbols owned by a row chunk
// must retain that existing capture context even when the legacy public plan
// has no top-level record for an async-arm repeat.
function renderChunkHostIds(
	renderData: RenderDataArtifact,
	chunkId: string,
	seen = new Set<string>(),
): ReadonlySet<string> {
	if (seen.has(chunkId)) return new Set();
	seen.add(chunkId);
	const chunk = renderData.chunks.find((candidate) => candidate.id === chunkId);
	const hostIds = new Set((chunk?.hosts ?? []).map((host) => host.hostNodeId));
	for (const slot of chunk?.slots ?? []) {
		const childChunkIds =
			slot.kind === 'branch'
				? slot.armTemplateIds
				: slot.kind === 'repeat'
					? [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])]
					: slot.kind === 'async'
						? Object.values(slot.armTemplateIds).filter(
								(candidate): candidate is string => candidate !== undefined,
							)
						: slot.kind === 'child-component'
							? [slot.childTemplateId]
							: slot.kind === 'dynamic-host'
								? [slot.childChunkId]
								: [];
		for (const childChunkId of childChunkIds) {
			for (const hostId of renderChunkHostIds(renderData, childChunkId, seen)) hostIds.add(hostId);
		}
	}
	return hostIds;
}

function emitSymbolModule(
	symbol: PlannedSymbol,
	localNames: ReadonlySet<string>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	usesArgumentVector: boolean,
	moduleDeclarations: readonly string[],
	moduleImports: readonly SemanticModuleImport[],
	semanticGraph: SymbolModulesInput['semanticGraph'],
	renderData: SymbolModulesInput['renderData'],
	omitAuthoredSource: boolean,
	sourceFileName: string,
): GeneratedSymbolModule[] {
	if (symbol.kind === 'sync-computed-derive') {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitSyncComputedDeriveModule(symbol, captureSlots, omitAuthoredSource),
			},
		];
	}

	const emitted = emitSymbolModuleNodes({
		symbol,
		moduleDeclarations,
		moduleImports,
		captureSlots,
		semanticGraph,
		renderData,
		omitAuthoredSource,
		sourceFileName,
		localNames,
		usesArgumentVector,
	});
	if (!emitted) return [];

	return [
		{
			symbolId: symbol.id,
			kind: symbol.kind,
			exportName: symbolExportName(symbol.id),
			source: emitted.code,
		},
	];
}

function callbackCaptureSlot(slot: CaptureSlot): boolean {
	return slot.routes.some(
		(route) => route.kind === 'callback-route' || route.kind === 'widget-callback-route',
	);
}

function captureSlotMatchesRead(slot: CaptureSlot, read: LoweredStateRead): boolean {
	if (read.bindingId && slot.bindingId !== read.bindingId) return false;
	if (slot.sourceSpan && read.sourceSpan) {
		return (
			slot.sourceSpan.filename === read.sourceSpan.filename &&
			slot.sourceSpan.start === read.sourceSpan.start &&
			slot.sourceSpan.end === read.sourceSpan.end
		);
	}
	return slot.source === read.source;
}

function isValuePositionGraphRead(node: AnyNode, parent: AnyNode | undefined): boolean {
	if (node.type !== 'Identifier' || !parent) return true;

	if (parent.type === 'Property') {
		const key = parent.key as AnyNode | undefined;
		if (key === node && parent.computed !== true && parent.shorthand !== true) return false;
	}

	if (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') {
		const property = parent.property as AnyNode | undefined;
		if (property === node && parent.computed !== true) return false;
	}

	return true;
}

function isGraphReadExpression(node: AnyNode): boolean {
	return (
		node.type === 'Identifier' ||
		node.type === 'MemberExpression' ||
		node.type === 'ChainExpression'
	);
}

// ---------------------------------------------------------------------------
// DOM-binding emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2 —
// the last of the low-risk emitters. This band builds nodes and prints them
// through `emit-codegen.ts`; it calls nothing in the string-scanner band that
// invariant 5 keeps alive until the stage's final unit.
//
// It is not the wired path. `emitDomBindingModule` below still emits the
// spliced string the compiler ships, and `test/emit-dom-binding.test.ts` runs
// both over the same symbols and records exactly where the printed bytes differ
// from the spliced ones. The printer normalizes rather than preserves, so the
// two are behaviorally equal and not byte-equal, and invariant 2 makes the swap
// an owner-approved step rather than a side effect of this unit.
//
// This site synthesizes its whole module from render data — no authored text is
// spliced into it — so the emitted source map is non-null and names the authored
// file (invariant 3) but carries no segments. There is no honest mapping to
// carry: the emitted `context.value` is not the authored expression's text.
// ---------------------------------------------------------------------------

export type DomBindingEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>;
	/** The authored file the binding was extracted from; names the map. */
	readonly sourceFileName: string;
};

type DomUpdateTarget = Extract<PlannedSymbol, { readonly kind: 'dom-update' }>['target'];
type DomTextTarget = Extract<DomUpdateTarget, { readonly kind: 'text' }>;

/**
 * Build the print input for a DOM-binding module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildDomBindingEmission(input: DomBindingEmissionInput): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const body = isPlainTextUpdateLeaf(input.symbol.target)
		? domTextLeafBody(exportName, input.symbol.hostNodeId)
		: [
				exportNamedDeclarationNode(
					functionDeclarationNode(
						exportName,
						['context'],
						[returnStatementNode(domJournalEntryNode(input.symbol))],
					),
				),
			];

	return {
		program: moduleProgramNode(body),
		source: input.symbol.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed DOM-binding module, with its source map (invariant 3). */
export function emitDomBindingModuleNodes(input: DomBindingEmissionInput): EmittedModule {
	return printEmittedModule(buildDomBindingEmission(input));
}

/**
 * The one target shape that emits a runtime call instead of a journal entry.
 *
 * Stated separately from `emitDomBindingModule`'s inline condition rather than
 * extracted out of it: the string path stays byte-for-byte as it is until the
 * swap, so the two conditions are duplicated on purpose while parity is still
 * accumulating. `test/emit-dom-binding.test.ts` covers both branches on the
 * same fixtures, so a divergence between them fails a test rather than hiding.
 */
function isPlainTextUpdateLeaf(target: DomUpdateTarget): boolean {
	return (
		target.kind === 'text' &&
		target.prefix === undefined &&
		target.suffix === undefined &&
		target.trueValue === undefined &&
		target.falseValue === undefined
	);
}

function domTextLeafBody(exportName: string, hostNodeId: string): EmissionNode[] {
	return [
		moduleImportNode({
			kind: 'named',
			localName: 'marklessUpdateText',
			source: '@markless/web/fns/update-text',
		}),
		withLeadingBlockComment(
			exportNamedDeclarationNode(
				functionDeclarationNode(
					exportName,
					['context'],
					[
						returnStatementNode(
							callNode(identifierNode('marklessUpdateText'), [
								identifierNode('context'),
								literalNode(hostNodeId),
							]),
						),
					],
				),
			),
			' text update leaf marker: type: "setText" ',
		),
	];
}

/** The AST twin of `domJournalEntryProperties`, property for property. */
function domJournalEntryNode(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
): EmissionNode {
	const locator = domLocatorNode(symbol.hostNodeId);
	const target = symbol.target;

	if (target.kind === 'text') {
		return objectNode([
			propertyNode('type', literalNode('setText')),
			propertyNode('locator', locator),
			propertyNode('value', textDomUpdateValueNode(target)),
		]);
	}

	if (target.kind === 'property') {
		return objectNode([
			propertyNode('type', literalNode('setProp')),
			propertyNode('locator', locator),
			propertyNode('name', literalNode(target.name)),
			propertyNode('value', domUpdateValueNode()),
		]);
	}

	if (target.kind === 'class') {
		return objectNode([
			propertyNode('type', literalNode('setAttr')),
			propertyNode('locator', locator),
			propertyNode('name', literalNode('class')),
			propertyNode(
				'value',
				target.trueValue !== undefined && target.falseValue !== undefined
					? conditionalNode(
							domUpdateValueNode(),
							literalNode(target.trueValue),
							literalNode(target.falseValue),
						)
					: domUpdateValueNode(),
			),
		]);
	}

	return objectNode([
		propertyNode('type', literalNode('setAttr')),
		propertyNode('locator', locator),
		propertyNode('name', literalNode(target.kind === 'style' ? 'style' : target.name)),
		propertyNode('value', domUpdateValueNode()),
	]);
}

/** `context.domUpdate?.hostNodeId ?? "<hostNodeId>"`. */
function domLocatorNode(hostNodeId: string): EmissionNode {
	return logicalNode(
		'??',
		optionalMemberNode(memberChainNode('context.domUpdate'), 'hostNodeId'),
		literalNode(hostNodeId),
	);
}

/**
 * `context.value`, built fresh per use.
 *
 * A shared node object would appear at two places in one tree, which prints the
 * same but makes the tree a graph rather than a tree — every walker over it
 * (the TSRX assertion included) would then have to decide whether a second
 * visit is a cycle.
 */
function domUpdateValueNode(): EmissionNode {
	return memberChainNode('context.value');
}

/** The AST twin of `textDomUpdateValueSource`. */
function textDomUpdateValueNode(target: DomTextTarget): EmissionNode {
	const conditional = (): EmissionNode | null =>
		target.trueValue !== undefined && target.falseValue !== undefined
			? conditionalNode(
					domUpdateValueNode(),
					literalNode(target.trueValue),
					literalNode(target.falseValue),
				)
			: null;

	if (target.prefix === undefined && target.suffix === undefined) {
		return conditional() ?? domUpdateValueNode();
	}

	// The text path parenthesizes the conditional before reusing it twice; the
	// printer derives the parentheses the grammar needs, so none are built here.
	const base = (): EmissionNode => conditional() ?? domUpdateValueNode();

	return binaryNode(
		'+',
		binaryNode(
			'+',
			literalNode(target.prefix ?? ''),
			conditionalNode(
				binaryNode('==', base(), literalNode(null)),
				literalNode(''),
				callNode(identifierNode('String'), [base()]),
			),
		),
		literalNode(target.suffix ?? ''),
	);
}

// Nothing reads this export at runtime; consumer builds drop it rather than
// ship one authored-source string per symbol chunk.
function authoredSourceLines(source: string, omit: boolean): string[] {
	return omit ? [] : [`export const authoredSource = ${JSON.stringify(source)};`];
}

export function canEmitBehaviorModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'behavior' }>,
): boolean {
	if (symbol.moduleImport) return true;

	return isInlineFunctionSource(symbol.functionSource);
}

function isInlineFunctionSource(source: string): boolean {
	const trimmed = source.trim();
	if (trimmed.startsWith('function') || trimmed.startsWith('async function')) return true;

	return trimmed.includes('=>');
}

// ---------------------------------------------------------------------------
// Behavior emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2.
// This band builds nodes and prints them through `emit-codegen.ts`. It calls
// nothing in the string-scanner band (`topLevelBinaryOperators` through
// `sourceReferencesIdentifier`), which invariant 5 keeps alive until the
// stage's final unit but which a migrated site may not call. The behavior
// emitter never reached that band in the first place: its only authored input
// is `functionSource`, which the text path splices whole.
//
// It is not yet the wired path. `emitBehaviorModule` above still produces the
// bytes the compiler ships; `test/emit-behavior.test.ts` runs both paths over
// the same inputs and records where the printed bytes differ from the spliced
// ones. The printer normalizes rather than preserves, so the two are
// behaviorally equal and not byte-equal, and invariant 2 makes the swap an
// owner-approved step rather than a side effect of this unit.
// ---------------------------------------------------------------------------

export type BehaviorEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'behavior' }>;
	readonly omitAuthoredSource: boolean;
	/** The authored file the behavior was extracted from; names the map. */
	readonly sourceFileName: string;
};

/**
 * Build the print input for a behavior module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildBehaviorEmission(input: BehaviorEmissionInput): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const inputCount = input.symbol.inputSources.length;
	const projection = behaviorProjection(input.symbol.functionSource, input.sourceFileName);

	const body: EmissionNode[] = [
		...(input.symbol.moduleImport
			? [
					moduleImportNode({
						kind: input.symbol.moduleImport.kind,
						localName: input.symbol.moduleImport.localName,
						importedName: input.symbol.moduleImport.importedName,
						source: input.symbol.moduleImport.source,
					}),
				]
			: []),
		...(input.omitAuthoredSource
			? []
			: [
					exportNamedDeclarationNode(
						constDeclarationNode('authoredSource', literalNode(input.symbol.source)),
					),
				]),
		exportNamedDeclarationNode(
			constDeclarationNode(
				'behaviorFunctionSource',
				literalNode(input.symbol.functionSource),
			),
		),
		exportNamedDeclarationNode(
			constDeclarationNode(
				'behaviorInputSources',
				stringArrayNode(input.symbol.inputSources),
			),
		),
		exportNamedDeclarationNode(
			functionDeclarationNode(exportName, ['context'], [
				constDeclarationNode('inputs', behaviorInputsExpression(inputCount)),
				constDeclarationNode(
					'behavior',
					inputCount > 0
						? callNode(projection.functionExpression, [
								spreadNode(identifierNode('inputs')),
							])
						: projection.functionExpression,
				),
				returnStatementNode(
					callNode(identifierNode('behavior'), [memberChainNode('context.element')]),
				),
			]),
		),
	];

	return {
		program: moduleProgramNode(body),
		source: projection.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed behavior module, with its source map (invariant 3). */
export function emitBehaviorModuleNodes(input: BehaviorEmissionInput): EmittedModule {
	return printEmittedModule(buildBehaviorEmission(input));
}

/**
 * `context.behaviorInputs ?? new Array(n).fill(undefined)`, or `[]` when the
 * behavior takes no inputs — the two forms the text path writes today.
 *
 * The zero-input form is a separate branch rather than `new Array(0).fill(...)`
 * because the text path emits a literal `[]` there, and this band's job is to
 * reproduce that behavior, not to improve on it.
 */
function behaviorInputsExpression(inputCount: number): EmissionNode {
	if (inputCount === 0) return arrayNode([]);

	return logicalNode(
		'??',
		memberChainNode('context.behaviorInputs'),
		callNode(
			memberNode(newNode(identifierNode('Array'), [literalNode(inputCount)]), 'fill'),
			[identifierNode('undefined')],
		),
	);
}

type BehaviorProjection = {
	/** The one text every printed node carries an offset into. */
	readonly source: string;
	readonly functionExpression: EmissionNode;
};

/**
 * Parse the authored behavior factory once, as an expression.
 *
 * The factory is parenthesized so it parses as an expression statement in every
 * authored form — a `function` at statement start would otherwise be a
 * declaration, and the text path wraps it in parentheses for the same reason
 * (`callableBehaviorFunctionSource`). `preserveParens: false` then drops the
 * wrapper, and the printer re-derives whatever parentheses calling the factory
 * actually needs.
 */
function behaviorProjection(functionSource: string, filename: string): BehaviorProjection {
	const source = `(${functionSource});`;
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) {
		throw new Error(
			`symbol-modules: behavior emission could not parse its factory source (${errors
				.map((error) => error.message)
				.join('; ')})`,
		);
	}

	const statements = asNodes((program as unknown as AnyNode).body);
	const last = statements.at(-1);
	if (
		statements.length !== 1 ||
		!last ||
		last.type !== 'ExpressionStatement' ||
		!isNode(last.expression)
	) {
		throw new Error(
			'symbol-modules: behavior emission expected its factory source to be a single expression',
		);
	}

	return { source, functionExpression: last.expression as unknown as EmissionNode };
}

// ---------------------------------------------------------------------------
// State-initializer emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2.
// This band builds nodes and prints them through `emit-codegen.ts`. It reaches
// into nothing in the string-scanner band (lines "topLevelBinaryOperators
// through sourceReferencesIdentifier"), which invariant 5 keeps alive until the
// stage's final unit but which a migrated site may not call.
//
// It is not yet the wired path. `test/emit-state-initializer.test.ts` runs both
// paths over the same inputs and records exactly where the printed bytes differ
// from the spliced ones; the printer normalizes, so the two are behaviorally
// equal and not byte-equal, and invariant 2 makes the swap an owner-approved
// step rather than a side effect of this unit.
// ---------------------------------------------------------------------------

/** A component prop the initializer reads, before it becomes a graph read. */
export type StateInitializerPropRead = {
	readonly localName: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	/** The authored expression a destructuring default supplies, when it has one. */
	readonly defaultSource?: string;
};

export type StateInitializerEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'state-initializer' }>;
	readonly moduleDeclarations: readonly string[];
	readonly moduleImports: readonly SemanticModuleImport[];
	readonly propReads: ReadonlyArray<StateInitializerPropRead>;
	readonly omitAuthoredSource: boolean;
	/** The authored file the initializer was extracted from; names the map. */
	readonly sourceFileName: string;
};

/**
 * Build the print input for a state-initializer module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildStateInitializerEmission(
	input: StateInitializerEmissionInput,
): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const declarations = referencedModuleDeclarationSources(
		input.symbol.source,
		input.moduleDeclarations,
		input.sourceFileName,
	);
	const projection = stateInitializerProjection(
		declarations,
		input.symbol.source,
		input.sourceFileName,
	);
	const referencedNames = referencedIdentifierNames(projection.program as unknown as AnyNode);
	const imports = dedupeModuleImports([
		...(input.symbol.moduleImports ?? []),
		...input.moduleImports.filter((moduleImport) => referencedNames.has(moduleImport.localName)),
	]);

	const body: EmissionNode[] = [
		...imports.map((moduleImport) =>
			moduleImportNode({
				kind: moduleImport.kind,
				localName: moduleImport.localName,
				importedName: moduleImport.importedName,
				source: moduleImport.source,
			}),
		),
		...projection.declarationStatements,
		...(input.omitAuthoredSource
			? []
			: [
					exportNamedDeclarationNode(
						constDeclarationNode('authoredSource', literalNode(input.symbol.source)),
					),
				]),
		exportNamedDeclarationNode(
			functionDeclarationNode(
				exportName,
				input.propReads.length > 0 ? ['context'] : [],
				[
					...input.propReads.flatMap((propRead) =>
						stateInitializerPropReadStatements(propRead, input.sourceFileName),
					),
					returnStatementNode(projection.initializerExpression),
				],
			),
		),
	];

	return {
		program: moduleProgramNode(body),
		source: projection.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed state-initializer module, with its source map (invariant 3). */
export function emitStateInitializerModuleNodes(
	input: StateInitializerEmissionInput,
): EmittedModule {
	return printEmittedModule(buildStateInitializerEmission(input));
}

// ---------------------------------------------------------------------------
// Shared-seed emission through the AST printer.
//
// A component body assigning into its shared instance (`s.disabled =
// props.disabled`) seeds that component's own instance. The seed replaces the
// node's whole value, so a property assignment returns the current value with
// that property merged in: the factory initial survives every field the body did
// not assign and is overwritten by every field it did.
// ---------------------------------------------------------------------------

export type SharedSeedEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'shared-seed' }>;
	readonly propReads: ReadonlyArray<StateInitializerPropRead>;
	/** The authored file the seed was extracted from; names the map. */
	readonly sourceFileName: string;
};

export function buildSharedSeedEmission(input: SharedSeedEmissionInput): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const imports = dedupeModuleImports(input.symbol.moduleImports ?? []);
	const seedLocal = 'marklessSharedSeed';
	// A callback slot's value is the composing edge's own answer, handed to this
	// root among its props; there is no authored expression to read.
	if (input.symbol.callbackSlotPropName !== undefined) {
		return {
			program: moduleProgramNode([
				exportNamedDeclarationNode(
					functionDeclarationNode(exportName, ['context'], [
						returnStatementNode(
							callNode(memberChainNode('context.graph.read'), [
								literalNode(PROTOCOL_PROPS_GRAPH_NODE_ID),
								stringArrayNode([
									SSR_CALLBACKS_PROP_NAME,
									input.symbol.callbackSlotPropName,
								]),
							]),
						),
					]),
				),
			]),
			source: input.symbol.source,
			outputFileName: `${exportName}.js`,
			site,
		};
	}
	const body: EmissionNode[] = [
		...imports.map((moduleImport) =>
			moduleImportNode({
				kind: moduleImport.kind,
				localName: moduleImport.localName,
				importedName: moduleImport.importedName,
				source: moduleImport.source,
			}),
		),
		exportNamedDeclarationNode(
			functionDeclarationNode(exportName, ['context'], [
				...input.propReads.flatMap((propRead) =>
					stateInitializerPropReadStatements(propRead, input.sourceFileName),
				),
				constDeclarationNode(
					seedLocal,
					expressionFromSource(input.symbol.source, input.sourceFileName),
				),
				returnStatementNode(
					sharedSeedValueNode(
						() =>
							callNode(memberChainNode('context.graph.read'), [
								literalNode(input.symbol.graphNodeId),
								stringArrayNode([]),
							]),
						input.symbol.path,
						identifierNode(seedLocal),
					),
				),
			]),
		),
	];

	return {
		program: moduleProgramNode(body),
		source: input.symbol.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

// `read` is a factory because the same read appears twice per level - once
// spread, once as the object the next level reads through - and a node is not
// shared between two tree positions.
function sharedSeedValueNode(
	read: () => EmissionNode,
	path: ReadonlyArray<string>,
	value: EmissionNode,
): EmissionNode {
	const [head, ...rest] = path;
	if (head === undefined) return value;
	const nested = sharedSeedValueNode(
		() => optionalComputedMemberNode(read(), literalNode(head)),
		rest,
		value,
	);
	return objectNode([spreadNode(read()), stringKeyPropertyNode(head, nested)]);
}

/** The printed shared-seed module, with its source map (invariant 3). */
export function emitSharedSeedModuleNodes(input: SharedSeedEmissionInput): EmittedModule {
	return printEmittedModule(buildSharedSeedEmission(input));
}

type StateInitializerProjection = {
	/** The one text every printed node carries an offset into. */
	readonly source: string;
	readonly program: unknown;
	readonly declarationStatements: ReadonlyArray<EmissionNode>;
	readonly initializerExpression: EmissionNode;
};

/**
 * Parse the selected module-scope declarations and the initializer expression
 * together, once.
 *
 * One parse matters for the source map: a node's `start`/`end` index the text it
 * was parsed from, so declarations parsed separately from the initializer would
 * carry offsets into two different strings and the map would attribute one of
 * them to positions in the other. The initializer is parenthesized so it parses
 * as an expression statement in every authored form (an object literal at
 * statement start would otherwise be a block); `preserveParens: false` then
 * drops the wrapper, and the printer re-derives whatever parentheses the
 * expression actually needs.
 */
function stateInitializerProjection(
	declarations: readonly string[],
	initializerSource: string,
	filename: string,
): StateInitializerProjection {
	const source = [...declarations, `(${initializerSource});`].join('\n');
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) {
		throw new Error(
			`symbol-modules: state-initializer emission could not parse its projected source (${errors
				.map((error) => error.message)
				.join('; ')})`,
		);
	}

	const statements = asNodes((program as unknown as AnyNode).body);
	const last = statements.at(-1);
	if (!last || last.type !== 'ExpressionStatement' || !isNode(last.expression)) {
		throw new Error(
			'symbol-modules: state-initializer emission expected its projected source to end in an expression statement',
		);
	}

	return {
		source,
		program,
		declarationStatements: statements.slice(0, -1) as unknown as ReadonlyArray<EmissionNode>,
		initializerExpression: last.expression as unknown as EmissionNode,
	};
}

/**
 * `const <local> = context.graph.read("<id>", [...])`.
 *
 * Built directly rather than through the foundation's `graphReadCall`, which
 * omits the path argument on an empty path. The text this replaces always
 * passes the array, so passing it keeps the call shape unchanged.
 */
function stateInitializerPropReadStatements(
	propRead: StateInitializerPropRead,
	sourceFileName: string,
): EmissionNode[] {
	const read = callNode(memberChainNode('context.graph.read'), [
		literalNode(propRead.graphNodeId),
		stringArrayNode(propRead.path),
	]);
	if (propRead.defaultSource === undefined) {
		return [constDeclarationNode(propRead.localName, read)];
	}

	// A destructuring default runs only for an undefined prop, so the read is
	// compared, not coalesced.
	const passed = `marklessProp_${propRead.localName}`;
	return [
		constDeclarationNode(passed, read),
		constDeclarationNode(
			propRead.localName,
			conditionalNode(
				binaryNode('===', identifierNode(passed), identifierNode('undefined')),
				expressionFromSource(propRead.defaultSource, sourceFileName),
				identifierNode(passed),
			),
		),
	];
}

/**
 * One authored expression, parsed as a node the printer can place.
 *
 * Parenthesized so every authored form parses as an expression statement, the
 * same reason `behaviorProjection` wraps its factory; `preserveParens: false`
 * drops the wrapper and the printer re-derives whatever parentheses the
 * position actually needs.
 */
function expressionFromSource(source: string, filename: string): EmissionNode {
	const { program, errors } = parseEmissionSource(`(${source});`, filename, 'ts');
	const statements = asNodes((program as unknown as AnyNode).body);
	const last = statements.at(-1);
	if (
		errors.length > 0 ||
		statements.length !== 1 ||
		!last ||
		last.type !== 'ExpressionStatement' ||
		!isNode(last.expression)
	) {
		throw new Error(
			`symbol-modules: emission expected a single expression, got ${JSON.stringify(source)}`,
		);
	}
	return last.expression as unknown as EmissionNode;
}

/**
 * The prop reads a state initializer needs, as data.
 *
 * The structured twin of `stateInitializerPropDeclarations`. It decides which
 * props the initializer mentions from the parsed tree rather than from a text
 * scan, because the scan lives in the band a migrated site may not call.
 */
export function stateInitializerPropReads(
	symbol: Extract<PlannedSymbol, { readonly kind: 'state-initializer' }>,
	semanticGraph: SymbolModulesInput['semanticGraph'],
	renderData: SymbolModulesInput['renderData'],
	sourceFileName: string,
): StateInitializerPropRead[] {
	if (!semanticGraph) return [];
	const componentName =
		semanticGraph.localDeclarations.find(
			(declaration) =>
				declaration.scope === 'component' && declaration.name === symbol.name,
		)?.componentName ?? renderData?.root?.componentName;
	if (!componentName) return [];

	return componentPropReads(componentName, symbol.source, semanticGraph, sourceFileName);
}

/**
 * The prop locals one component's authored expression names, each as the graph
 * read the rendering instance answers with its own props.
 */
export function componentPropReads(
	componentName: string,
	source: string,
	semanticGraph: SymbolModulesInput['semanticGraph'],
	sourceFileName: string,
): StateInitializerPropRead[] {
	if (!semanticGraph) return [];
	const propBinding = semanticGraph.graphBindings.find(
		(binding) => binding.kind === 'prop' && binding.componentName === componentName,
	);
	if (!propBinding) return [];

	const referenced = initializerReferencedNames(source, sourceFileName);
	if (propBinding.id !== 'prop:props') {
		return referenced.has(propBinding.name)
			? [{ localName: propBinding.name, graphNodeId: propBinding.id, path: [] }]
			: [];
	}

	return semanticGraph.componentPropBindings.flatMap((binding) =>
		binding.componentName === componentName && referenced.has(binding.localName)
			? [
					{
						localName: binding.localName,
						graphNodeId: 'prop:props',
						path: binding.propPath,
						...(binding.defaultSource === undefined
							? {}
							: { defaultSource: binding.defaultSource }),
					},
				]
			: [],
	);
}

/**
 * The module-scope declarations the initializer transitively needs, in the same
 * order the text path selects them.
 *
 * The AST twin of `referencedModuleDeclarations`: a declaration is pulled in
 * when the accumulated reference set mentions one of the names it declares, and
 * pulling it in adds its own identifiers to that set, until nothing new is
 * reached.
 */
function referencedModuleDeclarationSources(
	initializerSource: string,
	declarations: readonly string[],
	filename: string,
): string[] {
	const remaining = declarations.map((declaration) => {
		const parsed = parseEmissionSource(declaration, filename, 'ts').program as unknown as AnyNode;
		return {
			declaration,
			names: declaredStatementNames(parsed),
			references: referencedIdentifierNames(parsed),
		};
	});

	const references = initializerReferencedNames(initializerSource, filename);
	const selected: string[] = [];
	let changed = true;
	while (changed) {
		changed = false;
		for (let index = 0; index < remaining.length; index += 1) {
			const candidate = remaining[index]!;
			if (!candidate.names.some((name) => references.has(name))) continue;
			selected.push(candidate.declaration);
			for (const name of candidate.references) references.add(name);
			remaining.splice(index, 1);
			index -= 1;
			changed = true;
		}
	}
	return selected;
}

function initializerReferencedNames(initializerSource: string, filename: string): Set<string> {
	const parsed = parseEmissionSource(`(${initializerSource});`, filename, 'ts')
		.program as unknown as AnyNode;
	return referencedIdentifierNames(parsed);
}

/** The names a parsed module's top-level declarations bind. */
function declaredStatementNames(program: AnyNode): string[] {
	return asNodes(program.body).flatMap((statement) => {
		if (statement.type === 'VariableDeclaration') {
			return asNodes(statement.declarations).flatMap((declarator) => {
				const id = declarator.id;
				return isNode(id) && id.type === 'Identifier' && typeof id.name === 'string'
					? [id.name]
					: [];
			});
		}
		const id = statement.id;
		return isNode(id) && id.type === 'Identifier' && typeof id.name === 'string' ? [id.name] : [];
	});
}

/**
 * Every identifier the tree mentions, excluding a non-computed member's
 * property name.
 *
 * That one exclusion is what `sourceReferencesIdentifier` approximates by
 * refusing a match preceded by a lone `.`; the tree states it exactly. Binding
 * positions are deliberately included, matching the text path, which appends a
 * selected declaration's whole source to the haystack.
 */
function referencedIdentifierNames(root: AnyNode): Set<string> {
	const names = new Set<string>();
	const seen = new Set<object>();
	const stack: AnyNode[] = [root];

	while (stack.length > 0) {
		const node = stack.pop()!;
		if (seen.has(node)) continue;
		seen.add(node);

		if (node.type === 'Identifier' && typeof node.name === 'string') names.add(node.name);

		const skipProperty = node.type === 'MemberExpression' && node.computed !== true;
		for (const [key, value] of Object.entries(node)) {
			if (key === 'parent' || key === 'loc' || key === 'range') continue;
			if (skipProperty && key === 'property') continue;
			if (Array.isArray(value)) {
				for (const item of value) if (isNode(item)) stack.push(item);
				continue;
			}
			if (isNode(value)) stack.push(value);
		}
	}

	return names;
}

/**
 * The AST path's import dedupe. Same key as `uniqueModuleImports`, which sits
 * inside the scanner band a migrated site may not call.
 */
function dedupeModuleImports(
	moduleImports: ReadonlyArray<SemanticModuleImport>,
): ReadonlyArray<SemanticModuleImport> {
	const seen = new Set<string>();
	const unique: SemanticModuleImport[] = [];

	for (const moduleImport of moduleImports) {
		const key = [
			moduleImport.kind,
			moduleImport.localName,
			moduleImport.importedName ?? '',
			moduleImport.source,
		].join('\0');
		if (seen.has(key)) continue;

		seen.add(key);
		unique.push(moduleImport);
	}

	return unique;
}

// ---------------------------------------------------------------------------
// Sync computed derive emission — migrated to AST construction plus the printer
// per `specs/framework/14-emission-codegen-migration.md` stage 1, sketch item 2.
//
// The authored derive function is parsed once, its dependency reads are
// rewritten by *node identity* (invariant 6) rather than by span arithmetic over
// the authored text, and the exported wrapper is printed through
// `emit-codegen.ts` — which applies the TSRX-node assertion (invariant 4) and
// the non-null source-map guard (invariant 3) at this site.
//
// The module frame around the printed function (imports, the `authoredSource`
// export, the blank-line layout) is still assembled from lines. That is
// deliberate: those pieces are produced by helpers shared with emitters this
// unit does not own, and printing the whole module as one program would drop the
// authored blank lines the printer does not preserve — a byte change beyond the
// indentation difference this migration is scoped to.
// ---------------------------------------------------------------------------

/**
 * The authored derive source is a function *expression* (`() => ...`,
 * `function () { ... }`), which is not a module on its own — an anonymous
 * `function () {}` at statement position is a syntax error. Wrapping it in a
 * declarator makes it parseable without changing the text of the function
 * itself, so a dependency's authored `source` still matches the wrapped text
 * exactly.
 */
const DERIVE_SOURCE_PREFIX = 'const __marklessSyncComputedDerive = (\n';
const DERIVE_SOURCE_SUFFIX = '\n);';
const DERIVE_SOURCE_FILENAME = 'markless-sync-computed-derive.ts';

/**
 * The print input for one derive module's exported function.
 *
 * Exported so the site's focused test can run the foundation's determinism
 * helper (invariant 7: print twice, then reparse and reprint) against the exact
 * tree production builds.
 */
export function syncComputedDeriveEmissionInput(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): EmissionPrintInput {
	return syncComputedDeriveEmission(symbol, captureSlots).input;
}

function syncComputedDeriveEmission(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): { readonly input: EmissionPrintInput; readonly statements: ReadonlyArray<EmissionNode> } {
	const exportName = symbolExportName(symbol.id);
	const wrappedSource = `${DERIVE_SOURCE_PREFIX}${symbol.source}${DERIVE_SOURCE_SUFFIX}`;
	const statements = syncComputedDeriveStatements(symbol, captureSlots, wrappedSource);

	const input: EmissionPrintInput = {
		program: {
			type: 'Program',
			sourceType: 'module',
			body: [
				{
					type: 'ExportNamedDeclaration',
					specifiers: [],
					source: null,
					declaration: {
						type: 'FunctionDeclaration',
						id: identifierNode(exportName),
						async: false,
						generator: false,
						params: [identifierNode('context')],
						body: { type: 'BlockStatement', body: statements },
					},
				},
			],
		},
		// The tree's offsets are offsets into the wrapped text, so the map is
		// built against that text. Naming the *authored* file at every print site
		// is the separate source-map wiring unit in the campaign sketch.
		source: wrappedSource,
		outputFileName: `${exportName}.js`,
		site: {
			phase: 'payload',
			passId: 'symbol-modules',
			sourceFileName: DERIVE_SOURCE_FILENAME,
			symbolId: symbol.id,
		},
	};

	return { input, statements };
}

function emitSyncComputedDeriveModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	omitAuthoredSource: boolean,
): string {
	const emission = syncComputedDeriveEmission(symbol, captureSlots);
	const printed = printEmittedModule(emission.input);
	const referenced = deriveReferencedIdentifierNames(emission.statements);
	const imports = uniqueModuleImports(
		(symbol.moduleImports ?? []).filter((moduleImport) =>
			referenced.has(moduleImport.localName),
		),
	);

	return [
		...imports.map(emitModuleImport),
		...(imports.length > 0 ? [''] : []),
		...authoredSourceLines(symbol.source, omitAuthoredSource),
		'',
		printed.code,
		'',
	].join('\n');
}

/**
 * The names the emitted body actually refers to, used to decide which module
 * imports the emitted module still needs.
 *
 * This replaces a call into the string-scanner band (`sourceReferencesIdentifier`
 * scans the emitted text), which is why it is here rather than reusing it: the
 * campaign requires a migrated site to reach no scanner. Reading the tree is
 * also more accurate — a name that appears only inside a string literal is not a
 * reference, and the text scan counted it as one.
 *
 * Non-computed member properties and non-computed object keys are excluded: they
 * are names of properties, not references to bindings.
 */
function deriveReferencedIdentifierNames(root: unknown): ReadonlySet<string> {
	const names = new Set<string>();
	const seen = new Set<object>();
	const stack: unknown[] = [root];

	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== 'object') continue;
		if (seen.has(value)) continue;
		seen.add(value);

		if (Array.isArray(value)) {
			for (const item of value) stack.push(item);
			continue;
		}

		const node = value as AnyNode;
		if (node.type === 'Identifier' && typeof node.name === 'string') {
			names.add(node.name);
			continue;
		}

		for (const [key, child] of Object.entries(node)) {
			if (REFERENCE_WALK_IGNORED_KEYS.has(key)) continue;
			if (node.computed !== true && key === 'property' && node.type === 'MemberExpression') {
				continue;
			}
			if (node.computed !== true && key === 'key' && node.type === 'Property') continue;
			stack.push(child);
		}
	}

	return names;
}

/** Side tables and back-pointers, which are not tree structure. */
const REFERENCE_WALK_IGNORED_KEYS: ReadonlySet<string> = new Set([
	'parent',
	'loc',
	'range',
	'leadingComments',
	'trailingComments',
	'comments',
]);

function syncComputedDeriveStatements(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	wrappedSource: string,
): EmissionNode[] {
	const derive = parseDeriveFunction(wrappedSource);
	const body = derive?.body as AnyNode | undefined;
	if (!body) return [returnUndefinedStatement()];

	const statements =
		body.type === 'BlockStatement'
			? asNodes(body.body)
			: [{ type: 'ReturnStatement', argument: body } as AnyNode];

	rewriteDeriveReads(statements, symbol.dependencies ?? [], captureSlots, wrappedSource);

	if (statements.length === 0) return [returnUndefinedStatement()];
	return statements as unknown as EmissionNode[];
}

function returnUndefinedStatement(): EmissionNode {
	return { type: 'ReturnStatement', argument: identifierNode('undefined') };
}

function parseDeriveFunction(wrappedSource: string): AnyNode | null {
	let program: AnyNode;
	try {
		const parsed = parseEmissionSource(wrappedSource, DERIVE_SOURCE_FILENAME);
		if (parsed.errors.length > 0) return null;
		program = parsed.program as unknown as AnyNode;
	} catch {
		// A derive whose authored source does not parse has no tree to rewrite.
		// The caller emits `return undefined;` rather than shipping text that
		// cannot be printed.
		return null;
	}

	const declaration = asNodes(program.body)[0];
	if (declaration?.type !== 'VariableDeclaration') return null;

	const init = asNodes(declaration.declarations)[0]?.init;
	if (!isNode(init)) return null;
	if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') return null;

	return init;
}

/**
 * Keys the read walk does not descend into.
 *
 * This mirrors the ignore set `ast/nodes.ts#childNodes` uses, deliberately:
 * the string path this replaced detected reads by walking with `childNodes`, so
 * matching its blind spots — `id` above all, which keeps a declared function's
 * own name from being rewritten into a graph read — is what makes the migrated
 * emitter select the same reads as the emitter it replaces.
 */
const DERIVE_WALK_IGNORED_KEYS: ReadonlySet<string> = new Set([
	'closingElement',
	'comments',
	'id',
	'leadingComments',
	'loc',
	'metadata',
	'openingElement',
	'parent',
	'range',
	'trailingComments',
]);

/**
 * Rewrite every dependency read in the derive body to a graph or capture read,
 * in place, keyed on the node that carries the read.
 *
 * The outermost matching node wins: once a read is replaced the walk does not
 * descend into it, so a dependency on `user.profile` and a dependency on `user`
 * cannot both rewrite the same text. The string path had no such rule and
 * corrupted the second splice when the spans nested.
 */
function rewriteDeriveReads(
	statements: ReadonlyArray<AnyNode>,
	dependencies: ReadonlyArray<SemanticGraphDependency>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	wrappedSource: string,
): void {
	if (dependencies.length === 0) return;

	const visit = (
		node: AnyNode,
		parent: AnyNode | undefined,
		replace: ((next: EmissionNode) => void) | null,
	): void => {
		const dependency = matchingDependency(node, parent, dependencies, wrappedSource);
		if (dependency && replace) {
			replace(deriveReadNode(dependency, captureSlots));
			return;
		}

		if (node.type === 'Property') {
			visitPropertyChildren(node, visit);
			return;
		}

		for (const [key, value] of Object.entries(node)) {
			if (DERIVE_WALK_IGNORED_KEYS.has(key)) continue;

			if (Array.isArray(value)) {
				value.forEach((item, index) => {
					if (!isNode(item)) return;
					visit(item, node, (next) => {
						value[index] = next;
					});
				});
				continue;
			}

			if (!isNode(value)) continue;
			visit(value, node, (next) => {
				(node as Record<string, unknown>)[key] = next;
			});
		}
	};

	for (const statement of statements) visit(statement, undefined, null);
}

/**
 * A shorthand property's key and value cover the same text, so a generic walk
 * would match both. Only the value is a read; replacing it also has to drop the
 * shorthand flag, or the printer would render the property as its key alone and
 * silently discard the rewritten read.
 */
function visitPropertyChildren(
	property: AnyNode,
	visit: (
		node: AnyNode,
		parent: AnyNode | undefined,
		replace: ((next: EmissionNode) => void) | null,
	) => void,
): void {
	const key = property.key;
	if (property.computed === true && isNode(key)) {
		visit(key, property, (next) => {
			(property as Record<string, unknown>).key = next;
		});
	}

	const value = property.value;
	if (!isNode(value)) return;

	visit(value, property, (next) => {
		(property as Record<string, unknown>).value = next;
		(property as Record<string, unknown>).shorthand = false;
	});
}

function matchingDependency(
	node: AnyNode,
	parent: AnyNode | undefined,
	dependencies: ReadonlyArray<SemanticGraphDependency>,
	wrappedSource: string,
): SemanticGraphDependency | null {
	if (!isGraphReadExpression(node)) return null;
	if (!isValuePositionGraphRead(node, parent)) return null;
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return null;

	const text = wrappedSource.slice(node.start, node.end);
	return dependencies.find((dependency) => dependency.source === text) ?? null;
}

function deriveReadNode(
	dependency: SemanticGraphDependency,
	captureSlots: ReadonlyArray<CaptureSlot>,
): EmissionNode {
	const slot = captureSlots.find((candidate) => captureSlotMatchesRead(candidate, dependency));
	if (slot) {
		return callNode(memberChainNode('context.capture.read'), [literalNode(slot.id)]);
	}

	return graphReadCall({
		callee: 'context.graph.read',
		graphNodeId: dependency.graphNodeId,
		path: dependency.path,
	});
}

// ---------------------------------------------------------------------------
// Async-computed-runner emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2,
// third emitter. Built the same way the state-initializer band above is built:
// nodes go to `emit-codegen.ts` and come back printed, with a source map.
//
// This band calls nothing in the scanner band (`topLevelBinaryOperators`
// through `sourceReferencesIdentifier`), which invariant 5 keeps alive until
// stage 1's final unit but which a migrated site may not reach. Two string-path
// helpers are therefore re-expressed here rather than shared:
// `graphReadCallSource` and `uniqueModuleImports` are inside the band, and
// `staticSourcePath` reaches it through `isIdentifierObjectKey`. The foundation's
// `graphReadCall` and the band-free `dedupeModuleImports` and
// `asyncRunnerDependencyBinding` below stand in for them, with the same
// behavior.
//
// It is not yet the wired path. `emitAsyncComputedRunnerModule` stays the active
// emitter; `test/emit-async-runner.test.ts` runs both over the same inputs and
// records where the printed bytes differ from the spliced ones. Invariant 2
// makes the swap an owner-approved step, not a side effect of this unit.
// ---------------------------------------------------------------------------

export type AsyncComputedRunnerEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'async-computed-runner' }>;
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
	readonly omitAuthoredSource: boolean;
	/** The authored file the runner was extracted from; names the map. */
	readonly sourceFileName: string;
};

/**
 * Build the print input for an async-computed-runner module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildAsyncComputedRunnerEmission(
	input: AsyncComputedRunnerEmissionInput,
): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const projection = asyncRunnerProjection(input.symbol.source, input.sourceFileName);
	const imports = dedupeModuleImports(input.symbol.moduleImports ?? []);

	const body: EmissionNode[] = [
		...imports.map((moduleImport) =>
			moduleImportNode({
				kind: moduleImport.kind,
				localName: moduleImport.localName,
				importedName: moduleImport.importedName,
				source: moduleImport.source,
			}),
		),
		...(input.omitAuthoredSource
			? []
			: [
					exportNamedDeclarationNode(
						constDeclarationNode('authoredSource', literalNode(input.symbol.source)),
					),
				]),
		exportNamedDeclarationNode(
			functionDeclarationNode(
				exportName,
				['context'],
				[
					asyncRunnerReadBindingStatement(),
					...asyncRunnerDependencyStatements(
						input.symbol.dependencies ?? [],
						input.captureSlots,
					),
					constDeclarationNode('run', projection.runnerExpression),
					returnStatementNode(
						callNode(identifierNode('run'), [
							objectNode([
								propertyNode('key', memberChainNode('context.key')),
								propertyNode('signal', memberChainNode('context.signal')),
								shorthandPropertyNode('read'),
							]),
						]),
					),
				],
			),
		),
	];

	return {
		program: moduleProgramNode(body),
		source: projection.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed async-computed-runner module, with its source map (invariant 3). */
export function emitAsyncComputedRunnerModuleNodes(
	input: AsyncComputedRunnerEmissionInput,
): EmittedModule {
	return printEmittedModule(buildAsyncComputedRunnerEmission(input));
}

/**
 * `const read = context.graph?.read ? context.graph.read.bind(context.graph) : context.read;`
 *
 * The runner is handed a `read` that works against either shape of context: the
 * compiled graph exposes `context.graph.read`, which has to stay bound to the
 * graph, while a bare async context exposes `context.read` directly.
 */
function asyncRunnerReadBindingStatement(): EmissionNode {
	return constDeclarationNode(
		'read',
		conditionalNode(
			optionalMemberNode(memberChainNode('context.graph'), 'read'),
			callNode(memberChainNode('context.graph.read.bind'), [memberChainNode('context.graph')]),
			memberChainNode('context.read'),
		),
	);
}

/**
 * One `const <name> = ...;` per dependency the runner closes over, in dependency
 * order, first binding wins.
 *
 * The AST twin of `asyncRunnerDependencyDeclarations`. A dependency covered by a
 * capture slot reads through the capture table; every other one reads through
 * the bound `read` above.
 */
function asyncRunnerDependencyStatements(
	dependencies: ReadonlyArray<SemanticGraphDependency>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): EmissionNode[] {
	const statements: EmissionNode[] = [];
	const seenNames = new Set<string>();

	for (const dependency of dependencies) {
		const binding = asyncRunnerDependencyBinding(dependency);
		if (!binding || seenNames.has(binding.name)) continue;

		seenNames.add(binding.name);
		const slot = captureSlots.find((candidate) => captureSlotMatchesRead(candidate, dependency));
		statements.push(
			constDeclarationNode(
				binding.name,
				slot
					? callNode(memberChainNode('context.capture.read'), [literalNode(slot.id)])
					: graphReadCall({
							callee: 'read',
							graphNodeId: binding.graphNodeId,
							path: binding.path,
						}),
			),
		);
	}

	return statements;
}

/** Matches `isIdentifierObjectKey`, which sits inside the scanner band. */
const ASYNC_RUNNER_IDENTIFIER = /^[$A-Z_a-z][$0-9A-Z_a-z]*$/;

/**
 * The local name a dependency binds and the graph path it reads, or `null` when
 * the dependency source is not a plain dotted name.
 *
 * The band-free twin of `asyncRunnerDependencyDeclaration`: same trailing-member
 * arithmetic, with the identifier test inlined so this site reaches no scanner.
 */
function asyncRunnerDependencyBinding(dependency: SemanticGraphDependency): {
	readonly name: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
} | null {
	const parts = dependency.source.split('.');
	if (parts.some((part) => !ASYNC_RUNNER_IDENTIFIER.test(part))) return null;

	const [name, ...memberPath] = parts;
	if (!name) return null;

	return {
		name,
		graphNodeId: dependency.graphNodeId,
		path: dependency.path.slice(0, Math.max(0, dependency.path.length - memberPath.length)),
	};
}

type AsyncRunnerProjection = {
	/** The one text every printed node carries an offset into. */
	readonly source: string;
	readonly runnerExpression: EmissionNode;
};

/**
 * Parse the runner expression, once.
 *
 * Only the runner carries authored spans — the imports, the `read` binding, the
 * dependency reads, and the call are all synthesized — so this is the whole of
 * the source the map points into. The runner is parenthesized so it parses as an
 * expression statement whatever its authored form; `preserveParens: false` drops
 * the wrapper and the printer re-derives whatever parentheses the expression
 * actually needs in initializer position.
 */
function asyncRunnerProjection(runnerSource: string, filename: string): AsyncRunnerProjection {
	const source = `(${runnerSource});`;
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) {
		throw new Error(
			`symbol-modules: async-computed-runner emission could not parse its projected source (${errors
				.map((error) => error.message)
				.join('; ')})`,
		);
	}

	const statements = asNodes((program as unknown as AnyNode).body);
	const last = statements.at(-1);
	if (!last || last.type !== 'ExpressionStatement' || !isNode(last.expression)) {
		throw new Error(
			'symbol-modules: async-computed-runner emission expected its projected source to be an expression statement',
		);
	}

	return { source, runnerExpression: last.expression as unknown as EmissionNode };
}

function symbolExportName(symbolId: string): string {
	const name = symbolId.replace(/[^$0-9A-Z_a-z]/g, '_');
	if (/^[$A-Z_a-z]/.test(name)) return name;
	return `_${name}`;
}

function uniqueModuleImports(
	moduleImports: ReadonlyArray<SemanticModuleImport>,
): ReadonlyArray<SemanticModuleImport> {
	const seen = new Set<string>();
	const unique: SemanticModuleImport[] = [];

	for (const moduleImport of moduleImports) {
		const key = [
			moduleImport.kind,
			moduleImport.localName,
			moduleImport.importedName ?? '',
			moduleImport.source,
		].join('\0');
		if (seen.has(key)) continue;

		seen.add(key);
		unique.push(moduleImport);
	}

	return unique;
}

function emitModuleImport(moduleImport: SemanticModuleImport): string {
	const source = JSON.stringify(moduleImport.source);
	if (moduleImport.kind === 'default') {
		return `import ${moduleImport.localName} from ${source};`;
	}
	if (moduleImport.kind === 'namespace') {
		return `import * as ${moduleImport.localName} from ${source};`;
	}
	if (moduleImport.importedName === moduleImport.localName) {
		return `import { ${moduleImport.localName} } from ${source};`;
	}
	return `import { ${moduleImport.importedName} as ${moduleImport.localName} } from ${source};`;
}

// ---------------------------------------------------------------------------
// Arm emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 3 —
// the two arm emitters, taken together because they emit the same module shape
// over different arm data. This band builds nodes and prints them through
// `emit-codegen.ts`; it calls nothing in the string-scanner band
// (`topLevelBinaryOperators` through `sourceReferencesIdentifier`), which
// invariant 5 keeps alive until the stage's final unit but which a migrated site
// may not reach. Neither arm emitter reached that band on the text path either:
// their only inputs are render data and `JSON.stringify`.
//
// It is not yet the wired path. `emitBranchUpdateModule` and
// `emitAsyncBoundaryUpdateModule` above still produce the bytes the compiler
// ships; `test/emit-arm-modules.test.ts` runs both paths over the same arms and
// records where the printed bytes differ from the assembled ones. Invariant 2
// makes the swap an owner-approved step, not a side effect of this unit.
//
// These two sites are assembled, not extracted: unlike every emitter migrated
// before them, not one character of their output comes from authored text. The
// arm HTML is render data, the selector and escaper helpers are the emitter's
// own fixed code, and the graph reads are built from ids. Two consequences the
// spec's map invariant does not anticipate, recorded here rather than papered
// over:
//
//   - No printed node carries a span, so the emitted map has no segments. The
//     DOM-binding band above reached the same state for the same reason; here it
//     is total rather than near-total, since there is no authored expression
//     behind the module at all.
//   - `source` is therefore not recoverable from the symbol. `branch-update`
//     carries `testSource`, but that text is not what the module emits — the
//     emitted test is rebuilt from `testRead` ids — and `async-boundary-update`
//     carries no source field whatsoever. Rather than pass a misleading
//     substitute, both inputs take `authoredSource` explicitly: the authored
//     module's own text, which is what `sourceFileName` already names and what
//     the map's `sourcesContent` should therefore hold.
//
// The non-null-map guard (invariant 3) still runs, and still passes, but at
// these two sites it proves less than it reads as: `yuku-codegen@0.9.0` returns
// a non-null map for an empty `source` too, so the guard cannot distinguish a
// module whose source was threaded through from one whose source is absent. The
// guard is kept because invariant 3 requires it and because it does catch a
// print site that forgot `sourceMap` entirely.
// ---------------------------------------------------------------------------

export type BranchUpdateEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'branch-update' }>;
	readonly arms: PublicRenderPlanBranchArms;
	/** The authored file the branch site was compiled from; names the map. */
	readonly sourceFileName: string;
	/**
	 * The authored module's text, for the map's `sourcesContent`.
	 *
	 * Passed rather than derived: this site assembles its whole module, so no
	 * field on the symbol holds text the emitted module is made of.
	 */
	readonly authoredSource: string;
};

/**
 * Build the print input for a branch-update module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildBranchUpdateEmission(input: BranchUpdateEmissionInput): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const arms = input.arms;
	const testExpression = arms.testRead
		? graphReadCall({
				callee: 'context.graph.read',
				graphNodeId: arms.testRead.graphNodeId,
				path: arms.testRead.path,
			})
		: identifierNode('undefined');

	// Switch sites select by case value; if-sites select by truthiness. The text
	// path parenthesizes the truthiness test by hand; the printer derives the
	// parentheses `??` over a conditional actually needs.
	const armSelector = arms.armTests
		? callNode(identifierNode('marklessSelectSwitchArm'), [
				testExpression,
				jsonValueNode(arms.armTests),
			])
		: conditionalNode(testExpression, literalNode(0), literalNode(1));

	// Arm-scoped flips may carry repeat parts: rows rebuild from a live graph
	// read of the collection at flip time (still no component execution).
	const hasRepeatParts = arms.arms.some((arm) => arm.some((part) => 'repeat' in part));

	const body: EmissionNode[] = [
		constDeclarationNode('marklessBranchArms', jsonValueNode(arms.arms)),
		...(arms.armTests ? [switchArmSelectorFunctionNode()] : []),
		exportNamedDeclarationNode(
			functionDeclarationNode(exportName, ['context'], [
				constDeclarationNode(
					'arm',
					logicalNode('??', memberChainNode('context.arm'), armSelector),
				),
				constDeclarationNode(
					'parts',
					logicalNode(
						'??',
						computedMemberNode(identifierNode('marklessBranchArms'), identifierNode('arm')),
						arrayNode([]),
					),
				),
				constDeclarationNode(
					'html',
					armPartsHtmlExpression('marklessBranchText', hasRepeatParts),
				),
				returnStatementNode(
					objectNode([shorthandPropertyNode('arm'), shorthandPropertyNode('html')]),
				),
			]),
		),
		armTextEscaperFunctionNode('marklessBranchText'),
		...(hasRepeatParts ? [branchRowsFunctionNode()] : []),
	];

	return {
		program: moduleProgramNode(body),
		source: input.authoredSource,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed branch-update module, with its source map (invariant 3). */
export function emitBranchUpdateModuleNodes(input: BranchUpdateEmissionInput): EmittedModule {
	return printEmittedModule(buildBranchUpdateEmission(input));
}

export type AsyncBoundaryUpdateEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'async-boundary-update' }>;
	readonly arms: PublicRenderPlanAsyncBoundaryArms;
	/** The authored file the boundary was compiled from; names the map. */
	readonly sourceFileName: string;
	/** The authored module's text, for the map's `sourcesContent`. */
	readonly authoredSource: string;
};

/**
 * Build the print input for an async-boundary-update module.
 *
 * Split from the print for the same reason `buildBranchUpdateEmission` is: the
 * determinism helper (invariant 7) needs the tree, and a real build must not pay
 * for three prints and two reparses per symbol.
 */
export function buildAsyncBoundaryUpdateEmission(
	input: AsyncBoundaryUpdateEmissionInput,
): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const body: EmissionNode[] = [
		constDeclarationNode('marklessBoundaryArms', jsonValueNode(input.arms.arms)),
		exportNamedDeclarationNode(
			functionDeclarationNode(exportName, ['context'], [
				// The runtime passes the settled status; arm 1 is @catch, arm 0 is @try.
				constDeclarationNode(
					'arm',
					conditionalNode(
						binaryNode('===', memberChainNode('context.status'), literalNode('rejected')),
						literalNode(1),
						literalNode(0),
					),
				),
				constDeclarationNode(
					'parts',
					logicalNode(
						'??',
						computedMemberNode(identifierNode('marklessBoundaryArms'), identifierNode('arm')),
						arrayNode([]),
					),
				),
				constDeclarationNode('html', armPartsHtmlExpression('marklessBoundaryText', false)),
				returnStatementNode(
					objectNode([shorthandPropertyNode('arm'), shorthandPropertyNode('html')]),
				),
			]),
		),
		armTextEscaperFunctionNode('marklessBoundaryText'),
	];

	return {
		program: moduleProgramNode(body),
		source: input.authoredSource,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed async-boundary-update module, with its source map (invariant 3). */
export function emitAsyncBoundaryUpdateModuleNodes(
	input: AsyncBoundaryUpdateEmissionInput,
): EmittedModule {
	return printEmittedModule(buildAsyncBoundaryUpdateEmission(input));
}

/**
 * `parts.map((part) => ...).join("")` — the arm-to-HTML expression both arm
 * emitters build, differing only in which escaper they call and whether they
 * handle repeat parts.
 *
 * Shared between the two bands rather than written twice because the two text
 * paths are already character-identical apart from the escaper name; a shared
 * builder means a future change cannot drift them apart silently.
 */
function armPartsHtmlExpression(escaperName: string, hasRepeatParts: boolean): EmissionNode {
	const escapedRead = callNode(identifierNode(escaperName), [
		callNode(memberChainNode('context.graph.read'), [
			memberChainNode('part.read.graphNodeId'),
			memberChainNode('part.read.path'),
		]),
	]);

	const nonTextPart = hasRepeatParts
		? conditionalNode(
				binaryNode('!==', memberChainNode('part.repeat'), identifierNode('undefined')),
				callNode(identifierNode('marklessBranchRows'), [
					memberChainNode('part.repeat'),
					memberChainNode('context.graph'),
				]),
				escapedRead,
			)
		: escapedRead;

	return callNode(
		memberNode(
			callNode(memberChainNode('parts.map'), [
				arrowFunctionNode(
					['part'],
					conditionalNode(
						binaryNode('!==', memberChainNode('part.text'), identifierNode('undefined')),
						memberChainNode('part.text'),
						nonTextPart,
					),
				),
			]),
			'join',
		),
		[literalNode('')],
	);
}

/**
 * The three HTML replacements the arm escapers apply, in the order the text path
 * chains them. Order is emitted bytes, so it is data rather than three literal
 * call sites.
 */
const ARM_TEXT_ESCAPES: ReadonlyArray<readonly [string, string]> = [
	['&', '&amp;'],
	['<', '&lt;'],
	['>', '&gt;'],
];

/**
 * `function <name>(value) { return String(value == null ? "" : value).replaceAll(...)...; }`
 *
 * The two emitters give this function two different names —
 * `marklessBranchText` and `marklessBoundaryText` — with identical bodies, so
 * the name is a parameter and the body is built once.
 */
function armTextEscaperFunctionNode(name: string): EmissionNode {
	const coerced: EmissionNode = callNode(identifierNode('String'), [
		conditionalNode(
			binaryNode('==', identifierNode('value'), literalNode(null)),
			literalNode(''),
			identifierNode('value'),
		),
	]);
	const escaped = ARM_TEXT_ESCAPES.reduce<EmissionNode>(
		(node, [from, to]) =>
			callNode(memberNode(node, 'replaceAll'), [literalNode(from), literalNode(to)]),
		coerced,
	);

	return functionDeclarationNode(name, ['value'], [returnStatementNode(escaped)]);
}

/**
 * `function marklessSelectSwitchArm(value, tests) { ... }` — the switch-site arm
 * picker, emitted only when the site carries `armTests`.
 *
 * `tests[index]` is built twice rather than once and shared: a node reused at
 * two positions is one object in two places in the tree, which the printer
 * happens to tolerate but which makes any later per-node bookkeeping (spans,
 * comments, map segments) ambiguous.
 */
function switchArmSelectorFunctionNode(): EmissionNode {
	const testAtIndex = (): EmissionNode =>
		computedMemberNode(identifierNode('tests'), identifierNode('index'));

	return functionDeclarationNode('marklessSelectSwitchArm', ['value', 'tests'], [
		forStatementNode(
			letDeclarationNode('index', literalNode(0)),
			binaryNode('<', identifierNode('index'), memberChainNode('tests.length')),
			postfixUpdateNode('++', identifierNode('index')),
			[
				ifStatementNode(
					logicalNode(
						'&&',
						binaryNode('!==', testAtIndex(), literalNode(null)),
						binaryNode('===', identifierNode('value'), testAtIndex()),
					),
					returnStatementNode(identifierNode('index')),
				),
			],
		),
		returnStatementNode(callNode(memberChainNode('tests.indexOf'), [literalNode(null)])),
	]);
}

/**
 * `function marklessBranchRows(repeat, graph) { ... }` — the row rebuilder,
 * emitted only when an arm carries repeat parts.
 *
 * A row part is one of three shapes: static text, an item-relative path walked
 * against the row's own item, or a graph read. The walk is a `reduce` that
 * short-circuits on a nullish intermediate, exactly as the text path writes it.
 */
function branchRowsFunctionNode(): EmissionNode {
	const rowExpression = conditionalNode(
		binaryNode('!==', memberChainNode('row.text'), identifierNode('undefined')),
		memberChainNode('row.text'),
		conditionalNode(
			binaryNode('!==', memberChainNode('row.itemPath'), identifierNode('undefined')),
			callNode(identifierNode('marklessBranchText'), [
				callNode(memberChainNode('row.itemPath.reduce'), [
					arrowFunctionNode(
						['value', 'key'],
						conditionalNode(
							binaryNode('==', identifierNode('value'), literalNode(null)),
							identifierNode('value'),
							computedMemberNode(identifierNode('value'), identifierNode('key')),
						),
					),
					identifierNode('item'),
				]),
			]),
			callNode(identifierNode('marklessBranchText'), [
				callNode(memberChainNode('graph.read'), [
					memberChainNode('row.read.graphNodeId'),
					memberChainNode('row.read.path'),
				]),
			]),
		),
	);

	const rowHtml = callNode(
		memberNode(
			callNode(memberChainNode('repeat.rowParts.map'), [
				arrowFunctionNode(['row'], rowExpression),
			]),
			'join',
		),
		[literalNode('')],
	);

	return functionDeclarationNode('marklessBranchRows', ['repeat', 'graph'], [
		constDeclarationNode(
			'items',
			callNode(memberChainNode('graph.read'), [
				memberChainNode('repeat.read.graphNodeId'),
				memberChainNode('repeat.read.path'),
			]),
		),
		ifStatementNode(
			unaryNode('!', callNode(memberChainNode('Array.isArray'), [identifierNode('items')])),
			returnStatementNode(literalNode('')),
		),
		returnStatementNode(
			callNode(
				memberNode(
					callNode(memberChainNode('items.map'), [arrowFunctionNode(['item'], rowHtml)]),
					'join',
				),
				[literalNode('')],
			),
		),
	]);
}

// ---------------------------------------------------------------------------
// Value-expression emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 4 —
// `emitSymbolModule`, the general path, together with the value-source cluster
// it reaches: `supportedValueSource` through `binaryValueOperatorPrecedence`
// (the spec measures that cluster at lines 1552-2107 of the 2,789-line
// baseline; it sits at `supportedValueSource` .. `binaryValueOperatorPrecedence`
// in this file today).
//
// The cluster's whole job is to re-derive, from characters, facts a parser
// already knows: where a top-level operator is, which colon separates an object
// key from its value, which comma is a real separator and which one is inside a
// nested literal or a string. This band asks the parser instead. One parse of
// the authored value source, one recursive walk that keeps the same support
// envelope, and the printer supplies precedence, parentheses, and quoting.
//
// It is not the wired path. `supportedValueSource` and `eventWriteValueSource`
// above still produce the bytes the compiler ships;
// `test/emit-symbol-module.test.ts` runs both over the same value sources and
// records exactly where the printed text differs from the spliced text.
// Invariant 5 keeps the scanners alive until stage 1's final unit, and this band
// calls none of them: the four predicates it needs (`isIdentifierObjectKey`'s
// regex, `isSupportedObjectLiteralKey`'s three regexes,
// `isSupportedStaticCallCallee`'s dotted-path regex, and the
// `knownGlobalStaticCallRoots` set) are re-expressed inside the band rather
// than shared, exactly as the async-runner band re-expresses its two.
// ---------------------------------------------------------------------------

/** `foo` — the identifier shape `isIdentifierObjectKey` tests for. */
const VALUE_IDENTIFIER_PATTERN = /^[$A-Z_a-z][$0-9A-Z_a-z]*$/;

/** `a.b.c` — the callee shape `isSupportedStaticCallCallee` tests for. */
const VALUE_STATIC_CALLEE_PATTERN = /^[$A-Z_a-z][$0-9A-Z_a-z]*(?:\.[$A-Z_a-z][$0-9A-Z_a-z]*)*$/;

/** The band-local twin of `knownGlobalStaticCallRoots`. */
const VALUE_GLOBAL_CALL_ROOTS: ReadonlySet<string> = new Set([
	'Array',
	'Boolean',
	'Date',
	'JSON',
	'Math',
	'Number',
	'Object',
	'String',
]);

/**
 * The operators `binaryValueOperators` lists, as a set.
 *
 * Membership is the whole of what the AST path needs from that table: the
 * precedence half (`binaryValueOperatorPrecedence`, `splitOperator`) exists only
 * to find the split point in a flat string, which a parse already gives, and the
 * re-parenthesization half is the printer's job under `preserveParens: false`.
 */
const VALUE_BINARY_OPERATORS: ReadonlySet<string> = new Set([
	'===',
	'!==',
	'>>>',
	'<<',
	'>>',
	'>=',
	'<=',
	'&&',
	'||',
	'??',
	'**',
	'==',
	'!=',
	'>',
	'<',
	'+',
	'-',
	'*',
	'/',
	'%',
	'&',
	'|',
	'^',
]);

/** The prefix operators `unaryValueOperator` accepts. */
const VALUE_UNARY_OPERATORS: ReadonlySet<string> = new Set(['!', '+', '-', '~']);

export type ValueExpressionEmissionInput = {
	/** The authored expression text, as the lowering recorded it. */
	readonly valueSource: string | undefined;
	readonly eventParameters: ReadonlyArray<string>;
	readonly graphReads: ReadonlyArray<LoweredStateRead>;
	readonly moduleImports: ReadonlyArray<SemanticModuleImport>;
	readonly localNames: ReadonlySet<string>;
	/** The authored file the value came from; names the map at the print site. */
	readonly sourceFileName: string;
};

export type ValueExpressionEmission = {
	readonly node: EmissionNode;
	/**
	 * The projected text every node in `node` carries an offset into.
	 *
	 * A print site has to hand this to `printEmittedModule` as its `source`, or
	 * the map attributes the value's positions to a different string.
	 */
	readonly source: string;
};

/**
 * The AST twin of `supportedValueSource`.
 *
 * Same envelope, decided from a tree instead of from characters: `null` for any
 * shape the string path also refuses, so a caller's supported/unsupported
 * branch does not move when the swap lands.
 */
export function buildValueExpressionEmission(
	input: ValueExpressionEmissionInput,
): ValueExpressionEmission | null {
	const projection = valueExpressionProjection(input.valueSource, input.sourceFileName);
	if (!projection) return null;

	const node = valueExpressionNode(projection.expression, projection.source, input);
	return node ? { node, source: projection.source } : null;
}

/**
 * The AST twin of `eventWriteValueSource`: the supported envelope first, then
 * the identifier-rewrite fallback for everything else.
 *
 * The fallback is where the text path is least defensible. `replaceIdentifierPath`
 * matches on characters with only identifier-boundary guards, so it rewrites a
 * graph-read name that happens to appear inside a string literal, and it turns
 * an authored shorthand property `{ count }` into the syntactically invalid
 * `{ context.locals?.count }`. Rewriting by node identity (invariant 6) cannot do
 * either: a string literal is not an identifier node, and a shorthand property
 * is expanded to `count: <rewritten>` because that is what the tree says it is.
 * Both divergences are recorded in the parity test rather than hidden here.
 */
export function buildEventWriteValueEmission(
	input: ValueExpressionEmissionInput,
): ValueExpressionEmission | null {
	const supported = buildValueExpressionEmission(input);
	if (supported) return supported;

	const projection = valueExpressionProjection(input.valueSource, input.sourceFileName);
	if (!projection) return null;

	return {
		node: rewriteGraphReadsAndLocals(projection.expression, projection.source, input),
		source: projection.source,
	};
}

type ValueExpressionProjection = {
	/** The one text every node parsed here carries an offset into. */
	readonly source: string;
	readonly expression: AnyNode;
};

/**
 * Parse one authored value expression, once.
 *
 * The expression is parenthesized so it parses as an expression statement in
 * every authored form — an object literal at statement start would otherwise be
 * a block, and a string literal would be a directive. `preserveParens: false`
 * then drops the wrapper, and the printer re-derives whatever parentheses the
 * expression actually needs in the position it lands in.
 */
function valueExpressionProjection(
	valueSource: string | undefined,
	filename: string,
): ValueExpressionProjection | null {
	const trimmed = valueSource?.trim();
	if (!trimmed) return null;

	const source = `(${trimmed});`;
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) return null;

	const statements = asNodes((program as unknown as AnyNode).body);
	if (statements.length !== 1) return null;

	const only = statements[0];
	if (!only || only.type !== 'ExpressionStatement' || !isNode(only.expression)) return null;

	return { source, expression: only.expression };
}

/** The authored text a node spans, trimmed — the string the scanners compared. */
function valueNodeText(node: AnyNode, source: string): string {
	const { start, end } = node;
	if (typeof start !== 'number' || typeof end !== 'number') return '';

	return source.slice(start, end).trim();
}

/**
 * One node of `supportedValueSource`, in the same order it tries its cases.
 *
 * The four leaf cases run first and on the node's own authored text, because
 * that is what the string path matches on: a graph read is recognized by its
 * recorded `source` string, not by its shape. Only when all four miss does the
 * walk descend into the node's structure.
 */
function valueExpressionNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const text = valueNodeText(node, source);
	if (!text) return null;

	const leaf =
		literalValueNode(node, text) ??
		eventFieldValueNode(text, input.eventParameters) ??
		graphReadValueNode(text, input.graphReads) ??
		localValueNode(text, input.localNames);
	if (leaf) return leaf;

	if (node.type === 'ArrayExpression') return arrayLiteralValueNode(node, source, input);
	if (node.type === 'ObjectExpression') return objectLiteralValueNode(node, source, input);
	if (node.type === 'CallExpression') return staticCallValueNode(node, source, input);
	if (node.type === 'UnaryExpression') return unaryValueNode(node, source, input);
	if (node.type === 'ConditionalExpression') return conditionalValueNode(node, source, input);
	if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
		return binaryValueNode(node, source, input);
	}

	return null;
}

/**
 * `literalValueSource`, node-shaped.
 *
 * The parsed node is returned as it stands rather than rebuilt: it carries its
 * authored `raw`, so the quote the author wrote survives under
 * `quotes: 'preserve'`, and it carries its span, so the map points at the
 * literal the author typed. `-1` is a unary node here and a matched literal in
 * the string path; returning the node verbatim keeps both readings the same
 * bytes.
 */
function literalValueNode(node: AnyNode, text: string): EmissionNode | null {
	if (/^(?:true|false|null|undefined)$/.test(text)) return node as unknown as EmissionNode;
	if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return node as unknown as EmissionNode;
	if (/^(['"])(?:\\.|(?!\1).)*\1$/.test(text)) return node as unknown as EmissionNode;

	return null;
}

/** `eventFieldAssignmentSource`, node-shaped. */
function eventFieldValueNode(
	text: string,
	eventParameters: ReadonlyArray<string>,
): EmissionNode | null {
	const eventParameter = eventParameters[0];
	if (!eventParameter) return null;
	if (text === eventParameter) return memberChainNode('context.event');
	if (!text.startsWith(`${eventParameter}.`)) return null;

	const fields = text
		.slice(eventParameter.length + 1)
		.split('.')
		.filter(Boolean);
	if (fields.length === 0) return null;
	if (fields.some((field) => !VALUE_IDENTIFIER_PATTERN.test(field))) return null;

	if (fields[0] === 'currentTarget') {
		const currentTargetFields = fields.slice(1);
		return currentTargetFields.length === 0
			? memberChainNode('context.element')
			: optionalPathNode(memberChainNode('context.element'), currentTargetFields);
	}

	return optionalPathNode(memberChainNode('context.event'), fields);
}

/** `graphReadSource`, node-shaped. */
function graphReadValueNode(
	text: string,
	graphReads: ReadonlyArray<LoweredStateRead>,
): EmissionNode | null {
	const graphRead = graphReads.find((read) => read.source === text);
	if (!graphRead) return null;

	return graphReadCall({
		callee: 'context.graph.read',
		graphNodeId: graphRead.graphNodeId,
		path: graphRead.path,
	});
}

/** `localValueSource`, node-shaped. */
function localValueNode(text: string, localNames: ReadonlySet<string>): EmissionNode | null {
	const path = staticDottedPath(text);
	if (!path || path.length < 2) return null;
	if (!localNames.has(path[0] ?? '')) return null;

	return optionalPathNode(memberChainNode('context.locals'), path);
}

/** The band-local twin of `staticSourcePath`, which reaches the scanner band. */
function staticDottedPath(text: string): ReadonlyArray<string> | null {
	const parts = text.split('.');
	if (parts.length === 0) return null;
	if (parts.some((part) => !VALUE_IDENTIFIER_PATTERN.test(part))) return null;

	return parts;
}

/**
 * `<base>?.<a>?.<b>` as one `ChainExpression`.
 *
 * ESTree puts a single `ChainExpression` around the whole optional chain rather
 * than one per link, so the links nest inside and only the outermost is wrapped.
 * `optionalMemberNode` in the foundation builds a one-link chain, which cannot
 * express the multi-field paths this band emits for `context.event?.a?.b`.
 */
function optionalPathNode(base: EmissionNode, path: ReadonlyArray<string>): EmissionNode {
	let expression = base;
	for (const part of path) {
		expression = {
			type: 'MemberExpression',
			object: expression,
			property: identifierNode(part),
			computed: false,
			optional: true,
		};
	}

	return { type: 'ChainExpression', expression };
}

/**
 * `arrayLiteralValueSource`, node-shaped.
 *
 * `splitTopLevelArrayElementSources` and `formatArrayLiteralElements` exist to
 * keep holes and a trailing comma straight while splitting characters; the
 * parser reports a hole as a `null` element, which is the same fact without the
 * bookkeeping.
 */
function arrayLiteralValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const elements: (EmissionNode | null)[] = [];

	for (const element of Array.isArray(node.elements) ? node.elements : []) {
		if (element === null || element === undefined) {
			elements.push(null);
			continue;
		}
		if (!isNode(element)) return null;

		if (element.type === 'SpreadElement') {
			if (!isNode(element.argument)) return null;
			const spread = valueExpressionNode(element.argument, source, input);
			if (!spread) return null;
			elements.push(spreadNode(spread));
			continue;
		}

		const value = valueExpressionNode(element, source, input);
		if (!value) return null;
		elements.push(value);
	}

	return { type: 'ArrayExpression', elements };
}

/** `objectLiteralValueSource` and `objectLiteralPropertySource`, node-shaped. */
function objectLiteralValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const properties: EmissionNode[] = [];

	for (const property of asNodes(node.properties)) {
		if (property.type === 'SpreadElement') {
			if (!isNode(property.argument)) return null;
			const spread = valueExpressionNode(property.argument, source, input);
			if (!spread) return null;
			properties.push(spreadNode(spread));
			continue;
		}

		if (property.type !== 'Property') return null;
		if (property.kind !== 'init' || property.method === true) return null;
		if (!isNode(property.key) || !isNode(property.value)) return null;

		const value = valueExpressionNode(property.value, source, input);
		if (!value) return null;

		const key = objectLiteralKeyNode(property, source, input);
		if (!key) return null;

		properties.push({
			type: 'Property',
			kind: 'init',
			method: false,
			shorthand: false,
			computed: property.computed === true,
			key,
			value,
		});
	}

	return { type: 'ObjectExpression', properties };
}

/**
 * `objectLiteralKeySource`, node-shaped.
 *
 * A computed key is a value in its own right and goes back through the walk. A
 * plain key is returned verbatim, and gated on the same three shapes
 * `isSupportedObjectLiteralKey` accepts, so a key form the string path refuses
 * (`1e3:`, `0x10:`) is still refused here.
 */
function objectLiteralKeyNode(
	property: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const key = property.key;
	if (!isNode(key)) return null;

	if (property.computed === true) return valueExpressionNode(key, source, input);

	const text = valueNodeText(key, source);
	if (!isSupportedObjectLiteralKeyText(text)) return null;

	return key as unknown as EmissionNode;
}

/** The band-local twin of `isSupportedObjectLiteralKey`. */
function isSupportedObjectLiteralKeyText(text: string): boolean {
	return (
		VALUE_IDENTIFIER_PATTERN.test(text) ||
		/^(['"])(?:\\.|(?!\1).)*\1$/.test(text) ||
		/^(?:\d+|\d*\.\d+)$/.test(text)
	);
}

/** `staticCallValueSource`, node-shaped. */
function staticCallValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	if (node.optional === true) return null;
	if (!isNode(node.callee)) return null;

	const calleeText = valueNodeText(node.callee, source);
	if (!VALUE_STATIC_CALLEE_PATTERN.test(calleeText)) return null;
	if (!canEmitStaticCalleeText(calleeText, input.moduleImports)) return null;

	const args: EmissionNode[] = [];
	for (const argument of Array.isArray(node.arguments) ? node.arguments : []) {
		if (!isNode(argument)) return null;
		// The string path splits arguments on top-level commas and hands each one
		// to `supportedValueSource`, which refuses a leading `...`. A spread
		// argument is therefore unsupported on both paths.
		if (argument.type === 'SpreadElement') return null;

		const value = valueExpressionNode(argument, source, input);
		if (!value) return null;
		args.push(value);
	}

	return callNode(node.callee as unknown as EmissionNode, args);
}

/** The band-local twin of `canEmitStaticCallCallee`. */
function canEmitStaticCalleeText(
	callee: string,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
): boolean {
	const [rootName] = callee.split('.');
	if (!rootName) return false;
	if (moduleImports.some((moduleImport) => moduleImport.localName === rootName)) return true;
	if (callee.includes('.')) return VALUE_GLOBAL_CALL_ROOTS.has(rootName);

	return false;
}

/** `unaryValueSource`, node-shaped. */
function unaryValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const operator = typeof node.operator === 'string' ? node.operator : '';
	if (node.prefix !== true || !VALUE_UNARY_OPERATORS.has(operator)) return null;
	if (!isNode(node.argument)) return null;

	const argument = valueExpressionNode(node.argument, source, input);
	if (!argument) return null;

	return { type: 'UnaryExpression', operator, prefix: true, argument };
}

/** `conditionalValueSource`, node-shaped. */
function conditionalValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	if (!isNode(node.test) || !isNode(node.consequent) || !isNode(node.alternate)) return null;

	const test = valueExpressionNode(node.test, source, input);
	const consequent = valueExpressionNode(node.consequent, source, input);
	const alternate = valueExpressionNode(node.alternate, source, input);
	if (!test || !consequent || !alternate) return null;

	return conditionalNode(test, consequent, alternate);
}

/** `binaryValueSource`, node-shaped, for both the binary and logical forms. */
function binaryValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const operator = typeof node.operator === 'string' ? node.operator : '';
	if (!VALUE_BINARY_OPERATORS.has(operator)) return null;
	if (!isNode(node.left) || !isNode(node.right)) return null;

	const left = valueExpressionNode(node.left, source, input);
	const right = valueExpressionNode(node.right, source, input);
	if (!left || !right) return null;

	if (operator === '&&' || operator === '||' || operator === '??') {
		return logicalNode(operator, left, right);
	}

	return binaryNode(operator, left, right);
}

/**
 * The AST twin of `spliceGraphReadsAndLocals` — rewriting by node identity
 * rather than by character search (invariant 6).
 *
 * A node is rewritten when its own authored text is a recorded graph read's
 * source, outermost first, which is what the string path's longest-source-first
 * sort approximates. A bare identifier that names a row local becomes
 * `context.locals?.<name>`. Everything else is cloned through unchanged.
 *
 * Two positions are never rewritten, because they are not value positions: the
 * property of a non-computed member access, and the key of a non-computed
 * property. A shorthand property is expanded to `key: <rewritten>` rather than
 * left shorthand, since a rewritten value can no longer be spelled by its key.
 */
function rewriteGraphReadsAndLocals(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode {
	// A property is checked before its own text is, because a shorthand
	// property's text is its key's text: matching there would replace the whole
	// property with a bare expression, which is what the string path does and
	// what makes its output unparseable.
	if (node.type === 'Property') {
		const key = isNode(node.key) ? node.key : null;
		const value = isNode(node.value) ? node.value : null;
		if (!key || !value) return node as unknown as EmissionNode;

		return {
			...(node as unknown as EmissionNode),
			shorthand: false,
			key:
				node.computed === true
					? rewriteGraphReadsAndLocals(key, source, input)
					: (key as unknown as EmissionNode),
			value: rewriteGraphReadsAndLocals(value, source, input),
		};
	}

	const text = valueNodeText(node, source);
	const graphRead = text
		? input.graphReads.find((read) => read.source === text)
		: undefined;
	if (graphRead) {
		return graphReadCall({
			callee: 'context.graph.read',
			graphNodeId: graphRead.graphNodeId,
			path: graphRead.path,
		});
	}

	if (node.type === 'Identifier' && typeof node.name === 'string' && input.localNames.has(node.name)) {
		return optionalPathNode(memberChainNode('context.locals'), [node.name]);
	}

	if (node.type === 'MemberExpression' && node.computed !== true && isNode(node.object)) {
		return {
			...(node as unknown as EmissionNode),
			object: rewriteGraphReadsAndLocals(node.object, source, input),
		};
	}

	const rewritten: Record<string, unknown> = { ...(node as Record<string, unknown>) };
	for (const [key, child] of Object.entries(node)) {
		if (key === 'parent' || key === 'loc' || key === 'range') continue;

		if (Array.isArray(child)) {
			rewritten[key] = child.map((item) =>
				isNode(item) ? rewriteGraphReadsAndLocals(item, source, input) : item,
			);
			continue;
		}
		if (isNode(child)) {
			rewritten[key] = rewriteGraphReadsAndLocals(child, source, input);
		}
	}

	return rewritten as unknown as EmissionNode;
}

// ---------------------------------------------------------------------------
// Event-handler emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 5:
// "`emitEventHandlerModule`, the largest and riskiest: the span-splicing band at
// lines 490-900, capture-slot substitution, and write lowering. This is the unit
// that must also settle comment migration across a move."
//
// **Comment migration across a move is settled, and the answer is yes.** The
// spec lists it as an open question because probe `p5c` has no recorded output
// and the acceptance case printed without `attachComments`. Re-probed against
// the installed `yuku-codegen@0.9.0` while writing this band, and asserted in
// `test/emit-event-handler.test.ts`: with `EMISSION_PARSE_OPTIONS`'
// `attachComments: true`, the parser hangs each comment off the *node* it
// belongs to, in that node's own `comments` array. Moving the node into a
// synthesized `Program` moves the array with it, and `comments: 'all'` prints it
// back in place. Three classes were checked — a leading line comment, a leading
// block comment, and a trailing same-line comment — and all three survive the
// move. The band relies on that: a node this walk *replaces* has its `comments`
// carried onto the replacement (`carryEventHandlerComments`), because a
// replacement is the one operation that would otherwise drop them.
//
// The emitter also *writes* two comments of its own, and both are built rather
// than carried:
//
// - `/* scalar leaf marker: context.graph.update({ */` above a scalar-leaf
//   export, through the foundation's `withLeadingBlockComment`. It is not
//   decoration: `packages/bundler/test/rolldown.test.ts` asserts that a
//   scalar-leaf symbol module still contains the text `context.graph.update({`,
//   which after the leaf rewrite exists only inside this comment.
// - `/* legacy callback binding was: const <p> = context.event; */` under each
//   argument-vector parameter binding, through the band-local
//   `withTrailingBlockComment`. The foundation owns only the leading form; the
//   trailing form is `position: 'after'`, which the same printer accepts.
//
// Everything else here is the span-splicing band rebuilt as a tree walk. The
// authored handler is parsed once, and reads, writes, capture-slot invocations,
// and element-handle calls are rewritten by *node identity* (invariant 6) rather
// than by the offset arithmetic `spliceEventHandlerBody` does over the authored
// text. Outermost wins by construction: a rewritten node is not descended into,
// which is what the string path's "drop every strictly nested span" filter
// approximates.
//
// It is not the wired path. `emitEventHandlerModule` above still produces the
// bytes the compiler ships, and `SYMBOL_MODULE_AST_KINDS` does not list these
// two kinds; `test/emit-event-handler.test.ts` runs both paths over the same
// symbols and names every class of byte difference between them. Invariant 2
// makes the swap an owner-approved step rather than a side effect of this unit.
//
// The band calls nothing in the scanner band (`topLevelBinaryOperators` through
// `sourceReferencesIdentifier`), which invariant 5 keeps alive until stage 1's
// final unit. Three of that band's helpers are re-expressed here rather than
// shared, exactly as the value band re-expresses its four: `isIdentifierObjectKey`
// (as the value band's `VALUE_IDENTIFIER_PATTERN`, reused because a fourth copy
// of one regex buys nothing), `compoundAssignmentOperator` (as
// `EVENT_COMPOUND_ASSIGNMENT_OPERATORS`), and `sourceReferencesIdentifier` (as
// `deriveReferencedIdentifierNames`, which reads the tree instead of scanning
// emitted text and so does not count a name that appears only inside a string).
// ---------------------------------------------------------------------------

export type EventHandlerEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>;
	/** Row-local names in scope, as `emitSymbolModules` selects them. */
	readonly localNames: ReadonlySet<string>;
	/** The component-routed capture slots, as `emitSymbolModules` filters them. */
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
	/** Whether some other symbol binds this one as a callback route. */
	readonly usesArgumentVector: boolean;
	/** The authored file the handler was extracted from; names the map. */
	readonly sourceFileName: string;
};

/** The body of the `/* scalar leaf marker: ... *\/` comment, delimiters excluded. */
const EVENT_SCALAR_LEAF_MARKER = ' scalar leaf marker: context.graph.update({ ';

/** The one import a scalar-leaf module carries. */
const EVENT_SCALAR_WRITE_IMPORT: SemanticModuleImport = {
	kind: 'named',
	localName: 'marklessWriteScalar',
	importedName: 'marklessWriteScalar',
	source: '@markless/web/fns/write-scalar',
};

/** The band-local twin of `compoundAssignmentOperator`. */
const EVENT_COMPOUND_ASSIGNMENT_OPERATORS: ReadonlyMap<string, string> = new Map([
	['**=', '**'],
	['&&=', '&&'],
	['||=', '||'],
	['??=', '??'],
	['+=', '+'],
	['-=', '-'],
	['*=', '*'],
	['/=', '/'],
	['%=', '%'],
	['&=', '&'],
	['|=', '|'],
	['^=', '^'],
	['<<=', '<<'],
	['>>=', '>>'],
	['>>>=', '>>>'],
]);

/** The literal shapes `emitElementHandleCall` accepts as an argument. */
const EVENT_HANDLE_ARGUMENT_LITERAL =
	/^(?:'[^']*'|"[^"]*"|`[^`]*`|-?\d+(?:\.\d+)?|true|false|null|undefined)$/;

/**
 * Keys the handler walk does not descend into.
 *
 * The same set `DERIVE_WALK_IGNORED_KEYS` uses, for the same reason: the string
 * path detected reads by walking with `childNodes`, so matching its blind spots
 * is what makes this emitter select the same nodes. `comments` matters twice
 * over here — a parsed comment object has a `type` field, so `isNode` accepts
 * it, and a walk that did not skip the key would try to rewrite comments as
 * expressions.
 */
const EVENT_WALK_IGNORED_KEYS: ReadonlySet<string> = DERIVE_WALK_IGNORED_KEYS;

type EventHandlerSymbol = EventHandlerEmissionInput['symbol'];

type EventElementHandleCall = NonNullable<
	Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['elementHandleCalls']
>[number];

/**
 * Build the print input for one event-handler or callback-prop module.
 *
 * Split from the print so the site's focused test can run the foundation's
 * determinism helper (invariant 7) over the exact tree the emitter would print.
 * `null` is never returned today — both kinds always produce a module, as the
 * string path does — but the signature matches its sibling
 * `buildSymbolModuleEmission`, whose `null` means "no module for this symbol".
 */
export function buildEventHandlerEmission(
	input: EventHandlerEmissionInput,
): EmissionPrintInput | null {
	const { symbol } = input;
	const exportName = symbolExportName(symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: symbol.id,
	};
	const projection = eventHandlerProjection(symbol.source, input.sourceFileName);
	// Every node with a span carries an offset into this one text, so it is what
	// the print site hands the printer as its `source` (invariant 3).
	const source = projection?.source ?? symbol.source;

	const scalarLeaf =
		input.captureSlots.length === 0 ? eventHandlerScalarLeafStatements(input, projection) : null;
	if (scalarLeaf) {
		return {
			program: moduleProgramNode([
				moduleImportNode({
					kind: EVENT_SCALAR_WRITE_IMPORT.kind,
					localName: EVENT_SCALAR_WRITE_IMPORT.localName,
					importedName: EVENT_SCALAR_WRITE_IMPORT.importedName,
					source: EVENT_SCALAR_WRITE_IMPORT.source,
				}),
				withLeadingBlockComment(
					exportNamedDeclarationNode(
						eventHandlerFunctionNode(exportName, false, scalarLeaf),
					),
					EVENT_SCALAR_LEAF_MARKER,
				),
			]),
			source,
			outputFileName: `${exportName}.js`,
			site,
		};
	}

	const importedReference = eventHandlerImportedReference(symbol);
	const bodyStatements = importedReference
		? [importedHandlerCallStatement(input, projection)]
		: eventHandlerAuthoredStatements(input, projection, source);

	// The string path decides which imports survive by scanning the emitted
	// *body* text only, so this reads the same statements and no others.
	const referenced = deriveReferencedIdentifierNames(bodyStatements);
	const imports = uniqueModuleImports(
		(symbol.moduleImports ?? []).filter((moduleImport) =>
			referenced.has(moduleImport.localName),
		),
	);

	const isAsync =
		!importedReference &&
		(symbol.source.trimStart().startsWith('async ') ||
			input.captureSlots.some(callbackCaptureSlot));

	return {
		program: moduleProgramNode([
			...imports.map((moduleImport) =>
				moduleImportNode({
					kind: moduleImport.kind,
					localName: moduleImport.localName,
					importedName: moduleImport.importedName,
					source: moduleImport.source,
				}),
			),
			exportNamedDeclarationNode(
				eventHandlerFunctionNode(exportName, isAsync, [
					...(importedReference ? [] : eventHandlerParameterStatements(input)),
					...bodyStatements,
				]),
			),
		]),
		source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed handler module, with its source map (invariant 3). */
export function emitEventHandlerModuleNodes(
	input: EventHandlerEmissionInput,
): EmittedModule | null {
	const emission = buildEventHandlerEmission(input);
	return emission ? printEmittedModule(emission) : null;
}

/**
 * The row-local names `emitSymbolModules` puts in scope for one symbol.
 *
 * Exported so the site's parity test can feed both paths the identical local-name
 * set the dispatcher would. The selection is recursive over render chunks, so
 * restating it in the test would be restating a rule rather than testing one.
 */
export function eventHandlerRowLocalNames(
	renderData: SymbolModulesInput['renderData'],
	symbolId: string,
): ReadonlySet<string> {
	return rowLocalNamesBySymbol(renderData).get(symbolId) ?? emptyLocalNames;
}

/**
 * `export [async ]function <name>(context) { ... }` — the declaration both
 * module shapes export.
 *
 * The foundation's `functionDeclarationNode` builds only the synchronous form,
 * and a handler that awaits a capture invocation has to be `async`.
 */
function eventHandlerFunctionNode(
	name: string,
	isAsync: boolean,
	statements: ReadonlyArray<EmissionNode>,
): EmissionNode {
	return {
		type: 'FunctionDeclaration',
		id: identifierNode(name),
		async: isAsync,
		generator: false,
		params: [identifierNode('context')],
		body: { type: 'BlockStatement', body: [...statements] },
	};
}

/**
 * Attach a trailing block comment to a statement.
 *
 * The mirror of the foundation's `withLeadingBlockComment`, which owns only
 * `position: 'before'`. `sameLine: false` puts the comment on its own line after
 * the statement, which is the layout the string path writes for the legacy
 * callback binding note.
 */
function withTrailingBlockComment(node: EmissionNode, value: string): EmissionNode {
	return {
		...node,
		comments: [{ type: 'Block', position: 'after', sameLine: false, value }],
	};
}

/**
 * Carry a replaced node's comments onto its replacement.
 *
 * Rewriting is the one operation that can drop an authored comment: a cloned
 * node keeps its `comments` array through the spread, but a node swapped out for
 * a synthesized graph call would leave its comments behind with the node that no
 * longer exists.
 */
function carryEventHandlerComments(from: AnyNode, to: EmissionNode): EmissionNode {
	const comments = from.comments;
	if (!Array.isArray(comments) || comments.length === 0) return to;
	if (Array.isArray((to as { readonly comments?: unknown }).comments)) return to;

	return { ...to, comments };
}

type EventHandlerProjection = {
	/** The one text every node parsed here carries an offset into. */
	readonly source: string;
	readonly expression: AnyNode;
};

/**
 * Parse the authored handler once, as an expression.
 *
 * The handler is parenthesized for the same reason the behavior and value bands
 * parenthesize theirs: an anonymous `function () {}` at statement position is a
 * syntax error, and `preserveParens: false` drops the wrapper again before
 * anything is printed. The one-character offset the wrapper introduces is why
 * every text comparison in this band goes through `valueNodeText`, which reads
 * the node's own span, rather than through arithmetic on the authored source.
 */
function eventHandlerProjection(
	handlerSource: string,
	filename: string,
): EventHandlerProjection | null {
	const trimmed = handlerSource.trim();
	if (!trimmed) return null;

	const source = `(${trimmed});`;
	let parsed: ReturnType<typeof parseEmissionSource>;
	try {
		parsed = parseEmissionSource(source, filename, 'ts');
	} catch {
		// A handler whose authored source does not parse has no tree to rewrite.
		// The caller emits `void context;`, which is what the string path's own
		// body-locator failure produces.
		return null;
	}
	if (parsed.errors.length > 0) return null;

	const statements = asNodes((parsed.program as unknown as AnyNode).body);
	const only = statements[0];
	if (statements.length !== 1 || !only || only.type !== 'ExpressionStatement') return null;
	if (!isNode(only.expression)) return null;

	return { source, expression: only.expression };
}

/** The parsed handler when it is a function; `null` for every other shape. */
function eventHandlerFunctionExpression(
	projection: EventHandlerProjection | null,
): AnyNode | null {
	const expression = projection?.expression;
	if (!expression) return null;
	if (expression.type !== 'ArrowFunctionExpression' && expression.type !== 'FunctionExpression') {
		return null;
	}

	return expression;
}

/**
 * The handler body as statements: a block's own statements, or the concise
 * arrow's expression wrapped in a `return`, which is the `return <expr>;` the
 * string path's `eventHandlerBodySource` synthesizes for the same shape.
 */
function eventHandlerBodyNodes(fn: AnyNode): AnyNode[] {
	const body = fn.body;
	if (!isNode(body)) return [];
	if (body.type === 'BlockStatement') return asNodes(body.body);

	return [{ type: 'ReturnStatement', argument: body } as AnyNode];
}

/** `void context;`, the body the string path emits when it finds none. */
function voidContextStatement(): EmissionNode {
	return {
		type: 'ExpressionStatement',
		expression: {
			type: 'UnaryExpression',
			operator: 'void',
			prefix: true,
			argument: identifierNode('context'),
		},
	};
}

/** The band-local twin of `importedHandlerReference`. */
function eventHandlerImportedReference(symbol: EventHandlerSymbol): SemanticModuleImport | null {
	const source = symbol.source.trim();
	if (!source) return null;

	const firstName = source.split('.')[0] ?? '';
	if (!VALUE_IDENTIFIER_PATTERN.test(firstName)) return null;

	return (
		(symbol.moduleImports ?? []).find((moduleImport) => moduleImport.localName === firstName) ??
		null
	);
}

/**
 * `return <imported>(context.event);`, or the argument-vector form
 * `return <imported>(...(context.args ?? []));` for a callback prop that some
 * other symbol binds, or that takes more than one parameter.
 *
 * The callee is the parsed reference node when there is one, so it carries its
 * authored span into the source map; a handler whose source did not parse falls
 * back to a synthesized member chain over the same dotted name.
 */
function importedHandlerCallStatement(
	input: EventHandlerEmissionInput,
	projection: EventHandlerProjection | null,
): EmissionNode {
	const { symbol } = input;
	const parameters = symbol.parameters ?? [];
	const callee = projection
		? (projection.expression as unknown as EmissionNode)
		: memberChainNode(symbol.source.trim());
	const usesArguments =
		symbol.kind === 'callback-prop' && (input.usesArgumentVector || parameters.length > 1);

	return returnStatementNode(
		callNode(
			callee,
			usesArguments
				? [spreadNode(logicalNode('??', memberChainNode('context.args'), arrayNode([])))]
				: [memberChainNode('context.event')],
		),
	);
}

/**
 * `const <p> = context.event;` per parameter, or the argument-vector form with
 * its legacy-binding note underneath.
 */
function eventHandlerParameterStatements(input: EventHandlerEmissionInput): EmissionNode[] {
	const { symbol } = input;
	const parameters = symbol.parameters ?? [];
	if (parameters.length === 0) return [];

	return parameters.map((parameter, index) => {
		if (symbol.kind !== 'callback-prop' || (!input.usesArgumentVector && parameters.length <= 1)) {
			return constDeclarationNode(parameter, memberChainNode('context.event'));
		}

		return withTrailingBlockComment(
			constDeclarationNode(parameter, {
				type: 'ChainExpression',
				expression: {
					type: 'MemberExpression',
					object: memberChainNode('context.args'),
					property: literalNode(index),
					computed: true,
					optional: true,
				},
			}),
			` legacy callback binding was: const ${parameter} = context.event; `,
		);
	});
}

/** The band-local twin of `eventHandlerAuthoredBody`. */
function eventHandlerAuthoredStatements(
	input: EventHandlerEmissionInput,
	projection: EventHandlerProjection | null,
	source: string,
): EmissionNode[] {
	const { symbol } = input;
	const trimmed = symbol.source.trim();

	const directCallbackSlot = input.captureSlots.find(
		(slot) => callbackCaptureSlot(slot) && slot.source.trim() === trimmed,
	);
	if (directCallbackSlot) {
		return [
			returnStatementNode(
				eventAwaitNode(
					captureInvokeNode(
						directCallbackSlot.id,
						[memberChainNode('context.event')],
						widgetCallbackCaptureSlot(directCallbackSlot),
					),
				),
			),
		];
	}

	const directReferenceRead = (symbol.reads ?? []).find(
		(read) => read.source.trim() === trimmed,
	);
	if (directReferenceRead && VALUE_IDENTIFIER_PATTERN.test(trimmed)) {
		return [
			returnStatementNode(
				callNode(
					graphReadCall({
						callee: 'context.graph.read',
						graphNodeId: directReferenceRead.graphNodeId,
						path: directReferenceRead.path,
					}),
					[memberChainNode('context.event')],
				),
			),
		];
	}

	const fn = eventHandlerFunctionExpression(projection);
	if (!fn) return [voidContextStatement()];

	const statements = eventHandlerBodyNodes(fn);
	if (statements.length === 0) return [voidContextStatement()];

	const rewrite = eventHandlerRewrite(input, source);
	return statements.map((statement) => rewriteEventHandlerNode(statement, undefined, rewrite));
}

type EventHandlerRewrite = {
	readonly source: string;
	readonly symbol: EventHandlerSymbol;
	readonly reads: ReadonlyArray<LoweredStateRead>;
	readonly valueSlots: ReadonlyArray<CaptureSlot>;
	readonly callbackSlots: ReadonlyArray<CaptureSlot>;
	/** The handler's own parameters, as capture arguments still see them. */
	readonly eventParameters: ReadonlyArray<string>;
	/** The parameters write lowering sees, which a callback prop blanks. */
	readonly writeValueInput: ValueExpressionEmissionInput;
	readonly elementHandleCalls: ReadonlyArray<EventElementHandleCall>;
	readonly claimedWrites: Set<LoweredStateWrite>;
	readonly claimedHandleCalls: Set<EventElementHandleCall>;
};

function eventHandlerRewrite(
	input: EventHandlerEmissionInput,
	source: string,
): EventHandlerRewrite {
	const { symbol } = input;
	const parameters = symbol.parameters ?? [];

	return {
		source,
		symbol,
		reads: symbol.reads ?? [],
		valueSlots: input.captureSlots.filter((slot) => !callbackCaptureSlot(slot)),
		callbackSlots: input.captureSlots.filter(callbackCaptureSlot),
		eventParameters: parameters,
		writeValueInput: {
			valueSource: undefined,
			// `spliceEventHandlerBody` blanks the parameters for a callback prop's
			// writes, because a callback prop has no DOM event to read fields off.
			eventParameters: symbol.kind === 'callback-prop' ? [] : parameters,
			graphReads: symbol.reads ?? [],
			moduleImports: symbol.moduleImports ?? [],
			localNames: input.localNames,
			sourceFileName: input.sourceFileName,
		},
		elementHandleCalls:
			symbol.kind === 'event-handler' ? (symbol.elementHandleCalls ?? []) : [],
		claimedWrites: new Set(),
		claimedHandleCalls: new Set(),
	};
}

/**
 * One node of the handler body, rewritten.
 *
 * The four rewrites are tried outermost-first and a match stops the descent,
 * which is how this walk reproduces the string path's "drop every strictly
 * nested span" filter without sorting spans. Order matters between them exactly
 * once: a capture-slot invocation and an element-handle call are both
 * `CallExpression`s, and a write can enclose a read, so the enclosing form is
 * always asked first.
 */
function rewriteEventHandlerNode(
	node: AnyNode,
	parent: AnyNode | undefined,
	rewrite: EventHandlerRewrite,
): EmissionNode {
	if (node.type === 'Property') {
		return rewriteEventHandlerProperty(node, (child, childParent) =>
			rewriteEventHandlerNode(child, childParent, rewrite),
		);
	}

	const text = valueNodeText(node, rewrite.source);

	const invocation = captureInvocationNode(node, rewrite);
	if (invocation) return carryEventHandlerComments(node, invocation);

	const write = eventWriteNode(node, rewrite);
	if (write) return carryEventHandlerComments(node, write);

	const handleCall = elementHandleCallNode(node, text, rewrite);
	if (handleCall) return carryEventHandlerComments(node, handleCall);

	const read = eventReadNode(node, parent, text, rewrite);
	if (read) return carryEventHandlerComments(node, read);

	if (node.type === 'ChainExpression' && isNode(node.expression)) {
		return chainExpressionNode(node, rewriteEventHandlerNode(node.expression, node, rewrite));
	}

	// A non-computed member's property is a property name, not a reference, so
	// only the object is walked — the same rule `rewriteGraphReadsAndLocals`
	// applies in the value band.
	if (node.type === 'MemberExpression' && node.computed !== true && isNode(node.object)) {
		return {
			...(node as unknown as EmissionNode),
			object: rewriteEventHandlerNode(node.object, node, rewrite),
		};
	}

	return rewriteEventHandlerChildren(node, (child) =>
		rewriteEventHandlerNode(child, node, rewrite),
	);
}

/**
 * Re-wrap an optional chain around its rewritten interior, or drop the wrapper
 * when there is no longer a chain to describe.
 *
 * A guarded callback — `onChange?.('next')` — parses as a `ChainExpression`
 * around the call. When the captured prop routes to a value the call survives
 * and the wrapper still belongs; when it routes to a callback symbol the whole
 * call becomes `await context.capture.invoke(...)`, and ESTree has no
 * `ChainExpression` around an `AwaitExpression`. The printer tolerates the
 * malformed shape today, which is exactly why it is not worth depending on.
 */
function chainExpressionNode(chain: AnyNode, expression: EmissionNode): EmissionNode {
	const type = (expression as { readonly type?: string }).type;
	if (type !== 'MemberExpression' && type !== 'CallExpression') return expression;

	return { ...(chain as unknown as EmissionNode), expression };
}

/**
 * A shorthand property's key and value cover the same text, so a generic walk
 * would match both. Only the value is a read, and replacing it has to drop the
 * shorthand flag or the printer renders the property as its key alone and
 * silently discards the rewrite.
 */
function rewriteEventHandlerProperty(
	property: AnyNode,
	visit: (node: AnyNode, parent: AnyNode) => EmissionNode,
): EmissionNode {
	const key = isNode(property.key) ? property.key : null;
	const value = isNode(property.value) ? property.value : null;
	if (!key || !value) return property as unknown as EmissionNode;

	return {
		...(property as unknown as EmissionNode),
		shorthand: false,
		key: property.computed === true ? visit(key, property) : (key as unknown as EmissionNode),
		value: visit(value, property),
	};
}

/** Clone a node, rewriting every child node and leaving everything else alone. */
function rewriteEventHandlerChildren(
	node: AnyNode,
	visit: (child: AnyNode) => EmissionNode,
): EmissionNode {
	const rewritten: Record<string, unknown> = { ...(node as Record<string, unknown>) };

	for (const [key, child] of Object.entries(node)) {
		if (EVENT_WALK_IGNORED_KEYS.has(key)) continue;

		if (Array.isArray(child)) {
			rewritten[key] = child.map((item) => (isNode(item) ? visit(item) : item));
			continue;
		}
		if (isNode(child)) rewritten[key] = visit(child);
	}

	return rewritten as unknown as EmissionNode;
}

/** `await context.capture.invoke("slot", [ ... ])`. */
function captureInvocationNode(
	node: AnyNode,
	rewrite: EventHandlerRewrite,
): EmissionNode | null {
	if (node.type !== 'CallExpression' || !isNode(node.callee)) return null;

	const calleeText = valueNodeText(node.callee, rewrite.source);
	const slot = rewrite.callbackSlots.find((candidate) => candidate.source === calleeText);
	if (!slot) return null;

	const args = (Array.isArray(node.arguments) ? node.arguments : []).flatMap((argument) =>
		isNode(argument) ? [rewriteCaptureArgumentNode(argument, undefined, rewrite)] : [],
	);

	return eventAwaitNode(captureInvokeNode(slot.id, args, widgetCallbackCaptureSlot(slot)));
}

// A widget callback slot is dropped when no consumer filled it, so the part's
// own symbol may run with no capture context at all; that call must no-op.
function widgetCallbackCaptureSlot(slot: CaptureSlot): boolean {
	return slot.routes.some((route) => route.kind === 'widget-callback-route');
}

function captureInvokeNode(
	slotId: string,
	args: ReadonlyArray<EmissionNode>,
	optional = false,
): EmissionNode {
	const invocationArguments = [literalNode(slotId), arrayNode(args)];
	const invocation = callNode(memberChainNode('context.capture.invoke'), invocationArguments);
	if (!optional) return invocation;

	return conditionalNode(
		memberChainNode('context.capture'),
		invocation,
		identifierNode('undefined'),
	);
}

function eventAwaitNode(argument: EmissionNode): EmissionNode {
	return { type: 'AwaitExpression', argument };
}

/**
 * The band-local twin of `captureArgumentSource`: reads become capture or graph
 * reads, and a reference to the handler's own event parameter becomes the
 * `context.event` field path the runtime supplies instead.
 *
 * The string path runs those two as separate passes over text, the second a
 * regular expression over the output of the first. Here they are one walk, which
 * is why a parameter name inside a string literal — which the regular expression
 * rewrites — is left alone.
 */
function rewriteCaptureArgumentNode(
	node: AnyNode,
	parent: AnyNode | undefined,
	rewrite: EventHandlerRewrite,
): EmissionNode {
	if (node.type === 'Property') {
		return rewriteEventHandlerProperty(node, (child, childParent) =>
			rewriteCaptureArgumentNode(child, childParent, rewrite),
		);
	}

	const text = valueNodeText(node, rewrite.source);

	const read = eventReadNode(node, parent, text, rewrite);
	if (read) return carryEventHandlerComments(node, read);

	if (isGraphReadExpression(node)) {
		const eventField = eventFieldValueNode(text, rewrite.eventParameters);
		if (eventField) return carryEventHandlerComments(node, eventField);
	}

	if (node.type === 'ChainExpression' && isNode(node.expression)) {
		return chainExpressionNode(node, rewriteCaptureArgumentNode(node.expression, node, rewrite));
	}

	if (node.type === 'MemberExpression' && node.computed !== true && isNode(node.object)) {
		return {
			...(node as unknown as EmissionNode),
			object: rewriteCaptureArgumentNode(node.object, node, rewrite),
		};
	}

	return rewriteEventHandlerChildren(node, (child) =>
		rewriteCaptureArgumentNode(child, node, rewrite),
	);
}

/** `context.capture.read("slot")` or `context.graph.read("id", ["path"])`. */
function eventReadNode(
	node: AnyNode,
	parent: AnyNode | undefined,
	text: string,
	rewrite: EventHandlerRewrite,
): EmissionNode | null {
	if (!text) return null;
	if (!isGraphReadExpression(node)) return null;
	if (!isValuePositionGraphRead(node, parent)) return null;

	const read = rewrite.reads.find((candidate) => candidate.source === text);
	if (!read) return null;

	const slot = rewrite.valueSlots.find((candidate) => captureSlotMatchesRead(candidate, read));
	if (slot) return callNode(memberChainNode('context.capture.read'), [literalNode(slot.id)]);

	return graphReadCall({
		callee: 'context.graph.read',
		graphNodeId: read.graphNodeId,
		path: read.path,
	});
}

/**
 * The lowered graph call for a write whose authored node this is.
 *
 * A write the lowering cannot express is left as the author wrote it, which is
 * what the string path does when `emitEventWriteExpression` returns `null`: the
 * span is dropped from the replacement list and the authored text survives.
 */
function eventWriteNode(node: AnyNode, rewrite: EventHandlerRewrite): EmissionNode | null {
	for (const write of rewrite.symbol.writes ?? []) {
		if (rewrite.claimedWrites.has(write)) continue;
		if (!eventWriteNodeMatches(node, write, rewrite.source)) continue;

		const lowered = loweredEventWriteNode(node, write, rewrite);
		if (!lowered) continue;

		rewrite.claimedWrites.add(write);
		return lowered;
	}

	return null;
}

/**
 * Whether this node is the authored form of that write.
 *
 * Matched on shape and on the target's own authored text, never on an offset:
 * the string path's `handlerBodyWriteSpan` reconstructs a span by subtracting
 * the symbol's start from the write's, then falls back to `indexOf` on a
 * re-assembled source string when that lands wrong.
 */
function eventWriteNodeMatches(node: AnyNode, write: LoweredStateWrite, source: string): boolean {
	if (write.operation === 'assign') {
		if (node.type !== 'AssignmentExpression') return false;
		if (node.operator !== (write.assignmentOperator ?? '=')) return false;

		return isNode(node.left) && valueNodeText(node.left, source) === write.source;
	}

	if (write.operation === 'update') {
		if (node.type !== 'UpdateExpression') return false;
		if (write.updateOperator && node.operator !== write.updateOperator) return false;
		if (write.prefix !== undefined && node.prefix !== write.prefix) return false;

		return isNode(node.argument) && valueNodeText(node.argument, source) === write.source;
	}

	if (write.operation === 'delete') {
		if (node.type !== 'UnaryExpression' || node.operator !== 'delete') return false;

		return isNode(node.argument) && valueNodeText(node.argument, source) === write.source;
	}

	if (write.operation === 'call') {
		if (node.type !== 'CallExpression' || !isNode(node.callee)) return false;

		const callee = node.callee;
		if (callee.type !== 'MemberExpression' || callee.computed === true) return false;
		if (!isNode(callee.object) || !isNode(callee.property)) return false;
		if (callee.property.type !== 'Identifier' || callee.property.name !== write.method) {
			return false;
		}

		return valueNodeText(callee.object, source) === write.source;
	}

	return false;
}

/** The band-local twin of `emitEventWrite`, built from the authored node. */
function loweredEventWriteNode(
	node: AnyNode,
	write: LoweredStateWrite,
	rewrite: EventHandlerRewrite,
): EmissionNode | null {
	if (write.operation === 'assign') {
		const value = isNode(node.right) ? eventWriteValueNode(node.right, rewrite) : null;
		if (!value) return null;

		if (!write.assignmentOperator) {
			return graphWriteCall({ graphNodeId: write.graphNodeId, path: write.path, value });
		}

		const operator = EVENT_COMPOUND_ASSIGNMENT_OPERATORS.get(write.assignmentOperator);
		if (!operator) return null;

		return graphUpdateCall({
			graphNodeId: write.graphNodeId,
			path: write.path,
			returnValue: 'next',
			updateExpression:
				operator === '&&' || operator === '||' || operator === '??'
					? logicalNode(operator, identifierNode('value'), value)
					: binaryNode(operator, identifierNode('value'), value),
		});
	}

	if (write.operation === 'update' && write.updateOperator) {
		return graphUpdateCall({
			graphNodeId: write.graphNodeId,
			path: write.path,
			returnValue: 'next',
			updateExpression: numberStepNode(write.updateOperator),
		});
	}

	if (write.operation === 'delete') {
		return graphDeleteCall({ graphNodeId: write.graphNodeId, path: write.path });
	}

	if (write.operation === 'call' && write.method) {
		const args = eventWriteArgumentNodes(node, rewrite);
		if (!args) return null;

		return graphMethodCall({
			graphNodeId: write.graphNodeId,
			path: write.path,
			method: write.method,
			args,
		});
	}

	return null;
}

/** `Number(value) + 1` / `Number(value) - 1`, the updater both step forms emit. */
function numberStepNode(updateOperator: string): EmissionNode {
	return binaryNode(
		updateOperator === '++' ? '+' : '-',
		callNode(identifierNode('Number'), [identifierNode('value')]),
		literalNode(1),
	);
}

/** The band-local twin of `supportedArgumentSources`, node-shaped. */
function eventWriteArgumentNodes(
	node: AnyNode,
	rewrite: EventHandlerRewrite,
): EmissionNode[] | null {
	const args: EmissionNode[] = [];

	for (const argument of Array.isArray(node.arguments) ? node.arguments : []) {
		if (!isNode(argument)) return null;

		if (argument.type === 'SpreadElement') {
			if (!isNode(argument.argument)) return null;

			const spread = valueExpressionNode(
				argument.argument,
				rewrite.source,
				rewrite.writeValueInput,
			);
			if (!spread) return null;

			args.push(spreadNode(spread));
			continue;
		}

		const value = valueExpressionNode(argument, rewrite.source, rewrite.writeValueInput);
		if (!value) return null;

		args.push(value);
	}

	return args;
}

/** The band-local twin of `eventWriteValueSource`, from an authored node. */
function eventWriteValueNode(node: AnyNode, rewrite: EventHandlerRewrite): EmissionNode {
	return (
		valueExpressionNode(node, rewrite.source, rewrite.writeValueInput) ??
		rewriteGraphReadsAndLocals(node, rewrite.source, rewrite.writeValueInput)
	);
}

/** `context.getElementHandle("chart")?.setData(1)`. */
function elementHandleCallNode(
	node: AnyNode,
	text: string,
	rewrite: EventHandlerRewrite,
): EmissionNode | null {
	if (node.type !== 'CallExpression' || !text) return null;

	for (const call of rewrite.elementHandleCalls) {
		if (rewrite.claimedHandleCalls.has(call)) continue;
		if (text !== call.source) continue;

		const args = elementHandleArgumentNodes(node, call, rewrite);
		if (!args) return null;

		rewrite.claimedHandleCalls.add(call);
		return {
			type: 'ChainExpression',
			expression: {
				type: 'CallExpression',
				callee: {
					type: 'MemberExpression',
					object: callNode(memberChainNode('context.getElementHandle'), [
						literalNode(call.handleName),
					]),
					property: identifierNode(call.method),
					computed: false,
					optional: true,
				},
				arguments: args,
				optional: false,
			},
		};
	}

	return null;
}

/**
 * The authored argument nodes, when `emitElementHandleCall` would accept them.
 *
 * The nodes are reused rather than rebuilt, so a string argument keeps the quote
 * the author wrote under `quotes: 'preserve'`, matching what splicing did. `null`
 * means the call is unsupported on both paths — the string path then emits no
 * replacement lines at all, and this band leaves the authored call standing
 * rather than silently deleting it.
 */
function elementHandleArgumentNodes(
	node: AnyNode,
	call: EventElementHandleCall,
	rewrite: EventHandlerRewrite,
): EmissionNode[] | null {
	const supported = call.argumentSources.every(
		(argument) =>
			EVENT_HANDLE_ARGUMENT_LITERAL.test(argument) ||
			rewrite.eventParameters.includes(argument),
	);
	if (!supported) return null;

	const args = Array.isArray(node.arguments) ? node.arguments : [];
	if (args.length !== call.argumentSources.length) return null;
	if (!args.every((argument) => isNode(argument))) return null;

	return args as unknown as EmissionNode[];
}

/**
 * The scalar-leaf body, when this handler is one: a single path-free write and
 * nothing else but event guards.
 *
 * The string path decides this over text — it deletes the authored write and the
 * guard calls from the body string and asks whether anything but semicolons is
 * left. Decided here from the parsed statements instead, which is why a guard
 * written `e.preventDefault()` without its semicolon, or across two lines, lands
 * on the same answer as the canonical spelling.
 */
function eventHandlerScalarLeafStatements(
	input: EventHandlerEmissionInput,
	projection: EventHandlerProjection | null,
): EmissionNode[] | null {
	const { symbol } = input;
	if (symbol.kind !== 'event-handler') return null;

	const writes = symbol.writes ?? [];
	if (writes.length !== 1) return null;
	if ((symbol.moduleImports ?? []).length > 0 || (symbol.elementHandleCalls ?? []).length > 0) {
		return null;
	}

	const write = writes[0];
	if (!write || write.path.length !== 0) return null;
	if (!projection) return null;

	const fn = eventHandlerFunctionExpression(projection);
	if (!fn) return null;

	const writeNode = scalarLeafWriteNode(
		eventHandlerBodyNodes(fn),
		write,
		projection.source,
		symbol.parameters ?? [],
	);
	if (!writeNode) return null;

	if (write.operation === 'update' && write.updateOperator) {
		return [
			returnStatementNode(
				graphScalarWriteCall({
					graphNodeId: write.graphNodeId,
					returnValue: 'next',
					updateExpression: numberStepNode(write.updateOperator),
				}),
			),
		];
	}

	if (write.operation !== 'assign' || write.assignmentOperator) return null;

	const right = isNode(writeNode.right) ? writeNode.right : null;
	if (!right) return null;

	const text = valueNodeText(right, projection.source);
	const value = literalValueNode(right, text) ?? localValueNode(text, input.localNames);
	if (!value) return null;

	return [
		returnStatementNode(
			graphScalarWriteCall({ graphNodeId: write.graphNodeId, value }),
		),
	];
}

/**
 * The write's own node, when the body holds nothing else that has to run.
 *
 * `null` for a body that does more, which sends the caller back to the general
 * path — the same fallthrough `scalarWriteLeafSource` returning `null` produces.
 *
 * A body carrying *any* comment is refused, which looks arbitrary until you read
 * what the string path does: `eventHandlerBodyAllowsScalarLeaf` deletes the
 * authored write and the guard calls from the body *text* and asks whether
 * anything but semicolons and whitespace is left, and a comment is left. So the
 * string path already refuses a commented body, and matching it here keeps the
 * two paths choosing the same module shape. Matching also happens to be the only
 * comment-preserving answer available: the leaf shape replaces the whole body
 * with one synthesized call, so taking it would delete the author's comment,
 * which `EMISSION_PRINT_OPTIONS`' `comments: 'all'` exists to prevent.
 */
function scalarLeafWriteNode(
	statements: ReadonlyArray<AnyNode>,
	write: LoweredStateWrite,
	source: string,
	parameters: ReadonlyArray<string>,
): AnyNode | null {
	if (statements.some((statement) => carriesComment(statement))) return null;

	let found: AnyNode | null = null;

	for (const statement of statements) {
		if (statement.type === 'EmptyStatement') continue;

		let expression: AnyNode | null;
		if (statement.type === 'ExpressionStatement' && isNode(statement.expression)) {
			expression = statement.expression;
		} else if (statement.type === 'ReturnStatement') {
			expression = isNode(statement.argument) ? statement.argument : null;
		} else {
			return null;
		}

		if (!expression) continue;
		if (isEventGuardCall(expression, parameters, source)) continue;
		if (!found && eventWriteNodeMatches(expression, write, source)) {
			found = expression;
			continue;
		}

		return null;
	}

	return found;
}

/** Whether any node in this subtree carries an attached comment. */
function carriesComment(root: AnyNode): boolean {
	const seen = new Set<object>();
	const stack: unknown[] = [root];

	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== 'object') continue;
		if (seen.has(value)) continue;
		seen.add(value);

		if (Array.isArray(value)) {
			for (const item of value) stack.push(item);
			continue;
		}

		const node = value as AnyNode;
		if (Array.isArray(node.comments) && node.comments.length > 0) return true;

		for (const [key, child] of Object.entries(node)) {
			if (EVENT_WALK_IGNORED_KEYS.has(key)) continue;
			stack.push(child);
		}
	}

	return false;
}

/** `<parameter>.preventDefault()` / `<parameter>.stopPropagation()`. */
function isEventGuardCall(
	node: AnyNode,
	parameters: ReadonlyArray<string>,
	source: string,
): boolean {
	if (node.type !== 'CallExpression' || !isNode(node.callee)) return false;
	if ((Array.isArray(node.arguments) ? node.arguments : []).length !== 0) return false;

	const callee = node.callee;
	if (callee.type !== 'MemberExpression' || callee.computed === true) return false;
	if (!isNode(callee.object) || !isNode(callee.property)) return false;
	if (callee.property.type !== 'Identifier') return false;
	if (callee.property.name !== 'preventDefault' && callee.property.name !== 'stopPropagation') {
		return false;
	}

	return parameters.includes(valueNodeText(callee.object, source));
}

// ---------------------------------------------------------------------------
// The general symbol-module path through the AST printer.
//
// `emitSymbolModule` is a dispatcher: it reads a planned symbol's kind and hands
// the symbol to the emitter that owns it. Its AST twin is the same dispatch over
// the sibling builders this file already carries, so a caller can ask for one
// symbol's printed module without knowing which band answers.
//
// Two kinds have no AST path to dispatch to yet, and this band says so by name
// rather than by silently emitting nothing: `SYMBOL_MODULE_UNMIGRATED_KINDS`
// records which unit owns each. The branch-update and async-boundary-update
// kinds never reach `emitSymbolModule` at all — `emitSymbolModules` routes them
// before this dispatcher would see them — so they are listed there too.
// ---------------------------------------------------------------------------

export type SymbolModuleEmissionInput = {
	readonly symbol: PlannedSymbol;
	readonly moduleDeclarations: readonly string[];
	readonly moduleImports: readonly SemanticModuleImport[];
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
	readonly semanticGraph: SymbolModulesInput['semanticGraph'];
	readonly renderData: SymbolModulesInput['renderData'];
	readonly omitAuthoredSource: boolean;
	/** The authored file the symbol was extracted from; names the map. */
	readonly sourceFileName: string;
	/** Row-local names in scope; only the event-handler kinds read them. */
	readonly localNames?: ReadonlySet<string>;
	/** Whether some other symbol binds this one as a callback route. */
	readonly usesArgumentVector?: boolean;
};

/** The symbol kinds `buildSymbolModuleEmission` can print from nodes today. */
export const SYMBOL_MODULE_AST_KINDS: ReadonlySet<PlannedSymbol['kind']> = new Set([
	'state-initializer',
	'shared-seed',
	'behavior',
	'async-computed-runner',
	'dom-update',
	'event-handler',
	'callback-prop',
]);

/** The kinds this dispatcher never sees, and where each is emitted instead. */
export const SYMBOL_MODULE_UNMIGRATED_KINDS: ReadonlyMap<PlannedSymbol['kind'], string> = new Map([
	[
		'sync-computed-derive',
		'emitted by emitSyncComputedDeriveModule, which prints through the derive band',
	],
	['branch-update', 'sketch item 3 - routed by emitSymbolModules, never by emitSymbolModule'],
	[
		'async-boundary-update',
		'sketch item 3 - routed by emitSymbolModules, never by emitSymbolModule',
	],
]);

/**
 * Build the print input for one planned symbol, whichever kind it is.
 *
 * `null` means one of two things, and they are distinguished by
 * `SYMBOL_MODULE_AST_KINDS`: either the symbol produces no module at all (a
 * behavior whose function source is not callable, which the string path also
 * drops), or its kind's emitter has not been migrated yet.
 */
export function buildSymbolModuleEmission(
	input: SymbolModuleEmissionInput,
): EmissionPrintInput | null {
	const { symbol } = input;

	if (symbol.kind === 'state-initializer') {
		return buildStateInitializerEmission({
			symbol,
			moduleDeclarations: input.moduleDeclarations,
			moduleImports: input.moduleImports,
			propReads: stateInitializerPropReads(
				symbol,
				input.semanticGraph,
				input.renderData,
				input.sourceFileName,
			),
			omitAuthoredSource: input.omitAuthoredSource,
			sourceFileName: input.sourceFileName,
		});
	}

	if (symbol.kind === 'shared-seed') {
		return buildSharedSeedEmission({
			symbol,
			propReads: componentPropReads(
				symbol.componentName,
				symbol.source,
				input.semanticGraph,
				input.sourceFileName,
			),
			sourceFileName: input.sourceFileName,
		});
	}

	if (symbol.kind === 'behavior') {
		if (!canEmitBehaviorModule(symbol)) return null;

		return buildBehaviorEmission({
			symbol,
			omitAuthoredSource: input.omitAuthoredSource,
			sourceFileName: input.sourceFileName,
		});
	}

	if (symbol.kind === 'async-computed-runner') {
		return buildAsyncComputedRunnerEmission({
			symbol,
			captureSlots: input.captureSlots,
			omitAuthoredSource: input.omitAuthoredSource,
			sourceFileName: input.sourceFileName,
		});
	}

	if (symbol.kind === 'dom-update') {
		return buildDomBindingEmission({ symbol, sourceFileName: input.sourceFileName });
	}

	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') {
		return buildEventHandlerEmission({
			symbol,
			localNames: input.localNames ?? emptyLocalNames,
			captureSlots: input.captureSlots,
			usesArgumentVector: input.usesArgumentVector === true,
			sourceFileName: input.sourceFileName,
		});
	}

	return null;
}

/** The printed module for one planned symbol, with its source map (invariant 3). */
export function emitSymbolModuleNodes(input: SymbolModuleEmissionInput): EmittedModule | null {
	const emission = buildSymbolModuleEmission(input);
	return emission ? printEmittedModule(emission) : null;
}

// ---------------------------------------------------------------------------
// Test seams.
//
// The string path's value emitters are module-private, and the parity test has
// to run them against the AST path on the same inputs. Exporting them through
// thin wrappers rather than by widening their declarations keeps the swap unit's
// deletion mechanical: these two functions go when the cluster goes, and no
// existing declaration was edited to add them.
// ---------------------------------------------------------------------------

/** The string path's `supportedValueSource`, for parity measurement only. */
/** The string path's `eventWriteValueSource`, for parity measurement only. */