import type { PublicRenderModuleInput } from '../../artifacts.ts';
import {
	collectSsrAsyncRunnerDefinitions,
	collectSsrAsyncRunners,
	collectSsrSharedComputedSources,
} from './html.ts';
import { renderBodyLines } from './render-body.ts';
import { emitCatalogHelperImports, stateRuntimeImports } from './runtime-helpers.ts';
import { emitSameModuleSsrComponents } from './same-module.ts';
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
	publicRenderValueImports,
	composedGraphProps,
	componentOwnedStateNodes,
	stateEntries,
	staticHostLocators,
	moduleScopeLines,
	objectPropertyName,
} from './shared.ts';
import { authoredResidueReadCases, authoredResidueSources } from './residue-reader.ts';
import { collectSsrPropEvents } from './component-wiring.ts';
import { boundSymbolsForEdge, componentEdgeGraphRoutes } from './component-wiring.ts';
import type { PublicRenderRoot } from './types.ts';

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
	const dataRenderLines = emitSsrDataRenderLines(input, rootInfo.componentName, references);
	const sameModuleComponents = emitSameModuleSsrComponents(
		input,
		references,
		rootInfo.componentName,
		(componentName) => emitSsrDataRenderLines(input, componentName, references),
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
		destructureProps(rootInfo.propNames, rootInfo.component),
		// A module that composes no same-module child owns every payload node, so
		// it keeps the whole clone and emits no selection list.
		ownedNodes === undefined
			? '	const marklessSsrPayloadState = marklessCloneState(payloadState);'
			: `	const marklessSsrPayloadState = marklessSelectStateNodes(marklessCloneState(payloadState), ${JSON.stringify(
					ownedNodes.cellIndexes,
				)}, ${JSON.stringify(ownedNodes.computedIndexes)});`,
		'	const marklessSsrRenderStateValues = new Map(marklessSsrStateValues);',
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
		'	const marklessSsrState = marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren);',
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
		'',
	];
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
					'marklessSsrRowChild',
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
					// Keep the emitted SSR helper distinct from authored bindings.
					'marklessComposeState as marklessSsrComposeState',
					'marklessSsrRemapGraphOutput',
					'marklessViewWithoutAnchors',
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
		bodySource,
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}

function emitSsrDataRenderLines(
	input: PublicRenderModuleInput,
	componentName: string,
	references: ReadonlyArray<{ readonly componentName: string; readonly localName: string }>,
): string[] {
	const chunks = input.renderData.chunks.filter((chunk) => chunk.componentName === componentName);
	const componentGraphNodeIds = new Set(
		chunks.flatMap((chunk) =>
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
	);
	const residueSources = authoredResidueSources(chunks);
	const repeats = input.semanticGraph.keyedRepeats;
	const localLines = [
		...repeats.map((repeat) => `const ${repeat.itemName}=marklessSsrDataContext.repeatItem;`),
		...repeats.flatMap((repeat) => repeat.indexName ? [`const ${repeat.indexName}=marklessSsrDataContext.repeatIndex;`] : []),
		'const error=marklessSsrDataContext.asyncError;',
	];
	const readCases = authoredResidueReadCases(residueSources);
	const branchIds = new Set(chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => slot.kind === 'branch' ? [slot.branchSiteId] : []),
	));
	const branchCases = input.renderData.branches
		.filter((branch) => branchIds.has(branch.branchSiteId))
		.map((branch) => {
			const testRead = branch.testReads.length === 1 ? branch.testReads[0] : undefined;
			const testSource = testRead
				? `marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(testRead.graphNodeId)}),${JSON.stringify(testRead.path)})`
				: branch.testSource;
			const armSource = branch.kind === 'switch' && branch.armTests
				? `(()=>{const value=(${testSource});const tests=${JSON.stringify(branch.armTests)};const match=tests.findIndex((test)=>test!==null&&Object.is(test,value));return match===-1?Math.max(0,tests.indexOf(null)):match;})()`
				: `((${testSource})?0:1)`;
			return `case ${JSON.stringify(branch.branchSiteId)}:{const arm=${armSource};marklessSsrBranches.push({id:marklessSsrDataSlot.branchSiteId,takenArm:arm});return arm;}`;
		});
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
	const childCases = edges.flatMap((edge, index) => {
		const component = referenceByName.get(edge.childComponentName);
		if (!component) return [];
		const props = edge.props.flatMap((prop) => {
			if (prop.kind === 'callback') return [];
			if (prop.kind === 'graph-reference')
				return [`${objectPropertyName(prop.name)}:marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(prop.graphNodeId)}),${JSON.stringify(prop.path)})`];
			return prop.source ? [`${objectPropertyName(prop.name)}:(${prop.source})`] : [];
		});
		const hasProjection = chunks.some((chunk) =>
			chunk.slots.some(
				(slot) => slot.kind === 'child-component' &&
					slot.componentEdgeId === edge.id && !!slot.projectionChunkId,
			),
		);
		if (hasProjection && !edge.props.some((prop) => prop.name === 'children'))
			props.push('children:marklessSsrDataContext.projectionHtml');
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
			props.push(`__marklessSsrCallbacks:marklessSsrCallbacks({${callbackEntries.join(',')}})`);
		const child = {
			hostPrefix: `c${index}:`,
			symbolPrefix: componentEdgeInstanceSegment(edge, input.semanticGraph.componentEdges),
			graphProps: componentEdgeGraphRoutes(edge, hasProjection),
			boundSymbols: boundSymbolsForEdge(edge, callbacks),
		};
		return [
			`case ${JSON.stringify(edge.id)}:{const child=${JSON.stringify(child)};const childProps={${props.join(',')}};const output=await ${component}?.renderSsr?.(childProps,{...marklessSsrRenderContext,idPrefix:marklessSsrIdPrefix+child.hostPrefix});if(!output)throw new Error('MARKLESS_SSR_DATA_CHILD_RENDER_MISSING: ${edge.id}');if(marklessSsrDataContext.repeatItem!==undefined){marklessAssertPresentationalRowChild(output,${JSON.stringify(edge.childComponentName)});return output;}marklessSsrChildren.push({...child,output,callbackProps:childProps.__marklessSsrCallbacks??{}});return output;}`,
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
	const templateComputedLines = input.renderData.initialValues.flatMap((initial) => {
		// Held in a const so the discriminated narrowing survives into the callback.
		const value = initial.value;
		if (
			!componentGraphNodeIds.has(initial.graphNodeId) ||
			!initial.graphNodeId.startsWith('computed:templateExpression:') ||
			value.kind !== 'symbol-function'
		)
			return [];
		const symbol = input.symbolResolver.symbols.find(
			(candidate) => candidate.id === value.symbolId,
		);
		// Only authored symbol kinds carry source; the rest emit nothing.
		const source = symbol && 'source' in symbol ? symbol.source : undefined;
		return source
			? [`marklessSsrRenderStateValues.set(${JSON.stringify(initial.graphNodeId)},(${source})());`]
			: [];
	});
	return [
		"marklessSsrRenderStateValues.set('prop:props',props);",
		...bindingLines,
		...sharedComputedLines,
		...templateComputedLines,
		"const marklessSsrIdPrefix=marklessSsrRenderContext?.idPrefix??'';",
		`const marklessSsrReadData=(residue,marklessSsrDataContext)=>{if(residue.kind==='graph-read')return marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(residue.graphNodeId),residue.path);if(residue.kind==='repeat-item')return marklessSsrReadPublicPath(marklessSsrDataContext.repeatItem,residue.path);${localLines.join('')}switch(residue.source){${readCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_RESIDUE_MISSING: '+residue.source);}};`,
		`const marklessSsrRendered=await renderSsrData({renderData:{...marklessRenderData,root:{componentName:${JSON.stringify(componentName)},templateId:${JSON.stringify(`template:${componentName}`)}}},idPrefix:marklessSsrIdPrefix,read:marklessSsrReadData,selectBranchArm:(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.branchSiteId){${branchCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_BRANCH_MISSING: '+marklessSsrDataSlot.branchSiteId);}},${
			repeatCases.length > 0
				? `repeatItems:(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.repeatId){${repeatCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_REPEAT_MISSING: '+marklessSsrDataSlot.repeatId);}},`
				: ''
		}selectAsyncArm:async(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.boundaryId){${boundaryCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_BOUNDARY_MISSING: '+marklessSsrDataSlot.boundaryId);}},renderChild:async(marklessSsrDataSlot,marklessSsrDataContext)=>{${localLines.join('')}switch(marklessSsrDataSlot.componentEdgeId){${childCases.join('')}default:throw new Error('MARKLESS_SSR_DATA_CHILD_MISSING: '+marklessSsrDataSlot.componentEdgeId);}}});`,
	];
}
