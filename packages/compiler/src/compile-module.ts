import type {
	CaptureAnalysisArtifact,
	ClientEventOnlyEntryArtifact,
	ClientEventOnlyRenderPlanArtifact,
	CompileTsrxModuleInput,
	CompileTsrxModuleResult,
	PayloadArenaArtifact,
	PayloadScriptsArtifact,
	RunnableCompilerPassDefinition,
	SemanticGraphArtifact,
	StateLoweringArtifact,
	SymbolModulesArtifact,
	SymbolResolverModuleInput,
	SymbolResolverModuleManifest,
	SymbolResolverPlan,
} from './artifacts.ts';
import { runCompilerPassPipeline } from './pass-pipeline.ts';
import { defaultCompilerPasses } from './pass-registry.ts';
import { analyzeCaptures } from './passes/capture-analysis.ts';
import { emitClientEventOnlyEntry } from './passes/client-event-only-entry.ts';
import { planClientEventOnlyRender } from './passes/client-event-only-render-plan.ts';
import { planPayloadArena } from './passes/payload-arena.ts';
import { renderPayloadScriptArtifact } from './passes/payload-scripts.ts';
import { createProtocolStatePayloadFromArena } from './passes/protocol-state.ts';
import { createProtocolViewPayload } from './passes/protocol-view.ts';
import { buildSemanticGraph } from './passes/semantic-graph/index.ts';
import { lowerStateAccess } from './passes/state-lowering.ts';
import { emitSymbolModules } from './passes/symbol-modules.ts';
import {
	createSymbolResolverModuleManifest,
	emitSymbolResolverModule,
} from './passes/symbol-resolver-module.ts';
import { planSymbolResolver } from './passes/symbol-resolver.ts';

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
		readonly captureAnalysis: CaptureAnalysisArtifact;
		readonly protocolState: CompileTsrxModuleResult['protocolState'];
		readonly protocolView: CompileTsrxModuleResult['protocolView'];
		readonly payloadScripts: PayloadScriptsArtifact['payloadScripts'];
		readonly renderShell: PayloadScriptsArtifact['renderShell'];
		readonly clientEventOnlyRenderPlan: ClientEventOnlyRenderPlanArtifact;
		readonly clientEventOnlyEntry: ClientEventOnlyEntryArtifact;
		readonly symbolModules: SymbolModulesArtifact;
		readonly symbolResolverModule: string;
		readonly symbolResolverModuleManifest: SymbolResolverModuleManifest;
	};

	return {
		passGraph: pipeline.passGraph,
		semanticGraph: artifacts.semanticGraph,
		stateLowering: artifacts.stateLowering,
		payloadArena: artifacts.payloadArena,
		symbolResolver: artifacts.symbolResolver,
		captureAnalysis: artifacts.captureAnalysis,
		protocolState: artifacts.protocolState,
		protocolView: artifacts.protocolView,
		payloadScripts: artifacts.payloadScripts,
		renderShell: artifacts.renderShell,
		clientEventOnlyRenderPlan: artifacts.clientEventOnlyRenderPlan,
		clientEventOnlyEntry: artifacts.clientEventOnlyEntry,
		symbolModules: artifacts.symbolModules,
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
					return { semanticGraph: await buildSemanticGraph(sourceInput(inputs.source)) };
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
					return {
						payloadArena: planPayloadArena({
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							stateLowering: inputs.stateLowering as StateLoweringArtifact,
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
					return {
						captureAnalysis: analyzeCaptures({
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
						}),
					};
				},
			};
		}

		if (pass.passId === 'client-event-only-render-plan') {
			return {
				...pass,
				run({ inputs }) {
					return {
						clientEventOnlyRenderPlan: planClientEventOnlyRender({
							source: sourceInput(inputs.source),
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							payloadArena: inputs.payloadArena as PayloadArenaArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
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

		if (pass.passId === 'client-event-only-entry') {
			return {
				...pass,
				run({ inputs }) {
					return {
						clientEventOnlyEntry: emitClientEventOnlyEntry({
							source: sourceInput(inputs.source),
							semanticGraph: inputs.semanticGraph as SemanticGraphArtifact,
							renderPlan:
								inputs.clientEventOnlyRenderPlan as ClientEventOnlyRenderPlanArtifact,
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
						}),
					};
				},
			};
		}

		if (pass.passId === 'symbol-modules') {
			return {
				...pass,
				run({ inputs }) {
					return {
						symbolModules: emitSymbolModules({
							symbolResolver: inputs.symbolResolver as SymbolResolverPlan,
							captureAnalysis: inputs.captureAnalysis as CaptureAnalysisArtifact,
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

function sourceInput(value: unknown): CompileTsrxModuleInput {
	return value as CompileTsrxModuleInput;
}
