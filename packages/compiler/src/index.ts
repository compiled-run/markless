export type * from './artifacts.ts';
export type * from './diagnostics.ts';
export type * from './type-service.ts';

export { collectTsrxModuleDiagnostics } from './collect-diagnostics.ts';
export { compileTsrxModule } from './compile-module.ts';
export { compileTsrxForTypeService, compile_to_volar_mappings } from './type-service.ts';
export { parseJavaScriptModule, type JavaScriptAstNode } from './js-ast.ts';
export { CompilerPassGraphError, validateCompilerPassGraph } from './pass-graph.ts';
export { formatCompilerArtifactDump, runCompilerPassPipeline } from './pass-pipeline.ts';
export { defaultCompilerPasses } from './pass-registry.ts';

export { analyzeCaptures } from './passes/capture-analysis.ts';
export { computeExecutionAttribution } from './passes/link/attribution.ts';
export {
	artifactChildCandidates,
	compileTsrxModuleLinkArtifact,
	computeLinkedInterfaces,
	linkedRenderDataBoundarySymbols,
	moduleInterfaceHash,
	prerenderInterfacesComplete,
} from './passes/link/interface-link.ts';
export {
	MODULE_LINK_PASS_ID,
	linkImportedModules,
	linkedChildrenHaveBrowserTriggers,
	linkedImportedClaimsMissing,
	linkedImportedSymbolInputs,
	linkedManifestHasBrowserTriggers,
	linkedModuleChildDiagnostics,
	linkedModuleChildKey,
	linkedModuleImportRequests,
	linkedModuleClaimPlan,
	linkedModuleLoadSource,
	linkedSymbolRouteRequests,
	moduleLinkResolutionKey,
	planLinkedModuleChildren,
	uniqueLinkedModuleChildren,
} from './passes/link/module-link.ts';
export { planPayloadArena } from './passes/payload-arena.ts';
export { renderPayloadScriptArtifact } from './passes/payload-scripts.ts';
export { emitPublicRenderModule } from './passes/public-render/module.ts';
export { planPublicRender } from './passes/public-render/plan.ts';
export { createProtocolStatePayloadFromArena } from './passes/protocol-state.ts';
export { createProtocolViewPayload } from './passes/protocol-view.ts';
export { createRenderData } from './passes/render-data/index.ts';
export { createRuntimeDemandMap } from './passes/runtime-demand-map.ts';
export { createTriggerGroups } from './passes/trigger-groups.ts';
export { buildSemanticGraph } from './passes/semantic-graph/index.ts';
export { lowerStateAccess } from './passes/state-lowering.ts';
export { emitSymbolModules } from './passes/symbol-modules.ts';
export {
	createSymbolResolverModuleManifest,
	emitSymbolResolverModule,
} from './passes/symbol-resolver-module.ts';
export { planSymbolResolver } from './passes/symbol-resolver.ts';
