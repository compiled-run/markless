import { parseModule } from '@tsrx/core';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { firstComponentRoot } from './plan.ts';
import { emitHtmlNode } from './html.ts';
import { renderBodyLines } from './render-body.ts';
import { callbackSymbolIds, componentEdgesFor, componentPropNames, destructureProps, isFragmentNode, sameModuleComponentMap, assignSsrHostIds, type ComponentReference } from './shared.ts';
import type { CsrRenderContext, SsrRenderContext } from './types.ts';

export function emitSameModuleCsrComponents(
	input: PublicRenderModuleInput,
	references: ReadonlyArray<ComponentReference>,
	rootComponentName: string,
): string[] {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);
	const referenceMap = new Map(references.map((item) => [item.componentName, item.localName]));
	return references.flatMap((reference) => {
		if (reference.importSource || reference.componentName === rootComponentName) return [];
		const component = componentMap.get(reference.componentName);
		const root = firstComponentRoot(component);
		if (!component || !root) return [];
		const rootInfo = {
			component,
			componentName: reference.componentName,
			root,
			propNames: componentPropNames(component),
		};
		const renderContext: CsrRenderContext = {
			mode: 'csr',
			childReplacements: [],
			componentEdges: componentEdgesFor(input, reference.componentName),
			componentImports: referenceMap,
			callbackSymbols: callbackSymbolIds(input),
			nextComponentEdgeIndex: 0,
			keyedRepeats: [],
			repeatGates: [],
			nextRepeatIndex: 0,
			branchSites: [],
			branchReactivityGates: [],
			nextBranchSiteIndex: 0,
			asyncBoundaries: [],
			asyncBoundaryGates: [],
			nextAsyncBoundaryIndex: 0,
			hasChildrenProp: rootInfo.propNames.includes('children'),
			styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
			source: input.source.source,
		};
		const functionName = `marklessRenderCsr${reference.componentName}`;
		return [
			`const ${reference.localName} = { renderCsr: ${functionName} };`,
			`function ${functionName}(props = {}) {`,
			destructureProps(rootInfo.propNames),
			'	const marklessCsrPayloadState = { ...marklessCloneState(payloadState), cells: [], computed: [] };',
			'	const marklessCsrRenderStateValues = new Map(marklessCsrStateValues);',
			...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessCsrRenderStateValues', 'marklessCsrPayloadState', [
				'const marklessCsrRuntimeState = { graph: null };',
				'const marklessCsrChildren = [];',
				`const root = ${isFragmentNode(rootInfo.root) ? 'marklessCsrFragmentFromHtml' : 'marklessCsrRootFromHtml'}(${emitHtmlNode(rootInfo.root, renderContext)});`,
			]),
			...renderContext.childReplacements,
			'	const marklessCsrView = marklessCsrComposeView(root, marklessViewWithoutAnchors(payloadView), [], marklessCsrChildren);',
			'	const marklessCsrState = marklessComposeState(marklessCsrPayloadState, marklessCsrChildren);',
			'	return { root, state: marklessCsrState, view: marklessCsrView, loadSymbol, connectRuntime(context) { marklessCsrRuntimeState.graph = context.graph; for (const child of marklessCsrChildren) child.output?.connectRuntime?.(context); } };',
			'}',
		].filter((line): line is string => line !== null);
	});
}

export function emitSameModuleSsrComponents(
	input: PublicRenderModuleInput,
	references: ReadonlyArray<ComponentReference>,
	rootComponentName: string,
): string[] {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);
	const referenceMap = new Map(references.map((item) => [item.componentName, item.localName]));
	const hostIdByNode = assignSsrHostIds(
		ast,
		input.semanticGraph.hostNodes.map((host) => host.id),
	);
	return references.flatMap((reference) => {
		if (reference.importSource || reference.componentName === rootComponentName) return [];
		const component = componentMap.get(reference.componentName);
		const root = firstComponentRoot(component);
		if (!component || !root) return [];
		const rootInfo = {
			component,
			componentName: reference.componentName,
			root,
			propNames: componentPropNames(component),
		};
		const renderContext: SsrRenderContext = {
			mode: 'ssr',
			componentEdges: componentEdgesFor(input, reference.componentName),
			componentImports: referenceMap,
			callbackSymbols: callbackSymbolIds(input),
			nextComponentEdgeIndex: 0,
			nextChildIndex: 0,
			hostIdByNode,
			keyedRepeats: [],
			repeatGates: [],
			nextRepeatIndex: 0,
			insideRepeatRow: false,
			asyncBoundaries: [],
			asyncBoundaryGates: [],
			nextAsyncBoundaryIndex: 0,
			asyncRunners: new Map(),
			hasChildrenProp: rootInfo.propNames.includes('children'),
			branchSites: [],
			branchReactivityGates: [],
			nextBranchSiteIndex: 0,
			styleScopeClass: input.publicRenderPlan.styleScopes[0]?.scopeId ?? null,
			source: input.source.source,
		};
		const functionName = `marklessRenderSsr${reference.componentName}`;
		return [
			`const ${reference.localName} = { renderSsr: ${functionName} };`,
			`async function ${functionName}(props = {}) {`,
			destructureProps(rootInfo.propNames),
			'	const marklessSsrPayloadState = { ...marklessCloneState(payloadState), cells: [], computed: [] };',
			'	const marklessSsrRenderStateValues = new Map(marklessSsrStateValues);',
			...renderBodyLines(input, rootInfo, 'marklessStateValue', 'marklessSsrRenderStateValues', 'marklessSsrPayloadState', [
				'const marklessSsrChildren = [];',
				'const marklessSsrBranches = [];',
				'const marklessSsrAsyncSnapshots = [];',
				'const marklessSsrHostLocators = [];',
				`const html = ${emitHtmlNode(rootInfo.root, renderContext)};`,
			]),
			'	const marklessSsrComposition = marklessSsrComposeView(html, marklessViewWithoutAnchors(payloadView), marklessSsrHostLocators, marklessSsrChildren);',
			'	const marklessSsrState = marklessComposeState(marklessSsrPayloadState, marklessSsrChildren);',
			'	return { html, state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots), view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) }, elementCount: marklessSsrComposition.elementCount, propEvents: [], externalSymbolIds: marklessSsrComposition.externalSymbolIds };',
			'}',
		].filter((line): line is string => line !== null);
	});
}
