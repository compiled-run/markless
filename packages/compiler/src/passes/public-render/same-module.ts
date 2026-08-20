import { parseModule } from '../../js-ast.ts';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { firstComponentRoot } from './plan.ts';
import { renderBodyLines } from './render-body.ts';
import {
	componentOwnedStateNodes,
	componentPropNames,
	destructureProps,
	stateEntries,
	hasPropDependentComputed,
	sameModuleComponentMap,
	type ComponentReference,
} from './shared.ts';

export function emitSameModuleSsrComponents(
	input: PublicRenderModuleInput,
	references: ReadonlyArray<ComponentReference>,
	rootComponentName: string,
	renderDataLines: (componentName: string) => ReadonlyArray<string>,
): string[] {
	const remapsGraphProps = hasPropDependentComputed(input);
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const componentMap = sameModuleComponentMap(ast);
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
		const functionName = `marklessRenderSsr${reference.componentName}`;
		const owned = componentOwnedStateNodes(input, reference.componentName, rootComponentName);
		const valuesName = `marklessSsrStateValues${reference.componentName}`;
		return [
			`const ${valuesName} = new Map([`,
			stateEntries(input, owned.cellIndexes).join(',\n'),
			']);',
			`const ${reference.localName} = { renderSsr: ${functionName} };`,
			`async function ${functionName}(props = {}, marklessSsrRenderContext) {`,
			destructureProps(rootInfo.propNames, rootInfo.component),
			`	const marklessSsrPayloadState = marklessSelectStateNodes(marklessCloneState(payloadState), ${JSON.stringify(
				owned.cellIndexes,
			)}, ${JSON.stringify(owned.computedIndexes)});`,
			`	const marklessSsrRenderStateValues = new Map(${valuesName});`,
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
					...renderDataLines(reference.componentName),
				],
			),
			'	const html = marklessSsrRendered.html;',
			'	const marklessSsrComposition = marklessSsrComposeView(marklessSsrRendered.structure, marklessViewWithoutAnchors(payloadView), marklessSsrChildren, marklessSsrAsyncSnapshots, marklessSsrIdPrefix);',
			'	const marklessSsrState = marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren);',
			`	return { html, state: marklessSsrAttachSnapshots(marklessSsrState, marklessSsrAsyncSnapshots), view: { ...marklessSsrComposition.view, branches: marklessSsrMergeBranches(marklessSsrComposition.view.branches, marklessSsrBranches) }, elementCount: marklessSsrComposition.elementCount, propEvents: [], externalSymbolIds: marklessSsrComposition.externalSymbolIds, structure: marklessSsrRendered.structure, structureTokens: marklessSsrRendered.structureTokens${remapsGraphProps ? ', m(graphProps, instancePath) { marklessSsrRemapGraphOutput(this, graphProps, instancePath); }' : ''} };`,
			'}',
		].filter((line): line is string => line !== null);
	});
}
