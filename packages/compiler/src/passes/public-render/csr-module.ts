import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { emitHtmlNode } from './html.ts';
import { renderBodyLines } from './render-body.ts';
import { emitCatalogHelperImports, stateRuntimeImports } from './runtime-helpers.ts';
import { emitSameModuleCsrComponents } from './same-module.ts';
import { callbackSymbolIds, componentEdgesFor, componentPropCellId, componentReferences, destructureProps, emitComponentImport, emitValueImport, isFragmentNode, publicRenderValueImports, stateEntries, staticHostLocators, moduleScopeLines } from './shared.ts';
import { collectCsrPropEvents } from './component-wiring.ts';
import type { CsrRenderContext, PublicRenderRoot } from './types.ts';

export function emitPublicCsrRenderModule(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
): string {
	// Component-rooted pages have an empty STATIC template (the imported child's
	// markup lives in its own module), but CSR emission renders components at
	// runtime through the edge machinery — only bail when there is truly
	// nothing to render (dashboard-migration need 7).
	if (
		!input.publicRenderPlan.rootTemplateHtml &&
		input.semanticGraph.componentEdges.length === 0
	) {
		return '';
	}

	const references = componentReferences(input.semanticGraph.componentEdges, '__marklessCsrComponent');
	const valueImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
	);
	const renderContext: CsrRenderContext = {
		mode: 'csr',
		childReplacements: [],
		componentEdges: componentEdgesFor(input, rootInfo.componentName),
		componentImports: new Map(references.map((item) => [item.componentName, item.localName])),
		callbackSymbols: callbackSymbolIds(input),
		nextComponentEdgeIndex: 0,
		keyedRepeats: input.semanticGraph.keyedRepeats,
		repeatGates: input.publicRenderPlan.repeatGates,
		nextRepeatIndex: 0,
		branchSites: input.semanticGraph.branchSites,
		branchReactivityGates: input.publicRenderPlan.branchReactivityGates,
		nextBranchSiteIndex: 0,
		asyncBoundaries: input.semanticGraph.asyncBoundaries,
		asyncBoundaryGates: input.publicRenderPlan.asyncBoundaryGates,
		nextAsyncBoundaryIndex: 0,
		hasChildrenProp: rootInfo.propNames.includes('children'),
		styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
		source: input.source.source,
	};
	const propEvents = collectCsrPropEvents(rootInfo.root, rootInfo.propNames, input.source.source);
	const propCellId = componentPropCellId(rootInfo.component);
	const hostLocators = staticHostLocators(input);
	const sameModuleComponents = emitSameModuleCsrComponents(input, references, rootInfo.componentName);
	const body = [
		'',
		`const marklessCsrHostLocators = ${JSON.stringify(hostLocators)};`,
		'const marklessCsrStateValues = new Map([',
		stateEntries(input).join(',\n'),
		']);',
		'function marklessRenderCsr(props = {}) {',
		destructureProps(rootInfo.propNames),
		'	const marklessCsrPayloadState = marklessCloneState(payloadState);',
		// Lazy symbol modules read captured page props through the prop cell;
		// the live value never crosses HTML, so it travels as directValue
		// instead of a serialized envelope (dashboard-migration need 14).
		propCellId
			? `	marklessCsrPayloadState.cells.push({ graphNodeId: ${JSON.stringify(propCellId)}, directValue: props ?? {} });`
			: null,
		'	const marklessCsrRenderStateValues = new Map(marklessCsrStateValues);',
		...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessCsrRenderStateValues', 'marklessCsrPayloadState', [
			'const marklessCsrRuntimeState = { graph: null };',
			'const marklessCsrChildren = [];',
			`const root = ${isFragmentNode(rootInfo.root) ? 'marklessCsrFragmentFromHtml' : 'marklessCsrRootFromHtml'}(${emitHtmlNode(rootInfo.root, renderContext)});`,
		]),
		...renderContext.childReplacements,
		...propEvents.map(
			(event) =>
				`	marklessCsrAttachPropEvent(root, ${JSON.stringify(event.hostPath)}, ${JSON.stringify(event.eventName)}, ${event.propName});`,
		),
		'	const marklessCsrView = marklessCsrComposeView(root, payloadView, marklessCsrHostLocators, marklessCsrChildren);',
		'	const marklessCsrState = marklessComposeState(marklessCsrPayloadState, marklessCsrChildren);',
		'	return {',
		'		root,',
		'		state: marklessCsrState,',
		'		view: marklessCsrView,',
		'		loadSymbol: marklessCsrLoadSymbol,',
		'		connectRuntime(context) { marklessCsrRuntimeState.graph = context.graph; for (const child of marklessCsrChildren) child.output?.connectRuntime?.(context); },',
		'	};',
		'	function marklessCsrCallback(symbolId) {',
		'		return async function marklessCsrCallbackHandler(event) {',
		'			const graph = marklessCsrRuntimeState.graph;',
		'			if (!graph) return;',
		'			const loaded = marklessCsrLoadSymbol(symbolId);',
		'			const symbol = marklessCsrIsThenable(loaded) ? await loaded : loaded;',
		'			const result = symbol({ graph, event, element: root, getElementHandle: () => undefined });',
		'			if (marklessCsrIsThenable(result)) await result;',
		'			await graph.flush?.();',
		'		};',
		'	}',
		'	function marklessCsrLoadSymbol(symbolId) {',
		'		for (const child of marklessCsrChildren) {',
		'			if (symbolId.startsWith(child.symbolPrefix) && child.output?.loadSymbol) {',
		'				return child.output.loadSymbol(symbolId.slice(child.symbolPrefix.length));',
		'			}',
		'		}',
		'		return loadSymbol(symbolId);',
		'	}',
		'}',
		'',
	];
	const bodySource = body
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
	const helperReferenceSource = [...sameModuleComponents, bodySource].join('\n');
	return [
		...references.flatMap((reference) =>
			reference.importSource ? [emitComponentImport(reference)] : [],
		),
		...valueImports.map(emitValueImport),
		...emitCatalogHelperImports(helperReferenceSource, [
			{
				module: 'csr',
				names: [
					'marklessCsrFragmentFromHtml',
					'marklessCsrRootFromHtml',
					'marklessCsrRenderChild',
					'marklessCsrRowChild',
					'marklessCsrReplaceChild',
					'marklessCsrAttachPropEvent',
					'marklessComposeState',
					'marklessViewWithoutAnchors',
					'marklessCsrComposeView',
					'marklessCsrIsThenable',
				],
			},
			stateRuntimeImports,
			{
				module: 'html',
				names: [
					'marklessCsrText',
					'marklessCsrChildrenHtml',
					'marklessCsrAttribute',
					'readMarklessPublicPath',
					'marklessCsrDynamicTagName',
					'marklessCsrSpreadAttributes',
				],
			},
			{ module: 'repeats', names: ['marklessCsrRepeatRows'] },
		]),
		...moduleScopeLines(input.source.source, input.source.filename),
		...sameModuleComponents,
		bodySource,
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}
