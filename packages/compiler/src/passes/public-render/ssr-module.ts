import type { PublicRenderModuleInput } from '../../artifacts.ts';
import { emitHtmlNode, collectSsrAsyncRunners } from './html.ts';
import { renderBodyLines } from './render-body.ts';
import { emitCatalogHelperImports, stateRuntimeImports } from './runtime-helpers.ts';
import { emitSameModuleSsrComponents } from './same-module.ts';
import { assignSsrHostIds, callbackSymbolIds, componentEdgesFor, componentReferences, destructureProps, emitComponentImport, emitValueImport, isComponentRoot, publicRenderValueImports, stateEntries, staticHostLocators, moduleScopeLines } from './shared.ts';
import { collectSsrPropEvents } from './component-wiring.ts';
import type { PublicRenderRoot, SsrRenderContext } from './types.ts';

export function emitPublicSsrRenderModule(
	input: PublicRenderModuleInput,
	rootInfo: PublicRenderRoot,
): string {
	if (!input.publicRenderPlan.rootTemplateHtml && !isComponentRoot(rootInfo.root)) return '';

	const references = componentReferences(input.semanticGraph.componentEdges, '__marklessSsrComponent');
	const valueImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
	);
	const renderContext: SsrRenderContext = {
		mode: 'ssr',
		componentEdges: componentEdgesFor(input, rootInfo.componentName),
		componentImports: new Map(references.map((item) => [item.componentName, item.localName])),
		callbackSymbols: callbackSymbolIds(input),
		nextComponentEdgeIndex: 0,
		nextChildIndex: 0,
		hostIdByNode: assignSsrHostIds(
			rootInfo.root,
			input.semanticGraph.hostNodes.map((host) => host.id),
		),
		keyedRepeats: input.semanticGraph.keyedRepeats,
		repeatGates: input.publicRenderPlan.repeatGates,
		nextRepeatIndex: 0,
		insideRepeatRow: false,
		asyncBoundaries: input.semanticGraph.asyncBoundaries,
		asyncBoundaryGates: input.publicRenderPlan.asyncBoundaryGates,
		nextAsyncBoundaryIndex: 0,
		asyncRunners: collectSsrAsyncRunners(input),
		hasChildrenProp: rootInfo.propNames.includes('children'),
		branchSites: input.semanticGraph.branchSites,
		branchReactivityGates: input.publicRenderPlan.branchReactivityGates,
		nextBranchSiteIndex: 0,
		styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
		source: input.source.source,
	};
	const hostLocators = staticHostLocators(input);
	const propEvents = collectSsrPropEvents(
		rootInfo.root,
		rootInfo.propNames,
		input.source.source,
		hostLocators,
	);
	const htmlExpression = emitHtmlNode(rootInfo.root, renderContext);
	const sameModuleComponents = emitSameModuleSsrComponents(input, references, rootInfo.componentName);
	const body = [
		'',
		`const marklessSsrPropEvents = ${JSON.stringify(propEvents)};`,
		'const marklessSsrStateValues = new Map([',
		stateEntries(input).join(',\n'),
		']);',
		'async function marklessRenderSsr(props = {}) {',
		destructureProps(rootInfo.propNames),
		'	const marklessSsrPayloadState = marklessCloneState(payloadState);',
		'	const marklessSsrRenderStateValues = new Map(marklessSsrStateValues);',
		...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessSsrRenderStateValues', 'marklessSsrPayloadState', [
			'const marklessSsrChildren = [];',
			'const marklessSsrBranches = [];',
			'const marklessSsrAsyncSnapshots = [];',
			'const marklessSsrHostLocators = [];',
			`const html = ${htmlExpression};`,
		]),
		'	const marklessSsrComposition = marklessSsrComposeView(html, payloadView, marklessSsrHostLocators, marklessSsrChildren, marklessSsrAsyncSnapshots);',
		'	const marklessSsrState = marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren);',
		'	return {',
		'		html,',
		'		state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots),',
		'		view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) },',
		'		elementCount: marklessSsrComposition.elementCount,',
		'		propEvents: marklessSsrPropEvents,',
		'		externalSymbolIds: marklessSsrComposition.externalSymbolIds,',
		'	};',
		'}',
		'',
	];
	const bodySource = body
		.filter((part): part is string => part !== null && part !== '')
		.join('\n')
		.replaceAll('readMarklessPublicPath', 'marklessSsrReadPublicPath');
	const helperReferenceSource = [...sameModuleComponents, bodySource].join('\n');
	return [
		...references.flatMap((reference) =>
			reference.importSource ? [emitComponentImport(reference)] : [],
		),
		...valueImports.map(emitValueImport),
		...emitCatalogHelperImports(helperReferenceSource, [
			{
				module: 'ssr',
				names: [
					'marklessSsrRenderChild',
					'marklessSsrBranchArm',
					'marklessSsrRunAsyncComputed',
					'marklessSsrAttachSnapshots',
					'marklessSsrMergeBranches',
					'marklessSsrArmHost',
					'marklessSsrHost',
					'marklessSsrCallbacks',
					'marklessSsrCallbackSymbol',
					// Aliased: the CSR module in the same emitted file imports the same
					// helper name from fns/csr; duplicate import bindings are a JS error.
					'marklessComposeState as marklessSsrComposeState',
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
			{ module: 'repeats', names: ['marklessSsrRepeatRows'] },
		]),
		...moduleScopeLines(input.source.source, input.source.filename),
		...sameModuleComponents,
		bodySource,
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}
