import type {
	CaptureAnalysisArtifact,
	CompileTsrxModuleInput,
	CompileTsrxModuleResult,
	PayloadArenaArtifact,
	PublicRenderModuleArtifact,
	PublicRenderPlanArtifact,
	PayloadScriptsArtifact,
	RenderDataArtifact,
	RunnableCompilerPassDefinition,
	RuntimeDemandMapArtifact,
	RuntimeDemandMapsArtifact,
	TriggerGroupArtifact,
	SemanticGraphArtifact,
	StateLoweringArtifact,
	SymbolModulesArtifact,
	SymbolResolverModuleInput,
	SymbolResolverModuleManifest,
	SymbolResolverPlan,
} from './artifacts.ts';
import type { SourceSpan } from './diagnostics.ts';
import { runCompilerPassPipeline } from './pass-pipeline.ts';
import { defaultCompilerPasses } from './pass-registry.ts';
import { analyzeCaptures } from './passes/capture-analysis.ts';
import { planPayloadArena } from './passes/payload-arena.ts';
import { renderPayloadScriptArtifact } from './passes/payload-scripts.ts';
import { emitPublicRenderModule } from './passes/public-render/module.ts';
import { planPublicRender } from './passes/public-render/plan.ts';
import { createProtocolStatePayloadFromArena } from './passes/protocol-state.ts';
import { createProtocolViewPayload } from './passes/protocol-view.ts';
import { createRenderData } from './passes/render-data/index.ts';
import { createRuntimeDemandMap } from './passes/runtime-demand-map.ts';
import { createTriggerGroups } from './passes/trigger-groups.ts';
import { buildSemanticGraph } from './passes/semantic-graph/index.ts';
import { createMutableSemanticGraphArtifact } from './passes/semantic-graph/types.ts';
import { lowerStateAccess } from './passes/state-lowering.ts';
import { emitSymbolModules } from './passes/symbol-modules.ts';
import {
	createSymbolResolverModuleManifest,
	emitSymbolResolverModule,
} from './passes/symbol-resolver-module.ts';
import { planBoundSymbolResolver, planSymbolResolver } from './passes/symbol-resolver.ts';

export async function compileTsrxModule(
	input: CompileTsrxModuleInput,
): Promise<CompileTsrxModuleResult> {
	const symbolResolverModuleInput: SymbolResolverModuleInput = {
		buildId: input.buildId,
		resolverId: input.resolverId,
		symbols: input.symbols,
	};
	const pipeline = await runCompilerPassPipeline({
		passes: defaultRunnableCompilerPasses(),
		initialArtifacts: {
			source: input,
			symbols: input.symbols,
			symbolResolverModuleInput,
		},
	});
	const artifacts = pipeline.artifacts as {
		readonly semanticGraph: SemanticGraphArtifact;
		readonly stateLowering: StateLoweringArtifact;
		readonly payloadArena: PayloadArenaArtifact;
		readonly symbolResolver: SymbolResolverPlan;
		readonly renderData: RenderDataArtifact;
		readonly captureAnalysis: CaptureAnalysisArtifact;
		readonly protocolState: CompileTsrxModuleResult['protocolState'];
		readonly protocolView: CompileTsrxModuleResult['protocolView'];
		readonly payloadScripts: PayloadScriptsArtifact['payloadScripts'];
		readonly publicRenderPlan: PublicRenderPlanArtifact;
		readonly publicRenderModule: PublicRenderModuleArtifact;
		readonly symbolModules: SymbolModulesArtifact;
		readonly runtimeDemandMap: RuntimeDemandMapArtifact;
		readonly runtimeDemandMaps: RuntimeDemandMapsArtifact;
		readonly triggerGroups: TriggerGroupArtifact;
		readonly symbolResolverModule: string;
		readonly symbolResolverModuleManifest: SymbolResolverModuleManifest;
	};

	return {
		passGraph: pipeline.passGraph,
		semanticGraph: artifacts.semanticGraph,
		moduleGraphInterface: artifacts.semanticGraph.moduleGraphInterface,
		stateLowering: artifacts.stateLowering,
		payloadArena: artifacts.payloadArena,
		symbolResolver: artifacts.symbolResolver,
		renderData: artifacts.renderData,
		boundSymbolResolver: {
			passId: 'bound-symbol-resolver',
			rows: artifacts.captureAnalysis.boundResolverRows ?? [],
			componentEdgeInstancePaths: artifacts.captureAnalysis.componentEdgeInstancePaths ?? [],
		},
		captureAnalysis: artifacts.captureAnalysis,
		protocolState: artifacts.protocolState,
		protocolView: artifacts.protocolView,
		payloadScripts: artifacts.payloadScripts,
		publicRenderPlan: artifacts.publicRenderPlan,
		publicRenderModule: artifacts.publicRenderModule,
		symbolModules: artifacts.symbolModules,
		runtimeDemandMap: artifacts.runtimeDemandMap,
		runtimeDemandMaps: artifacts.runtimeDemandMaps,
		triggerGroups: artifacts.triggerGroups,
		symbolResolverModule: artifacts.symbolResolverModule,
		symbolResolverModuleManifest: artifacts.symbolResolverModuleManifest,
	};
}

function defaultRunnableCompilerPasses(): ReadonlyArray<RunnableCompilerPassDefinition> {
	return defaultCompilerPasses.map((pass) => {
		if (pass.passId === 'tsrx-semantic-graph') {
			return {
				...pass,
				async run({ inputs }) {
					const source = sourceInput(inputs.source);
					try {
						return { semanticGraph: await buildSemanticGraph(source) };
					} catch (error) {
						if (!isExternalParserSyntaxError(error)) throw error;
						const semanticGraph = createMutableSemanticGraphArtifact(source.filename);
						semanticGraph.diagnostics.push(parseErrorDiagnostic(error, source));
						return { semanticGraph };
					}
				},
			};
		}

		if (pass.passId === 'state-lowering') {
			return {
				...pass,
				run({ inputs }) {
					const semanticGraph = inputs.semanticGraph as SemanticGraphArtifact;
					return { stateLowering: lowerStateAccess({ semanticGraph }) };
				},
			};
		}

		if (pass.passId === 'payload-arena') {
			return {
				...pass,
				run({ inputs }) {
					const semanticGraph = inputs.semanticGraph as SemanticGraphArtifact;
					return {
						payloadArena: planPayloadArena({
							semanticGraph,
							stateLowering: inputs.stateLowering as StateLoweringArtifact,
							renderData: createRenderData({
								semanticGraph,
								symbolResolver: emptySymbolResolver(),
							}),
						}),
					};
				},
			};
		}

		if (pass.passId === 'symbol-resolver') {
			return {
				...pass,
				run({ inputs }) {
					return {
						symbolResolver: planSymbolResolver({
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							payloadArena: inputs.payloadArena as PayloadArenaArtifact,
							stateLowering: inputs.stateLowering as StateLoweringArtifact,
						}),
					};
				},
			};
		}

		if (pass.passId === 'capture-analysis') {
			return {
				...pass,
				run({ inputs }) {
					const semanticGraph = inputs.semanticGraph as SemanticGraphArtifact;
					const captureAnalysis = analyzeCaptures({
						semanticGraph,
						symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
						symbols: inputs.symbols as CompileTsrxModuleInput['symbols'],
					});
					const bound = planBoundSymbolResolver({ semanticGraph, captureAnalysis });
					return {
						captureAnalysis: {
							...captureAnalysis,
							boundResolverRows: bound.rows,
							componentEdgeInstancePaths: bound.componentEdgeInstancePaths,
						},
					};
				},
			};
		}

		if (pass.passId === 'render-data') {
			return {
				...pass,
				run({ inputs }) {
					return {
					renderData: createRenderData({
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
							payloadArena: inputs.payloadArena as PayloadArenaArtifact,
						}),
					};
				},
			};
		}

		if (pass.passId === 'public-render-plan') {
			return {
				...pass,
				run({ inputs }) {
					const semanticGraph = inputs.semanticGraph as SemanticGraphArtifact;
					if (hasExternalParseDiagnostic(semanticGraph)) {
						return { publicRenderPlan: emptyPublicRenderPlanArtifact() };
					}
					return {
						publicRenderPlan: planPublicRender({
							source: sourceInput(inputs.source),
							semanticGraph,
							payloadArena: inputs.payloadArena as PayloadArenaArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
						}),
					};
				},
			};
		}

		if (pass.passId === 'public-render-module') {
			return {
				...pass,
				run({ inputs }) {
					const semanticGraph = inputs.semanticGraph as SemanticGraphArtifact;
					if (hasExternalParseDiagnostic(semanticGraph)) {
						return { publicRenderModule: emptyPublicRenderModuleArtifact() };
					}
					return {
						publicRenderModule: emitPublicRenderModule({
							source: sourceInput(inputs.source),
							semanticGraph,
							renderData: inputs.renderData as RenderDataArtifact,
							publicRenderPlan: inputs.publicRenderPlan as PublicRenderPlanArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
							captureAnalysis: inputs.captureAnalysis as CaptureAnalysisArtifact,
							protocolState:
								inputs.protocolState as CompileTsrxModuleResult['protocolState'],
							protocolView:
								inputs.protocolView as CompileTsrxModuleResult['protocolView'],
						}),
					};
				},
			};
		}

		if (pass.passId === 'protocol-state') {
			return {
				...pass,
				run({ inputs }) {
					return {
						protocolState: createProtocolStatePayloadFromArena({
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							payloadArena: inputs.payloadArena as PayloadArenaArtifact,
						}),
					};
				},
			};
		}

		if (pass.passId === 'protocol-view') {
			return {
				...pass,
				run({ inputs }) {
					return {
						protocolView: createProtocolViewPayload({
							payloadArena: inputs.payloadArena as PayloadArenaArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
							renderData: inputs.renderData as RenderDataArtifact,
							captureAnalysis: inputs.captureAnalysis as CaptureAnalysisArtifact,
						}),
					};
				},
			};
		}

		if (pass.passId === 'payload-scripts') {
			return {
				...pass,
				run({ inputs }) {
					return renderPayloadScriptArtifact({
						protocolState: inputs.protocolState as Parameters<
							typeof renderPayloadScriptArtifact
						>[0]['protocolState'],
						protocolView: inputs.protocolView as Parameters<
							typeof renderPayloadScriptArtifact
						>[0]['protocolView'],
					});
				},
			};
		}

		if (pass.passId === 'symbol-modules') {
			return {
				...pass,
				run({ inputs }) {
					return {
						symbolModules: emitSymbolModules({
							source: inputs.source as CompileTsrxModuleInput,
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
							captureAnalysis: inputs.captureAnalysis as CaptureAnalysisArtifact,
							renderData: inputs.renderData as RenderDataArtifact,
							publicRenderPlan: inputs.publicRenderPlan as PublicRenderPlanArtifact,
							omitAuthoredSource: (inputs.source as CompileTsrxModuleInput)
								.omitAuthoredSource,
						}),
					};
				},
			};
		}

		if (pass.passId === 'runtime-demand-map') {
			return {
				...pass,
				run({ inputs }) {
					const demandInput = {
						symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
						captureAnalysis: inputs.captureAnalysis as CaptureAnalysisArtifact,
						symbolModules: inputs.symbolModules as SymbolModulesArtifact,
						publicRenderModule:
							inputs.publicRenderModule as CompileTsrxModuleResult['publicRenderModule'],
						protocolView: inputs.protocolView as CompileTsrxModuleResult['protocolView'],
						protocolState: inputs.protocolState as CompileTsrxModuleResult['protocolState'],
					};
					const runtimeDemandMaps = {
						'plain-ssr': createRuntimeDemandMap(demandInput, 'plain-ssr'),
						prerender: createRuntimeDemandMap(demandInput, 'prerender'),
					} satisfies RuntimeDemandMapsArtifact;
					return {
						runtimeDemandMap: runtimeDemandMaps.prerender,
						runtimeDemandMaps,
					};
				},
			};
		}

		if (pass.passId === 'trigger-groups') {
			return {
				...pass,
				run({ inputs }) {
					return {
						triggerGroups: createTriggerGroups({
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
							protocolState: inputs.protocolState as CompileTsrxModuleResult['protocolState'],
							protocolView: inputs.protocolView as CompileTsrxModuleResult['protocolView'],
							runtimeDemandMap: inputs.runtimeDemandMap as RuntimeDemandMapArtifact,
						}),
					};
				},
			};
		}

		return {
			...pass,
			run({ inputs }) {
				const symbolInput = inputs.symbolResolverModuleInput as SymbolResolverModuleInput;

				return {
					symbolResolverModule: emitSymbolResolverModule(symbolInput),
					symbolResolverModuleManifest: createSymbolResolverModuleManifest(symbolInput),
				};
			},
		};
	});
}

function emptySymbolResolver(): SymbolResolverPlan {
	return {
		passId: 'symbol-resolver',
		dynamicImportOwner: 'generated-symbol-resolver',
		symbols: [],
		syncPolicies: [],
		diagnostics: [],
	};
}

function sourceInput(value: unknown): CompileTsrxModuleInput {
	return value as CompileTsrxModuleInput;
}

function isExternalParserSyntaxError(error: unknown): error is SyntaxError {
	return (
		error instanceof SyntaxError ||
		(typeof error === 'object' &&
			error !== null &&
			(error as { readonly name?: unknown }).name === 'SyntaxError')
	);
}

function parseErrorDiagnostic(
	error: SyntaxError,
	source: CompileTsrxModuleInput,
): SemanticGraphArtifact['diagnostics'][number] {
	const message = error.message;
	return {
		code: 'MARKLESS_PARSE_ERROR',
		severity: 'error',
		phase: 'parse',
		title: 'TSRX parser rejected this source',
		message: `@tsrx/core reported: ${message}`,
		why: 'The source could not enter the Markless compiler because the TSRX parser failed at phase parse (external @tsrx/core). Markless treats @tsrx/core as an external dependency boundary, so the original parser message is preserved here instead of changing the parser.',
		primarySpan: parserErrorSpan(error, source),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Check the TSRX syntax rules at https://tsrx.dev/specification and rewrite this source into supported TSRX syntax.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PARSE_ERROR',
	};
}

function parserErrorSpan(
	error: SyntaxError,
	source: CompileTsrxModuleInput,
): SourceSpan | undefined {
	const position = (error as SyntaxError & { readonly pos?: unknown }).pos;
	if (typeof position !== 'number') return undefined;
	const start = Math.max(0, Math.min(source.source.length, position));
	return { filename: source.filename, start, end: Math.min(source.source.length, start + 1) };
}

function hasExternalParseDiagnostic(semanticGraph: SemanticGraphArtifact): boolean {
	return semanticGraph.diagnostics.some(
		(diagnostic) => diagnostic.phase === 'parse' && diagnostic.code === 'MARKLESS_PARSE_ERROR',
	);
}

function emptyPublicRenderPlanArtifact(): PublicRenderPlanArtifact {
	return {
		passId: 'public-render-plan',
		styleScopes: [],
		diagnostics: [],
	};
}

function emptyPublicRenderModuleArtifact(): PublicRenderModuleArtifact {
	return {
		passId: 'public-render-module',
		renderDataModuleSource: '',
		moduleSource: '',
		rootExportName: null,
		ssrModuleSource: '',
		ssrExportName: null,
		componentDefinitions: [],
		diagnostics: [],
	};
}
