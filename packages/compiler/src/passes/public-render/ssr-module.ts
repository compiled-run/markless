import { parseModule } from '../../js-ast.ts';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import {
	collectSsrAsyncRunnerDefinitions,
	collectSsrAsyncRunners,
	collectSsrSharedComputedSources,
	collectSsrTemplateComputedSources,
	TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX,
} from './html.ts';
import { renderBodyLines } from './render-body.ts';
import {
	armScopedSeedRefsUnder,
	componentSharedSeeds,
	childrenProjectionChain,
	childrenWidgetRootMarkerLine,
	projectedSeedPartsUnder,
	rowProjectedEdgeIdsUnder,
	sharedSeedConsumeLine,
	sharedSeedMarkerLine,
	sharedSeedPassLines,
	widgetRootDefinitionIds,
	widgetRootMarkerLine,
} from './shared-seed-pass.ts';
import { emitCatalogHelperImports, stateRuntimeImports } from './runtime-helpers.ts';
import {
	emitSameModuleSsrComponents,
	sameModuleSsrComponentNames,
	selfComposedSsrBindingLines,
	ssrComponentFunctionName,
} from './same-module.ts';
import {
	callbackSymbolIds,
	componentEdgeInstanceSegment,
	componentEdgesFor,
	componentReferences,
	destructureProps,
	emitComponentImport,
	emitValueImport,
	hasComponentImportSource,
	hasPropDependentComputed,
	isComponentRoot,
	edgeDeclaredComponentName,
	publicRenderValueImports,
	composedGraphProps,
	componentOwnedStateNodes,
	SSR_CALLBACKS_PROP_NAME,
	stateEntries,
	staticHostLocators,
	moduleScopeLines,
	objectPropertyName,
	ssrComposeStateExpression,
} from './shared.ts';
import {
	authoredResidueReadCases,
	authoredResidueSources,
	elementHandleIdReadCase,
	elementHandleIdSources,
	elementHandleResidueKinds,
	hasSharedElementHandle,
	MARKLESS_WIDGET_INSTANCE_KEY,
	renderDecisionSources,
	sharedInstancePreludeLines,
} from './residue-reader.ts';
import { collectSsrPropEvents } from './component-wiring.ts';
import { boundSymbolsForEdge, componentEdgeGraphRoutes } from './component-wiring.ts';
import type { PublicRenderRoot } from './types.ts';

/**
 * The minted id for one handle, as an expression usable anywhere this module's
 * render scope is live. It runs the SAME case the residue reader runs rather
 * than respelling the mint, because the element carrying the id and the IDREF
 * naming it must never be able to disagree about how it is spelled.
 */
function elementHandleIdSource(handleGraphNodeId: string): string {
	const readCase = elementHandleIdReadCase({
		idPrefixSource: 'marklessSsrIdPrefix',
		widgetInstanceSource: hasSharedElementHandle([handleGraphNodeId])
			? `marklessSsrRenderStateValues.get(${JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY)})`
			: null,
	});
	return `(residue=>{${readCase}})({kind:'element-handle-id',handleGraphNodeId:${JSON.stringify(handleGraphNodeId)}})`;
}

export function emitPublicSsrRenderModule(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
): string {
	if (!input.renderData.root && !isComponentRoot(rootInfo.root)) return '';

	const references = componentReferences(
		input.semanticGraph.componentEdges,
		'__marklessSsrComponent',
	);
	const asyncRunnerDefinitions = collectSsrAsyncRunnerDefinitions(input);
	const hasAsyncDependencyRegistry = asyncRunnerDefinitions.size > 0;
	const moduleScope = moduleScopeLines(input.source.source, input.source.filename);
	const valueImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
		moduleScope.join('\n'),
	);
	const hostLocators = staticHostLocators(input);
	const propEvents = collectSsrPropEvents(
		rootInfo.root,
		rootInfo.propNames,
		input.source.source,
		hostLocators,
		input.semanticGraph.events.filter((event) =>
			input.renderData.chunks
				.filter((chunk) => chunk.componentName === rootInfo.componentName)
				.some((chunk) => chunk.hosts.some((host) => host.hostNodeId === event.hostNodeId)),
		),
	);
	const remapsGraphProps = hasPropDependentComputed(input);
	const internalGraphProps = composedGraphProps(input);
	const remapsInternalGraphProps = remapsGraphProps && internalGraphProps.length > 0;
	const rootDataLines = emitSsrDataLines(input, rootInfo.componentName, references);
	const dataRenderLines = rootDataLines.render;
	const sameModuleComponents = emitSameModuleSsrComponents(
		input,
		references,
		rootInfo.componentName,
		(componentName) => emitSsrDataLines(input, componentName, references),
	);
	// Each component seeds only the payload nodes it declares; a module with no
	// same-module child owns every node, so it emits no selection at all.
	const ownedNodes =
		sameModuleComponents.length === 0
			? undefined
			: componentOwnedStateNodes(input, rootInfo.componentName, rootInfo.componentName);
	const body = [
		'',
		`const marklessSsrPropEvents = ${JSON.stringify(propEvents)};`,
		'const marklessSsrStateValues = new Map([',
		stateEntries(input, ownedNodes?.seedCellIndexes).join(',\n'),
		']);',
		// The optional render context is the per-request streaming channel
		// (T107): renderToStream threads it through child renders and async
		// runners. Omitted = exact blocking behavior.
		'async function marklessRenderSsr(props = {}, marklessSsrRenderContext) {',
		destructureProps(rootInfo.propNames, rootInfo.component, input.source.source),
		...sharedSeedPassLines(
			componentSharedSeeds(input, rootInfo.componentName),
			'marklessSsrStateValues',
			ssrSeedForwardBlockLines(
				input,
				rootInfo,
				'marklessSsrStateValues',
				ownedNodes === undefined
					? 'marklessCloneState(payloadState)'
					: `marklessSelectStateNodes(marklessCloneState(payloadState), ${JSON.stringify(ownedNodes.cellIndexes)}, ${JSON.stringify(ownedNodes.computedIndexes)})`,
				rootDataLines.seedForward,
			),
		),
		// A module that composes no same-module child owns every payload node, so
		// it keeps the whole clone and emits no selection list.
		ownedNodes === undefined
			? '	const marklessSsrPayloadState = marklessCloneState(payloadState);'
			: `	const marklessSsrPayloadState = marklessSelectStateNodes(marklessCloneState(payloadState), ${JSON.stringify(
					ownedNodes.cellIndexes,
				)}, ${JSON.stringify(ownedNodes.computedIndexes)});`,
		'	const marklessSsrRenderStateValues = new Map(marklessSsrStateValues);',
		sharedSeedConsumeLine(input, rootInfo.componentName, 'marklessSsrRenderStateValues'),
		...renderBodyLines(
			input,
			rootInfo,
			'marklessStateValue',
			'marklessSsrRenderStateValues',
			'marklessSsrPayloadState',
			[
				'const marklessSsrChildren = [];',
				'const marklessSsrBranches = [];',
				'const marklessSsrAsyncSnapshots = [];',
				...(hasAsyncDependencyRegistry
					? [
							'const marklessSsrAsyncRuns = marklessSsrRenderContext?.streaming?.runs ?? new Map();',
							`const marklessSsrAsyncRunnerDefinitions = new Map([${[
								...asyncRunnerDefinitions,
							]
								.map(
									([graphNodeId, definition]) =>
										`[${JSON.stringify(graphNodeId)},{run:${definition.source},dependencies:${JSON.stringify(definition.dependencies)},async:${String(definition.async)}}]`,
								)
								.join(',')}]);`,
						]
					: []),
			...dataRenderLines,
			],
		),
		'	const html = marklessSsrRendered.html;',
		'	const marklessSsrComposition = marklessSsrComposeView(marklessSsrRendered.structure, payloadView, marklessSsrChildren, marklessSsrAsyncSnapshots, marklessSsrIdPrefix);',
		`	const marklessSsrState = ${ssrComposeStateExpression(input, rootInfo.component, rootInfo.componentName)};`,
		remapsInternalGraphProps ? '	const marklessSsrOutput = {' : '	return {',
		'		html,',
		'		state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots),',
		'		view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) },',
		'		elementCount: marklessSsrComposition.elementCount,',
		...(remapsGraphProps
			? ['		m(graphProps, instancePath) { marklessSsrRemapGraphOutput(this, graphProps, instancePath); },']
			: []),
		'		propEvents: marklessSsrPropEvents,',
		'		externalSymbolIds: marklessSsrComposition.externalSymbolIds,',
		'		structure: marklessSsrRendered.structure,',
		'		structureTokens: marklessSsrRendered.structureTokens,',
		'	};',
		remapsInternalGraphProps
			? `	marklessSsrRemapGraphOutput(marklessSsrOutput, ${JSON.stringify(internalGraphProps)});`
			: null,
		remapsInternalGraphProps ? '	return marklessSsrOutput;' : null,
		'}',
		sharedSeedMarkerLine(
			componentSharedSeeds(input, rootInfo.componentName),
			'marklessRenderSsr',
			rootDataLines.seedForward,
		),
		widgetRootMarkerLine(
			widgetRootDefinitionIds(input, rootInfo.componentName),
			'marklessRenderSsr',
			rootDataLines.composedRootSurfaceArgs,
		),
		...childrenWidgetRootMarkerLines(input, references, [
			[rootInfo.componentName, 'marklessRenderSsr'],
			...sameModuleSsrComponentNames(
				input,
				parseModule(input.source.source, input.source.filename) as unknown as AnyNode,
				rootInfo.componentName,
			).map((name) => [name, ssrComponentFunctionName(name)] as [string, string]),
		]),
		'',
	];
	const selfBindings = selfComposedSsrBindingLines(
		references,
		rootInfo.componentName,
		'marklessRenderSsr',
	);
	const bodySource = body
		.filter((part): part is string => part !== null && part !== '')
		.join('\n')
		.replaceAll('readMarklessPublicPath', 'marklessSsrReadPublicPath');
	const helperReferenceSource = [...sameModuleComponents, bodySource].join('\n');
	return [
		...references.filter(hasComponentImportSource).map(emitComponentImport),
		...valueImports.map(emitValueImport),
		...emitCatalogHelperImports(helperReferenceSource, [
			{ module: 'ssr-data', names: ['renderSsrData'] },
			{
				module: 'ssr',
				names: [
					'marklessSsrRenderChild',
					'marklessSsrComponentPart',
					'marklessSsrRowChild',
					'marklessSsrRowPlacement',
					'marklessSsrRowSegment',
					'marklessAssertPresentationalRowChild',
					'marklessSsrBranchArm',
					'marklessSsrRunAsyncComputed',
					'marklessSsrAttachSnapshots',
					'marklessSsrMergeBranches',
					'marklessSsrAsyncArm',
					'marklessSsrArmHost',
					'marklessSsrHost',
					'marklessSsrCallbacks',
					'marklessSsrCallbackSymbol',
					'marklessSsrCallbackSlot',
					'marklessSsrSpreadProps',
					'marklessSsrSeedChild',
					'marklessSsrWidgetRoots',
					'marklessSsrChildrenWidgetRoot',
					'marklessSsrWidgetBoundary',
					// Keep the emitted SSR helper distinct from authored bindings.
					'marklessComposeState as marklessSsrComposeState',
					'marklessSsrRemapGraphOutput',
					'marklessSsrSeedPropCells',
					'marklessSsrComposeView',
					'marklessSsrPrefixAnchorHtml',
				],
			},
			stateRuntimeImports,
			{
				module: 'html',
				names: [
					'marklessSsrText',
					'marklessSsrChildrenHtml',
					'marklessSsrAttribute',
					'marklessSsrReadPublicPath',
					'marklessSsrDynamicTagName',
					'marklessSsrSpreadAttributes',
				],
			},
			{
				module: 'repeats',
				names: ['marklessSsrRepeatRows', 'marklessSsrComponentRepeatRows'],
			},
		]),
		...moduleScope,
		...sameModuleComponents,
		...selfBindings,
		bodySource,
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}

// The component edges whose slot renders inside a `@for` row, so one compile-time
// edge is many instances at render time. The walk follows only the chunks the row
// renderer hands its row context to: a row template, and a projection, which
// travels with the row that placed it. A branch arm, an async arm, an empty list,
// and a dynamic host's children are all rendered without the row context.
// The child surface a marker or a boundary check names, spelled exactly as the
// render and seed calls spell it: the module reference, and the component name
// when a named import says WHICH component of that module's surface composes.
function childSurfaceArgs(
	edge: { readonly childComponentName: string; readonly importKind?: string; readonly importSource?: string; readonly importedName?: string },
	referenceByName: ReadonlyMap<string, string>,
): string | undefined {
	const reference = referenceByName.get(edge.childComponentName);
	if (!reference) return undefined;
	const declaredName = edgeDeclaredComponentName(edge);
	return `${reference},${declaredName ? JSON.stringify(declaredName) : 'undefined'}`;
}

// One marker per component whose own `children` land inside its composition.
function childrenWidgetRootMarkerLines(
	input: PublicRenderModuleInput,
	references: ReadonlyArray<{ readonly componentName: string; readonly localName: string }>,
	components: ReadonlyArray<readonly [string, string]>,
): string[] {
	const referenceByName = new Map(references.map((entry) => [entry.componentName, entry.localName]));
	const edgeById = new Map(input.semanticGraph.componentEdges.map((edge) => [edge.id, edge]));
	return components.flatMap(([componentName, functionName]) => {
		const chain = childrenProjectionChain(input.renderData.chunks, componentName, (edgeId) =>
			componentEdgeInstanceSegment(edgeById.get(edgeId), input.semanticGraph.componentEdges),
		);
		const line = childrenWidgetRootMarkerLine(
			chain.map((link) => ({
				instancePath: link.instancePath,
				surfaceArgs: (() => {
					const edge = edgeById.get(link.componentEdgeId);
					return edge ? childSurfaceArgs(edge, referenceByName) : undefined;
				})(),
			})),
			functionName,
		);
		return line ? [line] : [];
	});
}

function rowScopedEdgeIds(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
): ReadonlySet<string> {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edgeIds = new Set<string>();
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'child-component') {
				edgeIds.add(slot.componentEdgeId);
				if (slot.projectionChunkId) walk(slot.projectionChunkId);
			} else if (slot.kind === 'repeat') walk(slot.rowTemplateId);
			// An arm decides WHETHER its body renders, never which row it is inside:
			// a component an arm holds is still the row's, so the walk follows it.
			else if (slot.kind === 'branch') for (const armId of slot.armTemplateIds) walk(armId);
		}
	};
	for (const chunk of chunks) if (chunk.kind === 'repeat-row') walk(chunk.id);
	return edgeIds;
}

/**
 * What one component contributes to the emitted SSR function: the render lines
 * and, for a component whose own children sit inside a composed widget root,
 * the lines its seed phase runs so that root is seeded before those children
 * render.
 */
export type SsrDataLines = {
	readonly render: string[];
	readonly seedForward: string[];
	/** The composed children-root child surfaces, for this component's widget-root marker. */
	readonly composedRootSurfaceArgs: string[];
};

/**
 * The seed-phase body for a component whose own children sit inside a widget
 * root it composes. It runs the component body the render runs - the state
 * declarations and shared seeds the derives read - and ends by handing that
 * root the same props the render hands it, so the parts the consumer already
 * placed read a seeded instance rather than the factory placeholder.
 */
export function ssrSeedForwardBlockLines(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
	valuesName: string,
	payloadStateExpression: string,
	seedForward: ReadonlyArray<string>,
): string[] {
	if (seedForward.length === 0) return [];
	return [
		`		const marklessSsrPayloadState = ${payloadStateExpression};`,
		`		const marklessSsrRenderStateValues = new Map(${valuesName});`,
		'		for (const [marklessSeedId, marklessSeedValue] of marklessSsrSeeds) marklessSsrRenderStateValues.set(marklessSeedId, marklessSeedValue);',
		...renderBodyLines(
			input,
			rootInfo,
			'marklessStateValue',
			'marklessSsrRenderStateValues',
			'marklessSsrPayloadState',
			seedForward,
		),
	];
}

// Sibling `@for` loops may bind the same authored name - two lists both calling
// their item `row` is ordinary authoring. This prelude is ONE scope shared by
// every row render, so each name may be declared once; the declaration is the
// same whichever loop asked for it, because every row reads its item off the
// same context. A name meaning an item in one loop and an index in another is
// refused by `collectRepeatBindingConflictDiagnostics` before emission.
function repeatLocalLines(
	repeats: PublicRenderModuleInput['semanticGraph']['keyedRepeats'],
): string[] {
	const declared = new Map<string, string>();
	for (const repeat of repeats)
		if (!declared.has(repeat.itemName))
			declared.set(repeat.itemName, 'marklessSsrDataContext.repeatItem');
	for (const repeat of repeats)
		if (repeat.indexName && !declared.has(repeat.indexName))
			declared.set(repeat.indexName, 'marklessSsrDataContext.repeatIndex');
	return [...declared].map(([name, source]) => `const ${name}=${source};`);
}

function emitSsrDataLines(
	input: PublicRenderModuleInput,
	componentName: string,
	references: ReadonlyArray<{ readonly componentName: string; readonly localName: string }>,
): SsrDataLines {
	const rowScopedEdges = rowScopedEdgeIds(input.renderData.chunks);
	const chunks = input.renderData.chunks.filter((chunk) => chunk.componentName === componentName);
	const componentGraphNodeIds = new Set([
		...chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) => {
				const residueIds =
					'residue' in slot && slot.residue.kind === 'graph-read'
						? [slot.residue.graphNodeId]
						: [];
				return slot.kind === 'dynamic-host'
					? [
							...residueIds,
							...slot.attributeSlots.flatMap((attribute) =>
								attribute.residue.kind === 'graph-read'
									? [attribute.residue.graphNodeId]
									: [],
							),
						]
					: residueIds;
			}),
		),
		// A branch condition the compiler recombined into one computed is read the
		// same way a text slot reads its residue: off the state map, by id. Left
		// out of the seed pass the server read `undefined` and took the else arm
		// whenever the authored condition was true, so the served HTML disagreed
		// with what the client resumed to.
		...chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) =>
				slot.kind === 'branch'
					? (
							input.renderData.branches.find(
								(branch) => branch.branchSiteId === slot.branchSiteId,
							)?.testReads ?? []
						).map((read) => read.graphNodeId)
					: [],
			),
		),
		// A node this component reads ONLY to hand to the child it composes is
		// still read by this render: without it the child is composed from the
		// factory placeholder rather than from what this body just seeded. Row
		// -scoped edges stay out - their props read locals only the row has.
		...componentEdgesFor(input, componentName).flatMap((edge) =>
			rowScopedEdges.has(edge.id)
				? []
				: edge.props.flatMap((prop) =>
						prop.kind === 'graph-reference' || prop.kind === 'spread'
							? [prop.graphNodeId]
							: [],
					),
		),
	]);
	const residueSources = authoredResidueSources(chunks);
	const repeats = input.semanticGraph.keyedRepeats;
	// The prelude serves every callback, not just the markup reader: an arm test
	// the compiler could not reduce to one graph read is authored in the same
	// scope and may spell shared instances the markup never mentions. Same union
	// the client reader takes, so one component scope is spelled one way.
	const preludeText = [
		...new Set([...residueSources, ...renderDecisionSources(input, componentName)]),
	].join('\n');
	const localLines = [
		...repeatLocalLines(repeats),
		'const error=marklessSsrDataContext.asyncError;',
		...sharedInstancePreludeLines(
			input.semanticGraph,
			componentName,
			preludeText,
			new Set([
				...repeats.map((repeat) => repeat.itemName),
				...repeats.flatMap((repeat) => (repeat.indexName ? [repeat.indexName] : [])),
				'error',
			]),
			(graphNodeId, path) =>
				`marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(
					graphNodeId,
				)}), ${JSON.stringify(path)})`,
		),
	];
	const readCases = authoredResidueReadCases(residueSources);
	// Pay-per-use: a module with no IDREF record emits no mint at all, so the
	// shared renderer never carries one for the pages that never ask for an id.
	const handleIds = elementHandleIdSources(chunks);
	const handleKinds = elementHandleResidueKinds(chunks);
	const mintCase =
		handleIds.length > 0
			? elementHandleIdReadCase({
					idPrefixSource: 'marklessSsrIdPrefix',
					widgetInstanceSource: hasSharedElementHandle(handleIds)
						? `marklessSsrRenderStateValues.get(${JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY)})`
						: null,
					kinds: handleKinds,
				})
			: '';
	const branchIds = new Set(chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => slot.kind === 'branch' ? [slot.branchSiteId] : []),
	));
	const branchArmSources = new Map(
		input.renderData.branches.map((branch) => {
			const testRead = branch.testReads.length === 1 ? branch.testReads[0] : undefined;
			const testSource = testRead
				? `marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(testRead.graphNodeId)}),${JSON.stringify(testRead.path)})`
				: branch.testSource;
			return [
				branch.branchSiteId,
				{
					source: branch.kind === 'switch' && branch.armTests
						? `(()=>{const value=(${testSource});const tests=${JSON.stringify(branch.armTests)};const match=tests.findIndex((test)=>test!==null&&Object.is(test,value));return match===-1?Math.max(0,tests.indexOf(null)):match;})()`
						: `((${testSource})?0:1)`,
					// A test the emitted seed pass can also ask: it reads the same state
					// map, where an authored local the render body declares is not in scope.
					readable: testRead !== undefined,
				},
			] as const;
		}),
	);
	const branchCases = input.renderData.branches
		.filter((branch) => branchIds.has(branch.branchSiteId))
		.map(
			(branch) =>
				`case ${JSON.stringify(branch.branchSiteId)}:{const arm=${branchArmSources.get(branch.branchSiteId)?.source ?? '1'};marklessSsrBranches.push({id:marklessSsrDataSlot.branchSiteId,takenArm:arm});return arm;}`,
		);
	const repeatIds = new Set(chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => slot.kind === 'repeat' ? [slot.repeatId] : []),
	));
	const componentRepeats = input.renderData.repeats.filter((repeat) =>
		repeatIds.has(repeat.repeatId),
	);
	// Only a collection the renderer cannot read from the graph needs the
	// callback; a graph-only component keeps the renderer on its graph read.
	const repeatCases = componentRepeats.some(
		(repeat) => !repeat.collectionGraphNodeId && repeat.collectionSource,
	)
		? componentRepeats.flatMap((repeat) =>
				repeat.collectionGraphNodeId
					? [
							`case ${JSON.stringify(repeat.repeatId)}:return marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(repeat.collectionGraphNodeId)}),${JSON.stringify(repeat.collectionPath)});`,
						]
					: repeat.collectionSource
						? [`case ${JSON.stringify(repeat.repeatId)}:return (${repeat.collectionSource});`]
						: // Neither source of rows: no case, so the callback's default throw
							// names the repeat instead of rendering an empty list.
							[],
			)
		: [];
	const asyncRunners = collectSsrAsyncRunners(input);
	const boundaryIds = new Set(chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => slot.kind === 'async' ? [slot.boundaryId] : []),
	));
	const boundaryCases = input.renderData.boundaries
		.filter((boundary) => boundaryIds.has(boundary.boundaryId))
		.flatMap((boundary) => {
			const runner = asyncRunners.get(boundary.boundaryId);
			if (!runner) return [`case ${JSON.stringify(boundary.boundaryId)}:return {arm:marklessSsrAsyncArm()};`];
			const extra = collectSsrAsyncRunnerDefinitions(input).size > 0
				? ',marklessSsrAsyncRunnerDefinitions,marklessSsrAsyncRuns'
				: '';
			return [
				`case ${JSON.stringify(boundary.boundaryId)}:{const snapshot=await marklessSsrRunAsyncComputed(marklessSsrAsyncSnapshots,${JSON.stringify(runner.graphNodeId)},${runner.source},marklessSsrRenderContext,${String(!!boundary.armChunkIds.pending)}${extra});if(snapshot.status==='fulfilled')marklessSsrRenderStateValues.set(${JSON.stringify(runner.graphNodeId)},snapshot.value);return {arm:marklessSsrAsyncArm(snapshot),error:snapshot.error};}`,
			];
		});
	const edges = componentEdgesFor(input, componentName);
	const referenceByName = new Map(references.map((reference) => [reference.componentName, reference.localName]));
	const callbacks = callbackSymbolIds(input);
	// An edge whose slot sits inside another edge's projection chunk is PROJECTED
	// into that component: it renders from what that component's body seeded. A
	// part an arm holds is projected the same way — the arm only decides whether
	// it renders, not which widget it belongs to.
	const projectedEdgeIds = new Set(
		chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) =>
				slot.kind === 'child-component' && slot.projectionChunkId
					? [
							...(
								input.renderData.chunks.find(
									(candidate) => candidate.id === slot.projectionChunkId,
								)?.slots ?? []
							).flatMap((projected) =>
								projected.kind === 'child-component' ? [projected.componentEdgeId] : [],
							),
							...armScopedSeedRefsUnder(input.renderData.chunks, slot.projectionChunkId).map(
								(ref) => ref.edgeId,
							),
						]
					: [],
			),
		),
	);
	// Defect 56. A part inside a repeat row of a widget root's projection renders
	// inside that widget, so it READS the instance the root's seed phase wrote —
	// even though the row cannot WRITE one, which is why the seed walks above stop
	// at the loop. Without this the row rendered with no seeds at all and every
	// field a sibling part declared came back as the family's own initial value.
	const rowProjectedEdgeIds = new Set(
		chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) =>
				slot.kind === 'child-component' && slot.projectionChunkId
					? rowProjectedEdgeIdsUnder(input.renderData.chunks, slot.projectionChunkId)
					: [],
			),
		),
	);
	// The composed child that encloses this component's own children roots the
	// widget those children resolve. It is composed during THIS component's
	// render, which happens after the consumer already rendered them, so the
	// seed phase forwards the same props to it before any part renders.
	const childrenRootEdgeIds = childrenProjectionChain(
		input.renderData.chunks,
		componentName,
		(edgeId) =>
			componentEdgeInstanceSegment(
				input.semanticGraph.componentEdges.find((edge) => edge.id === edgeId),
				input.semanticGraph.componentEdges,
			),
	).map((link) => link.componentEdgeId);
	// One seed block per edge, keyed by edge id, so the widget root's case can run
	// its parts' seeds too. An edge nobody projects never reaches an emitted case.
	const seedBlockByEdgeId = new Map<string, string>();
	const projectionChunkByEdgeId = new Map<string, string>();
	const widgetInstanceLineByEdgeId = new Map<string, string>();
	// What the emitted seed pass hands the boundary check to ask a placed child
	// whether it roots a widget: the child's module surface and the name it
	// declared, exactly as the render and seed calls spell them.
	const childSurfaceArgsByEdgeId = new Map<string, string>();
	const childCases = edges.flatMap((edge, index) => {
		const component = referenceByName.get(edge.childComponentName);
		if (!component) return [];
		const props = edge.props.flatMap((prop) => {
			if (prop.kind === 'callback') return [];
			if (prop.kind === 'spread')
				return [`...marklessSsrSpreadProps(marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(prop.graphNodeId)}),${JSON.stringify(prop.path)}),${JSON.stringify(prop.excludeNames)})`];
			if (prop.kind === 'graph-reference')
				return [`${objectPropertyName(prop.name)}:marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(prop.graphNodeId)}),${JSON.stringify(prop.path)})`];
			// An IDREF handle written on this child's tag: the element it names is
			// rendered by THIS component, so this render spells the id and the child
			// receives a string. Emitting `prop.source` here handed the child the
			// handle itself, which stringifies to an IDREF naming nothing.
			if (prop.kind === 'element-handle-id')
				return [
					`${objectPropertyName(prop.name)}:${elementHandleIdSource(prop.graphNodeId)}`,
				];
			return prop.source ? [`${objectPropertyName(prop.name)}:(${prop.source})`] : [];
		});
		const projectionChunkId = chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) =>
				slot.kind === 'child-component' &&
				slot.componentEdgeId === edge.id &&
				slot.projectionChunkId
					? [slot.projectionChunkId]
					: [],
			),
		)[0];
		const hasProjection = projectionChunkId !== undefined;
		const callbackEntries = edge.props.flatMap((prop) => {
			const symbolId = callbacks.get(`${edge.id}:${prop.name}`);
			if (symbolId) return [`${JSON.stringify(prop.name)}:${JSON.stringify(symbolId)}`];
			if (prop.kind !== 'graph-reference') return [];
			if (prop.graphNodeId === 'prop:props')
				return [
					`${JSON.stringify(prop.name)}:marklessSsrCallbackSymbol(props,${JSON.stringify(prop.path)})`,
				];
			if (prop.graphNodeId.startsWith('prop:'))
				return [
					`${JSON.stringify(prop.name)}:marklessSsrCallbackSymbol(props,${JSON.stringify([prop.graphNodeId.slice(5), ...prop.path])})`,
				];
			return [];
		});
		if (callbackEntries.length)
			props.push(
				`${SSR_CALLBACKS_PROP_NAME}:marklessSsrCallbacks({${callbackEntries.join(',')}})`,
			);
		// The seed pass runs before the projected children exist, so it asks for the
		// same props without the projection. It keeps the callbacks map: a widget
		// root's callback-slot seed is exactly the answer that map carries.
		const seedProps = [...props];
		if (hasProjection && !edge.props.some((prop) => prop.name === 'children'))
			props.push('children:marklessSsrDataContext.projectionHtml');
		const child = {
			hostPrefix: `c${index}:`,
			symbolPrefix: componentEdgeInstanceSegment(edge, input.semanticGraph.componentEdges),
			graphProps: componentEdgeGraphRoutes(edge, hasProjection),
			boundSymbols: boundSymbolsForEdge(edge, callbacks),
		};
		const declaredName = edgeDeclaredComponentName(edge);
		const childSurface = declaredName
			? `marklessSsrComponentPart(${component},${JSON.stringify(declaredName)})`
			: component;
		childSurfaceArgsByEdgeId.set(
			edge.id,
			`${component},${declaredName ? JSON.stringify(declaredName) : 'undefined'}`,
		);
		// A same-module child answers at compile time; an imported one is asked
		// through the marker the compiler stamped on its render function.
		const seedCall = edge.importSource
			? `await marklessSsrSeedChild(${component},${declaredName ? JSON.stringify(declaredName) : 'undefined'},childProps,marklessSsrRenderContext,marklessSsrSeeds);`
			: componentSharedSeeds(input, edge.childComponentName).length > 0
				? `await ${childSurface}?.renderSsr?.(childProps,{...marklessSsrRenderContext,marklessSharedSeeds:marklessSsrSeeds});`
				: '';
		if (seedCall)
			seedBlockByEdgeId.set(
				edge.id,
				`{const childProps={${seedProps.join(',')}};${seedCall}}`,
			);
		// Static registration before descent: the widget root's instance token
		// is written into the seed map the parts placed inside it read, so a
		// part mints an id that names WHICH rendered widget it belongs to.
		if (projectionChunkId !== undefined) {
			projectionChunkByEdgeId.set(edge.id, projectionChunkId);
			const surfaceArgs = childSurfaceArgsByEdgeId.get(edge.id) ?? `${component},undefined`;
			const registerInstance = `marklessSsrSeeds.set(${JSON.stringify(
				MARKLESS_WIDGET_INSTANCE_KEY,
			)},marklessSsrIdPrefix+${
				// A widget rooted per row is one instance per row, so the token its
				// parts mint ids from names the row as well as the edge.
				rowScopedEdges.has(edge.id)
					? 'marklessSsrRowSegment(marklessSsrDataContext.repeatKey)+'
					: ''
			}${JSON.stringify(child.symbolPrefix)}+marklessSsrChildrenWidgetRoot(${surfaceArgs}));`;
			// Defect 65: a projecting child that does NOT root a widget is a PART of
			// the widget it was placed in, so the parts written inside it belong to
			// that instance and it must not register a token of its own - the element
			// its projected part binds would then mint an id the reference, spelled by
			// the enclosing instance, does not spell. Which families a child roots is
			// answered where that child was compiled, so a child this module cannot
			// prove roots one asks the same marker the boundary check reads.
			if (seedCall)
				widgetInstanceLineByEdgeId.set(
					edge.id,
					!edge.importSource &&
						widgetRootDefinitionIds(input, edge.childComponentName).length > 0
						? registerInstance
						: `if(marklessSsrWidgetRoots(${surfaceArgs}).length)${registerInstance}`,
				);
		}
		// The composed child declares where ITS composition puts the children written
		// into it, so composition registers the same widget for the projection site
		// the CSR seed pass registers it for. Both sides read the same declaration.
		const childLiteral =
			projectionChunkId === undefined
				? JSON.stringify(child)
				: `{...${JSON.stringify(child)},childrenWidgetRoot:marklessSsrChildrenWidgetRoot(${
						childSurfaceArgsByEdgeId.get(edge.id) ?? `${component},undefined`
					})}`;
		// A row-scoped edge takes its row's runtime segment ahead of its own
		// prefixes, so each row composes an instance of its own. An UNKEYED row has
		// no identity to carry, so its interactive output still refuses.
		const rowScoped = rowScopedEdges.has(edge.id);
		const placement = rowScoped
			? `marklessSsrRowPlacement(${childLiteral},marklessSsrDataContext.repeatKey)`
			: childLiteral;
		const refusal = rowScoped
			? `if(marklessSsrDataContext.repeatKey===undefined){marklessAssertPresentationalRowChild(output,${JSON.stringify(edge.childComponentName)});return output;}`
			: `if(marklessSsrDataContext.repeatItem!==undefined){marklessAssertPresentationalRowChild(output,${JSON.stringify(edge.childComponentName)});return output;}`;
		return [
			`case ${JSON.stringify(edge.id)}:{const child=${placement};const childProps={${props.join(',')}};const output=await ${childSurface}?.renderSsr?.(childProps,{...marklessSsrRenderContext,idPrefix:marklessSsrIdPrefix+child.hostPrefix${
					// A widget ROOT reads its own instance's seeds too: the parts placed
					// inside it wrote them before it rendered, and its consume line
					// merges them over its statics. Not the child THIS component
					// composes around its own children: that one renders inside this
					// render from props this body already computed, so it stays on the
					// instance it was composed in.
					projectedEdgeIds.has(edge.id) ||
					rowProjectedEdgeIds.has(edge.id) ||
					(projectionChunkId !== undefined && !childrenRootEdgeIds.includes(edge.id))
						? ',sharedSeeds:marklessSsrDataContext.sharedSeeds'
						: ''
				}});if(!output)throw new Error('MARKLESS_SSR_DATA_CHILD_RENDER_MISSING: ${edge.id}');${refusal}marklessSsrChildren.push({...child,output,callbackProps:childProps.__marklessSsrCallbacks??{}});return output;}`,
		];
	});
	// U-H: every part of one widget instance seeds before any part renders, so a
	// seed written by a part is what its siblings read whatever the document order.
	// T053: a placed child that ROOTS a widget of the family this root started is
	// an instance boundary — it and everything under it seed their own instance,
	// so this pass skips them. Which child roots a widget is answered where that
	// child was compiled, so the chain is asked at render time.
	const seedCases = [...projectionChunkByEdgeId].flatMap(([edgeId, projectionChunkId]) => {
		const rootSurfaceArgs = childSurfaceArgsByEdgeId.get(edgeId);
		// Every link from the root's projection down to the part, the part itself
		// last: any of them rooting one of this root's families ends the walk.
		const boundaryGuard = (part: {
			readonly edgeId: string;
			readonly projectingAncestorEdgeIds: ReadonlyArray<string>;
		}): string[] => {
			if (!rootSurfaceArgs) return [];
			const chain = [...part.projectingAncestorEdgeIds, part.edgeId].map((linkEdgeId) =>
				childSurfaceArgsByEdgeId.get(linkEdgeId),
			);
			return chain.flatMap((args) =>
				args ? [`!marklessSsrWidgetBoundary(marklessSsrWidgetFamilies,${args})`] : [],
			);
		};
		const guarded = (guards: ReadonlyArray<string>, block: string) =>
			guards.length > 0 ? `if(${guards.join('&&')}){${block}}` : block;
		const rootBlock = seedBlockByEdgeId.get(edgeId);
		const parts = projectedSeedPartsUnder(input.renderData.chunks, projectionChunkId);
		const armRefs = armScopedSeedRefsUnder(input.renderData.chunks, projectionChunkId);
		const blocks = [
			...(rootBlock ? [rootBlock] : []),
			...parts.flatMap((part) => {
				const block = seedBlockByEdgeId.get(part.edgeId);
				return block ? [guarded(boundaryGuard(part), block)] : [];
			}),
			// T052: a part an arm holds seeds when its arm is the taken one, so the
			// widget's post-seed value is what every part renders from.
			...armRefs.flatMap((ref) => {
				const block = seedBlockByEdgeId.get(ref.edgeId);
				const guards = ref.armGuards.flatMap((guard) => {
					const arm = branchArmSources.get(guard.branchSiteId);
					return arm?.readable ? [`(${arm.source})===${String(guard.armIndex)}`] : [];
				});
				return block && guards.length === ref.armGuards.length
					? [guarded([...guards, ...boundaryGuard(ref)], block)]
					: [];
			}),
		];
		if (blocks.length === 0) return [];
		// Pay-per-use: the family lookup is emitted only where a projected part can
		// actually sit under another root — a widget with no nested projection
		// emits exactly the seed pass it emitted before boundaries existed.
		const needsFamilies = blocks.some((block) => block.includes('marklessSsrWidgetBoundary'));
		return [
			`case ${JSON.stringify(edgeId)}:{${widgetInstanceLineByEdgeId.get(edgeId) ?? ''}${
				needsFamilies
					? `const marklessSsrWidgetFamilies=marklessSsrWidgetRoots(${rootSurfaceArgs});`
					: ''
			}${blocks.join('')}return marklessSsrSeeds;}`,
		];
	});
	const bindingLines = input.semanticGraph.graphBindings.flatMap((binding) =>
		// A shared() node has no render-body local to re-read: its seed value is
		// already in the state map the factory payload built.
		binding.sharedDefinitionId === undefined &&
		(binding.componentName === componentName || (!binding.componentName && componentName === input.renderData.root?.componentName)) &&
		(binding.kind !== 'computed' || binding.async !== true)
			? [`if(typeof ${binding.name}!=='undefined')marklessSsrRenderStateValues.set(${JSON.stringify(binding.id)},${binding.name});`]
			: [],
	);
	// Derived after the static seed map, so the factory's state nodes are already
	// readable when the derive runs.
	const sharedComputedSources = collectSsrSharedComputedSources(input);
	const sharedComputedLines = input.protocolState.computed.flatMap((computed) => {
		const source = sharedComputedSources.get(computed.graphNodeId);
		if (!source || !componentGraphNodeIds.has(computed.graphNodeId)) return [];
		return [
			`marklessSsrRenderStateValues.set(${JSON.stringify(computed.graphNodeId)},(${source})({read:(marklessSsrSharedId,marklessSsrSharedPath)=>marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(marklessSsrSharedId),marklessSsrSharedPath)}));`,
		];
	});
	const templateComputedSharedSources = collectSsrTemplateComputedSources(input);
	const templateComputedLines = input.renderData.initialValues.flatMap((initial) => {
		// Held in a const so the discriminated narrowing survives into the callback.
		const value = initial.value;
		if (
			!componentGraphNodeIds.has(initial.graphNodeId) ||
			!initial.graphNodeId.startsWith(TEMPLATE_EXPRESSION_GRAPH_NODE_PREFIX) ||
			value.kind !== 'symbol-function'
		)
			return [];
		const sharedSource = templateComputedSharedSources.get(initial.graphNodeId);
		if (sharedSource) {
			return [
				`marklessSsrRenderStateValues.set(${JSON.stringify(initial.graphNodeId)},(${sharedSource})({read:(marklessSsrSharedId,marklessSsrSharedPath)=>marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(marklessSsrSharedId),marklessSsrSharedPath)}));`,
			];
		}
		const symbol = input.symbolResolver.symbols.find(
			(candidate) => candidate.id === value.symbolId,
		);
		// Only authored symbol kinds carry source; the rest emit nothing.
		const source = symbol && 'source' in symbol ? symbol.source : undefined;
		return source
			? [`marklessSsrRenderStateValues.set(${JSON.stringify(initial.graphNodeId)},(${source})());`]
			: [];
	});
	const composedRootEdgeIds = childrenRootEdgeIds.filter((edgeId) => !rowScopedEdges.has(edgeId));
	const seedForward = composedRootEdgeIds.flatMap((edgeId) => {
		const block = seedBlockByEdgeId.get(edgeId);
		return block ? [block] : [];
	});
	const composedRootSurfaceArgs = composedRootEdgeIds.flatMap((edgeId) => {
		const args = childSurfaceArgsByEdgeId.get(edgeId);
		return args ? [args] : [];
	});
	const seedForwardLines =
		seedForward.length === 0
			? []
			: [
					"marklessSsrRenderStateValues.set('prop:props',props);",
					...bindingLines,
					...sharedComputedLines,
					...templateComputedLines,
					...seedForward,
				];
	return {
		seedForward: seedForwardLines,
		composedRootSurfaceArgs,
		render: [
		"marklessSsrRenderStateValues.set('prop:props',props);",
		...bindingLines,
		...sharedComputedLines,
		...templateComputedLines,
		"const marklessSsrIdPrefix=marklessSsrRenderContext?.idPrefix??'';",
		`const marklessSsrReadData=(residue,marklessSsrDataContext)=>{${mintCase}if(residue.kind==='graph-read')return marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(residue.graphNodeId),residue.path);if(residue.kind==='repeat-item')return marklessSsrReadPublicPath(marklessSsrDataContext.repeatItem,residue.path);${localLines.join('')}switch(residue.source){${readCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_RESIDUE_MISSING: '+residue.source);}};`,
		`const marklessSsrRendered=await renderSsrData({renderData:{...marklessRenderData,root:{componentName:${JSON.stringify(componentName)},templateId:${JSON.stringify(`template:${componentName}`)}}},idPrefix:marklessSsrIdPrefix,read:marklessSsrReadData,selectBranchArm:(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.branchSiteId){${branchCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_BRANCH_MISSING: '+marklessSsrDataSlot.branchSiteId);}},${
			repeatCases.length > 0
				? `repeatItems:(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.repeatId){${repeatCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_REPEAT_MISSING: '+marklessSsrDataSlot.repeatId);}},`
				: ''
		}selectAsyncArm:async(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.boundaryId){${boundaryCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_BOUNDARY_MISSING: '+marklessSsrDataSlot.boundaryId);}},${
			seedCases.length > 0
				? `seedChild:async(marklessSsrDataSlot,marklessSsrDataContext)=>{const marklessSsrSeeds=new Map(marklessSsrDataContext.sharedSeeds??[]);${localLines.join('')}switch(marklessSsrDataSlot.componentEdgeId){${seedCases.join('')}}return marklessSsrSeeds;},`
				: ''
		}renderChild:async(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.componentEdgeId){${childCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_CHILD_MISSING: '+marklessSsrDataSlot.componentEdgeId);}}});`,
		],
	};
}
