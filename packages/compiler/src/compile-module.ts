import type {
	CaptureAnalysisArtifact,
	CompileTsrxModuleInput,
	CompileTsrxModuleResult,
	ModuleGraphInterfaceArtifact,
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
import { memoizedCompile } from './compile-cache.ts';
import type { SourceSpan } from './diagnostics.ts';
import { runCompilerPassPipeline } from './pass-pipeline.ts';
import {
	childrenSeedPathsByComponent,
	type ChildrenSeedPathsInput,
} from './passes/link/children-seed-paths.ts';
import { PROJECTION_PROP_NAME } from './passes/public-render/shared-seed-pass.ts';
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
import { stripExtractedSyncPolicyCalls } from './passes/semantic-graph/strip-sync-policy-calls.ts';

export function compileTsrxModule(
	input: CompileTsrxModuleInput,
): Promise<CompileTsrxModuleResult> {
	return memoizedCompile(input, () => runCompile(input));
}

// The result is shared between the requests that asked for the same compile, so
// every artifact it carries is read-only from here on.
async function runCompile(input: CompileTsrxModuleInput): Promise<CompileTsrxModuleResult> {
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
		moduleGraphInterface: withSeedsFromProps(artifacts.semanticGraph.moduleGraphInterface, {
			symbolResolver: artifacts.symbolResolver,
			protocolState: artifacts.protocolState,
		}),
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

/**
 * Publishes each component's `children` seed onto the interface a composing
 * module reads. Written here rather than in the interface's own pass because the
 * seed routes only exist once protocol state and the symbol resolver are both
 * finished, which is true for the first time at this return.
 */
function withSeedsFromProps(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	seedInput: ChildrenSeedPathsInput,
): ModuleGraphInterfaceArtifact {
	const seedPaths = childrenSeedPathsByComponent(seedInput);
	if (seedPaths.size === 0) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) => {
				const statePath = seedPaths.get(component.componentName);
				if (statePath === undefined) return component;
				return {
					...component,
					seedsFromProps: [{ prop: PROJECTION_PROP_NAME, statePath }],
				};
			}),
		},
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
					const semanticGraph = inputs.semanticGraph as SemanticGraphArtifact;
					const symbolResolver = planSymbolResolver({
						semanticGraph,
						payloadArena: inputs.payloadArena as PayloadArenaArtifact,
						stateLowering: inputs.stateLowering as StateLoweringArtifact,
					});
					// Every later pass reads this symbol list, so the eager sync policy's
					// calls must already be lifted out of it here.
					stripExtractedSyncPolicyCalls(symbolResolver.symbols, semanticGraph);
					return { symbolResolver };
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
					if (hasUnserveableDiagnostic(semanticGraph)) {
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
					if (hasUnserveableDiagnostic(semanticGraph)) {
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
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							source: inputs.source as CompileTsrxModuleInput,
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
						protocolView:
							inputs.protocolView as CompileTsrxModuleResult['protocolView'],
						protocolState:
							inputs.protocolState as CompileTsrxModuleResult['protocolState'],
						overlays: (inputs.semanticGraph as SemanticGraphArtifact).overlays,
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
							protocolState:
								inputs.protocolState as CompileTsrxModuleResult['protocolState'],
							protocolView:
								inputs.protocolView as CompileTsrxModuleResult['protocolView'],
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
		message: `yuku-tsrx reported: ${message}`,
		why: 'The source could not enter the Markless compiler because the yuku-tsrx parser failed at phase parse. Markless preserves the parser message and adapts its source location into the compiler diagnostic.',
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

/**
 * Diagnostics that make the render modules unserveable, so emitting them would
 * only produce source no host can run. A parse error leaves nothing to emit
 * from; an unbound shared call (defect 69) leaves a call the server prelude
 * would emit verbatim and throw on, while the client body drops it — the exact
 * client-works/server-throws split the refusal exists to end.
 *
 * This is deliberately a short list, not "every error diagnostic": most refusals
 * still emit, and their tests assert on that emitted source.
 */
const unserveableDiagnosticCodes: ReadonlySet<string> = new Set([
	'MARKLESS_PARSE_ERROR',
	'MARKLESS_SHARED_CALL_UNBOUND',
	// A plain `else` leaves the alternative as literal text plus a swallowed
	// body, so emitting would ship the word "else" and the arm's escaped source
	// to the page — visible garbage rather than a branch.
	'MARKLESS_BRANCH_ELSE_SPELLING',
]);

function hasUnserveableDiagnostic(semanticGraph: SemanticGraphArtifact): boolean {
	return semanticGraph.diagnostics.some(
		(diagnostic) =>
			(diagnostic.phase === 'parse' && diagnostic.code === 'MARKLESS_PARSE_ERROR') ||
			(diagnostic.severity === 'error' && unserveableDiagnosticCodes.has(diagnostic.code)),
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
