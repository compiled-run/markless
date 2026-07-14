export {
	planModulePreloadUrls,
	planModulePreloads,
	type ModulePreloadFetchPriority,
	type ModulePreloadPlanEntry,
	type ModulePreloadPlanInput,
	type ModulePreloadPriority,
	type ModulePreloadRoot,
} from './build/preload-plan.ts';
export { symbolVirtualModuleSourceFile } from './source-module.ts';
export {
	preloadLazySymbolModules,
	type AppendedModulePreloads,
	type LazySymbolPreloadView,
	type PreloadLazySymbolModulesInput,
} from './build/module-preload-dom.ts';
export { MARKLESS_SCOPED_STYLE_ATTRIBUTE, type MarklessBundleGraph } from './types.ts';
