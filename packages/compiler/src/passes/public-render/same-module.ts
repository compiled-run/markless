import { parseModule } from '../../js-ast.ts';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { firstComponentRoot } from './plan.ts';
import { renderBodyLines } from './render-body.ts';
import { ssrSeedForwardBlockLines, type SsrDataLines } from './ssr-module.ts';
import {
	componentSharedSeeds,
	sharedSeedConsumeLine,
	sharedSeedMarkerLine,
	sharedSeedPassLines,
	widgetRootDefinitionIds,
	elementHandleMarkerLine,
	componentBoundElementHandles,
	widgetRootMarkerLine,
} from './shared-seed-pass.ts';
import {
	componentOwnedStateNodes,
	componentPropNames,
	destructureProps,
	stateEntries,
	hasPropDependentComputed,
	sameModuleComponentMap,
	ssrComposeStateExpression,
	type ComponentReference,
} from './shared.ts';

export function ssrComponentFunctionName(componentName: string): string {
	return `marklessRenderSsr${componentName}`;
}

// Every component this module can server-render on its own: each same-module
// component other than the root that declares markup of its own. A composing
// page reaches one of these by the name it is exported under, so they emit
// whether or not this module composes them itself.
export function sameModuleSsrComponentNames(
	input: PublicRenderModuleInput,
	ast: AnyNode,
	rootComponentName: string,
): ReadonlyArray<string> {
	const componentMap = sameModuleComponentMap(ast);
	return input.semanticGraph.components.flatMap((component) => {
		if (component.name === rootComponentName) return [];
		const node = componentMap.get(component.name);
		return node && firstComponentRoot(node) ? [component.name] : [];
	});
}

// A same-module edge that names this module's own root composes the root as its
// own child. The child surface is the root's own render function, so how deep it
// unrolls is decided by the render call that re-enters it, never at build time.
export function selfComposedSsrBindingLines(
	references: ReadonlyArray<ComponentReference>,
	rootComponentName: string,
	rootFunctionName: string,
): string[] {
	return references.flatMap((reference) =>
		!reference.importSource && reference.componentName === rootComponentName
			? [`const ${reference.localName} = { renderSsr: ${rootFunctionName} };`]
			: [],
	);
}

export function emitSameModuleSsrComponents(
	input: PublicRenderModuleInput,
	references: ReadonlyArray<ComponentReference>,
	rootComponentName: string,
	componentDataLines: (componentName: string) => SsrDataLines,
): string[] {
	const remapsGraphProps = hasPropDependentComputed(input);
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);
	const localNames = new Map(
		references.flatMap((reference) =>
			reference.importSource ? [] : [[reference.componentName, reference.localName] as const],
		),
	);
	return sameModuleSsrComponentNames(input, ast, rootComponentName).flatMap((componentName) => {
		const component = componentMap.get(componentName);
		const root = firstComponentRoot(component);
		if (!component || !root) return [];
		const rootInfo = {
			component,
			componentName,
			root,
			propNames: componentPropNames(component),
		};
		const functionName = ssrComponentFunctionName(componentName);
		const owned = componentOwnedStateNodes(input, componentName, rootComponentName);
		const valuesName = `marklessSsrStateValues${componentName}`;
		const localName = localNames.get(componentName);
		const dataLines = componentDataLines(componentName);
		const payloadStateExpression = `marklessSelectStateNodes(marklessCloneState(payloadState), ${JSON.stringify(
			owned.cellIndexes,
		)}, ${JSON.stringify(owned.computedIndexes)})`;
		return [
			`const ${valuesName} = new Map([`,
			stateEntries(input, owned.seedCellIndexes).join(',\n'),
			']);',
			localName ? `const ${localName} = { renderSsr: ${functionName} };` : null,
			`async function ${functionName}(props = {}, marklessSsrRenderContext) {`,
			destructureProps(rootInfo.propNames, rootInfo.component, input.source.source),
			...sharedSeedPassLines(
				componentSharedSeeds(input, componentName),
				valuesName,
				ssrSeedForwardBlockLines(
					input,
					rootInfo,
					valuesName,
					payloadStateExpression,
					dataLines.seedForward,
					dataLines.bodySharedComputed,
				),
			),
			`	const marklessSsrPayloadState = ${payloadStateExpression};`,
			`	const marklessSsrRenderStateValues = new Map(${valuesName});`,
			sharedSeedConsumeLine(input, componentName, 'marklessSsrRenderStateValues'),
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
					...dataLines.render,
				],
				dataLines.bodySharedComputed,
			),
			...dataLines.serveComputed,
			'	const html = marklessSsrRendered.html;',
			'	const marklessSsrComposition = marklessSsrComposeView(marklessSsrRendered.structure, payloadView, marklessSsrChildren, marklessSsrAsyncSnapshots, marklessSsrIdPrefix);',
			`	const marklessSsrState = ${ssrComposeStateExpression(input, rootInfo.component, componentName)};`,
			`	return { html, state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots), view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) }, elementCount: marklessSsrComposition.elementCount, propEvents: [], externalSymbolIds: marklessSsrComposition.externalSymbolIds, structure: marklessSsrRendered.structure, structureTokens: marklessSsrRendered.structureTokens${remapsGraphProps ? ', m(graphProps, instancePath) { marklessSsrRemapGraphOutput(this, graphProps, instancePath); }' : ''} };`,
			'}',
			sharedSeedMarkerLine(
				componentSharedSeeds(input, componentName),
				functionName,
				dataLines.seedForward,
			),
			widgetRootMarkerLine(
				widgetRootDefinitionIds(input, componentName),
				functionName,
				dataLines.composedRootSurfaceArgs,
			),
			elementHandleMarkerLine(
				componentBoundElementHandles(input, componentName),
				functionName,
				dataLines.importedChildSurfaceArgs,
			),
		].filter((line): line is string => line !== null);
	});
}
