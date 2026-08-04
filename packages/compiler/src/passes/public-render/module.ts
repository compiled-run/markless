import { parseModule } from '@tsrx/core';
import type { PublicRenderModuleArtifact, PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { collectPublicRenderComponentDefinitions } from './component-definitions.ts';
import { emitDirectPublicRenderModule } from './direct-module.ts';
import { emitPublicSsrRenderModule } from './ssr-module.ts';
import { firstComponentRoot, selectPublicRenderRoot } from './plan.ts';
import { hasExecutableBodyStatements } from './render-body.ts';
import { componentPropNames, isFragmentNode } from './shared.ts';

export { firstComponentRoot, planPublicRender, selectPublicRenderRoot } from './plan.ts';
export { emitPublicSsrRenderModule } from './ssr-module.ts';
export type { PublicRenderRoot } from './types.ts';

// Emits the optional direct-DOM module used by public render() after the plan proves
// the component shape can run through this specialized path.
export function emitPublicRenderModule(input: PublicRenderModuleInput): PublicRenderModuleArtifact {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	if (
		input.publicRenderPlan.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ||
		input.semanticGraph.diagnostics.some(
			(item) => item.code === 'MARKLESS_EVENT_SPREAD_UNSUPPORTED',
		)
	) {
		return {
			passId: 'public-render-module',
			renderDataModuleSource: '',
			moduleSource: '',
			rootExportName: null,
			ssrModuleSource: '',
			ssrExportName: null,
			componentDefinitions: [],
			diagnostics: input.publicRenderPlan.diagnostics,
		};
	}
	const rootSelection = selectPublicRenderRoot(ast);
	const rootComponentName = rootSelection?.componentName;
	const componentCount = input.semanticGraph.components.length;
	const root = rootSelection
		? {
				component: rootSelection.component,
				componentName: rootSelection.componentName,
				root: rootSelection.root,
				propNames: componentPropNames(rootSelection.component),
				moduleAst: ast,
			}
		: null;
	// Fragment roots use the standard CSR module (root = document fragment;
	// the web render() entry adopts the mount target as container root per the
	// ratified D3 decision). The direct module keeps its single-element shape.
	const isFragmentRoot = !!root && isFragmentNode(root.root);
	const canUseDirectCsrModule =
		!!root &&
		!isFragmentRoot &&
		!hasExecutableBodyStatements(root.component, root.root, input.source.source) &&
		root.propNames.length === 0 &&
		input.semanticGraph.componentEdges.length === 0 &&
		input.publicRenderPlan.styleScopes.length === 0 &&
		// The direct module has no async boundary handling; boundary-bearing
		// shapes take the standard runtime module.
		input.renderData.boundaries.length === 0;
	const moduleSource = canUseDirectCsrModule
		? emitDirectPublicRenderModule({
				rootSelection,
				componentCount,
				publicRenderPlan: input.publicRenderPlan,
				renderData: input.renderData,
				protocolState: input.protocolState,
				protocolView: input.protocolView,
				symbolResolver: input.symbolResolver,
			})
		: '';
	const ssrModuleSource = root ? emitPublicSsrRenderModule(input, root) : '';
	const componentDefinitions = root
		? collectPublicRenderComponentDefinitions(input, root)
		: [];
	return {
		passId: 'public-render-module',
		renderDataModuleSource: root
			? `export const marklessRenderData = ${JSON.stringify(input.renderData)};`
			: '',
		moduleSource,
		rootExportName: moduleSource ? (rootComponentName ?? null) : null,
		ssrModuleSource,
		ssrExportName: ssrModuleSource ? 'marklessRenderSsr' : null,
		componentDefinitions,
		diagnostics: input.publicRenderPlan.diagnostics,
	};
}
