export {
	planModulePreloadUrls,
	planModulePreloads,
	type ModulePreloadFetchPriority,
	type ModulePreloadPlanEntry,
	type ModulePreloadPlanInput,
	type ModulePreloadPriority,
	type ModulePreloadRoot,
} from './build/preload-plan.ts';
export {
	prerenderWakeVirtualModuleSourceFile,
	symbolVirtualModuleSourceFile,
} from './source-module.ts';
export { optimizedDepsToInclude } from './optimized-deps.ts';
export {
	preloadLazySymbolModules,
	type AppendedModulePreloads,
	type LazySymbolPreloadView,
	type PreloadLazySymbolModulesInput,
} from './build/module-preload-dom.ts';
export type { MarklessBundleGraph } from './types.ts';
export {
	isClientPrimarySourceRequest,
	isRenderDataSourceRequest,
	isResumeSourceRequest,
	isRouteNavigationSourceRequest,
	isSymbolOnlySourceRequest,
} from './virtual-ids.ts';
export { plannedLandingFiles } from './build/planned-landing.ts';
export { isExecutionLogChunk } from './execution-log.ts';
export {
	isMarklessDeferredPack,
	isMarklessNavigationPack,
	lazyStartupPackName,
	MARKLESS_DEFERRED_PACK,
	marklessDeferredChunkFileNames,
	MARKLESS_NAVIGATION_PACK_PREFIX,
	startupPackOfLazy,
} from './build/route-pack-groups.ts';
