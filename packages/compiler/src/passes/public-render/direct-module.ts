import type {
	PublicRenderModuleInput,
	PublicRenderPlanArtifact,
	RenderDataArtifact,
	SymbolResolverPlan,
} from '../../artifacts.ts';
import { directChunkBootstrapData } from '../render-data/direct-bootstrap.ts';
import { canEmitPublicRenderModule, canUseDirectPublicRuntime } from './eligibility.ts';
import { emitCreatePublicGraph, publicGraphMethods } from './graph-runtime.ts';
import type { PublicRenderRootSelection } from './plan.ts';
import { emitDirectPublicStateEntries } from './state-entries.ts';
import { emitCatalogHelperImports } from './runtime-helpers.ts';
import { createPublicProtocolView } from './view-filter.ts';

// Emits the specialized direct-DOM CSR path for simple single-component modules.
export function emitDirectPublicRenderModule(input: {
	readonly rootSelection: PublicRenderRootSelection | null;
	readonly componentCount: number;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
	readonly renderData: RenderDataArtifact;
	readonly protocolState: PublicRenderModuleInput['protocolState'];
	readonly protocolView: PublicRenderModuleInput['protocolView'];
	readonly symbolResolver: SymbolResolverPlan;
}) {
	const componentName = input.rootSelection?.componentName;
	if (
		!input.publicRenderPlan.directRenderTemplateHtml ||
		!componentName ||
		input.componentCount !== 1 ||
		!canEmitPublicRenderModule(input.publicRenderPlan)
	) {
		return '';
	}

	const publicView = createPublicProtocolView(input.protocolView, input.publicRenderPlan);
	const directPublicStateEntries = emitDirectPublicStateEntries(input.protocolState);
	if (
		directPublicStateEntries === null ||
		!canUseDirectPublicRuntime(input.protocolState, publicView)
	) {
		return '';
	}

	const bootstrapData = directChunkBootstrapData({
		renderData: input.renderData,
		publicRenderPlan: input.publicRenderPlan,
	});
	if (!bootstrapData) return '';
	const { rootChunkId: _rootChunkId, chunks: _chunks, ...directRecords } = bootstrapData;
	const graphMethods = publicGraphMethods(input.symbolResolver);

	const body = [
		'',
		`const marklessDirectChunkData = {...marklessRenderData,rootChunkId:marklessRenderData.root.templateId,...${JSON.stringify(directRecords)}};`,
		'const renderMarklessDirectChunk = createMarklessDirectChunkRenderer(marklessDirectChunkData);',
		'',
		`export function ${componentName}() {\n\tconst graph = createMarklessPublicGraph();\n\tconst root = renderMarklessDirectChunk(graph, loadSymbol);\n\treturn { root, graph, runtime: { async dispatch() {} } };\n}`,
		'',
		emitCreatePublicGraph(graphMethods, directPublicStateEntries, {
			trackArrayIndexes: input.publicRenderPlan.keyedRepeats.length > 0,
		}),
		'',
	];
	const bodySource = body
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
	return [
		...emitCatalogHelperImports(bodySource, [
			{
				module: 'direct',
				names: [
					'createMarklessDirectChunkRenderer',
					'readMarklessPublicPath',
					'writeMarklessPublicPath',
					'writeMarklessPublicDirtyArrayIndexes',
				],
			},
		]),
		bodySource,
	]
		.filter((part): part is string => part !== null && part !== '')
		.join('\n');
}
