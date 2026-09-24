import type { Plugin } from 'rolldown';
import { isAbsolute, relative } from 'pathe';
import { isStartupPack, planRoutePackGroups } from './route-pack-groups.ts';
import { lazyModuleFacadesPlugin } from './lazy-module-facades.ts';
import { MARKLESS_INTERACTION_CLOSURES_ASSET } from './planned-landing.ts';
import { undemandedRuntimeModules } from './undemanded-runtime.ts';
import {
	computeInteractionClosures,
	interactionClosuresAsset,
	type InteractionDemandSource,
	type PackPlannerMode,
	type RouteInteractionClosures,
} from './interaction-closures.ts';
import type { RuntimeDemandMapManifest } from '../types.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from '../execution-log.ts';
import {
	MARKLESS_ROUTE_SOURCE_QUERY_RE,
	isRouteNavigationSourceRequest,
	normalizeVirtualId,
	renderDataReachedFromQuery,
	resolverVirtualModuleSourceFile,
	sourceForSymbolVirtualImporter,
	sourceForResumeVirtualImporter,
	sourceForPrerenderWakeVirtualImporter,
	sourceForSettleVirtualImporter,
	sourceForTriggerGroupVirtualImporter,
} from '../virtual-ids.ts';

// Leading V8 compile hint: the browser compiles the whole pack while streaming it, not at first use.
export const EAGER_COMPILE_HINT = '//# allFunctionsCalledOnLoad';

type NativePackingPlugin = Pick<
	Plugin,
	| 'name'
	| 'options'
	| 'buildEnd'
	| 'outputOptions'
	| 'renderStart'
	| 'renderChunk'
	| 'renderError'
	| 'generateBundle'
>;

export function nativePackingPlugins(
	root: () => string,
	demandMaps: () => Iterable<RuntimeDemandMapManifest | undefined> = () => [],
	planner?: {
		readonly mode: PackPlannerMode;
		readonly demandSources: () => Iterable<InteractionDemandSource>;
	},
): NativePackingPlugin[] {
	let groups = new Map<string, string>();
	let routeSets = new Map<string, ReadonlyArray<string>>();
	let closures: RouteInteractionClosures[] | undefined;
	let partitioned = false;
	return [
		{
			name: 'markless:route-packs',
			options(input) {
				return { ...input, preserveEntrySignatures: 'allow-extension' };
			},
			buildEnd(error) {
				groups = new Map();
				routeSets = new Map();
				closures = undefined;
				partitioned = false;
				if (error) return;
				const modules = new Map<
					string,
					{
						dependencies: readonly string[];
						dynamicDependencies: readonly string[];
						source?: string;
						reachedFrom?: string;
						navigationOnly?: boolean;
						size?: number;
					}
				>();
				const routes = new Map<string, string[]>();
				const routeSources = new Set<string>();
				const entrySources = new Set<string>();
				for (const id of this.getModuleIds()) {
					const info = this.getModuleInfo(id);
					if (!info || ('isExternal' in info && info.isExternal)) continue;
					const source =
						sourceForSymbolVirtualImporter(id) ??
						sourceForResumeVirtualImporter(id) ??
						sourceForPrerenderWakeVirtualImporter(id) ??
						sourceForSettleVirtualImporter(id) ??
						sourceForTriggerGroupVirtualImporter(id) ??
						resolverVirtualModuleSourceFile(normalizeVirtualId(id)) ??
						(isAbsolute(id) ? id.split('?')[0] : undefined);
					modules.set(id, {
						dependencies: info.importedIds,
						dynamicDependencies: info.dynamicallyImportedIds,
						source,
						reachedFrom: renderDataReachedFromQuery(id),
						size: info.code?.length ?? 0,
					});
					if (!source) continue;
					if (MARKLESS_ROUTE_SOURCE_QUERY_RE.test(id)) routeSources.add(source);
					if (info.isEntry) entrySources.add(source);
				}
				const roots = routeSources.size ? routeSources : entrySources;
				for (const [id, module] of modules) {
					if (routeSources.size && isRouteNavigationSourceRequest(id))
						module.navigationOnly = true;
					if (!module.source || !roots.has(module.source)) continue;
					const route = relative(root(), module.source);
					const ids = routes.get(route) ?? [];
					ids.push(id);
					routes.set(route, ids);
				}
				closures = planner
					? computeInteractionClosures({
							root: root(),
							modules,
							routes,
							demand: planner.demandSources(),
						})
					: undefined;
				// Entry-rooted builds resolve symbols through their source's symbol chunk, so they stay unsplit.
				partitioned = !!closures && routeSources.size > 0;
				groups = planRoutePackGroups({
					modules,
					routes,
					routeSets,
					...(closures && partitioned ? { closures } : {}),
					undemandedDynamicTargets: undemandedRuntimeModules({
						demandMaps: demandMaps(),
						moduleIds: modules.keys(),
					}),
				});
			},
			outputOptions(output) {
				if (output.format && !['es', 'esm', 'module'].includes(output.format))
					throw new Error('Markless native packing requires ES module output.');
				if (typeof output.codeSplitting === 'boolean')
					throw new Error(
						'Markless native packing requires output.codeSplitting to be an object.',
					);
				const userPostBanner = output.postBanner;
				return {
					...output,
					postBanner: async (chunk) => {
						const user =
							typeof userPostBanner === 'function'
								? await userPostBanner(chunk)
								: (userPostBanner ?? '');
						const critical = chunk.moduleIds.some((id) => {
							const group = groups.get(id);
							return group !== undefined && isStartupPack(group);
						});
						if (!critical) return user;
						return user ? `${EAGER_COMPILE_HINT}\n${user}` : EAGER_COMPILE_HINT;
					},
					strictExecutionOrder: true,
					minifyInternalExports: false,
					codeSplitting: {
						...output.codeSplitting,
						groups: [
							{
								name: (id) =>
									normalizeVirtualId(id) === MARKLESS_EXECUTION_LOG_MODULE_ID
										? null
										: (groups.get(id) ?? null),
								priority: 1000,
								includeDependenciesRecursively: false,
							},
							...(output.codeSplitting?.groups ?? []),
						],
					},
				};
			},
			...(planner
				? {
						generateBundle(_output, bundle) {
							if (!closures) return;
							const chunkOf = new Map<string, string>();
							for (const chunk of Object.values(bundle))
								if (chunk.type === 'chunk')
									for (const id of chunk.moduleIds)
										chunkOf.set(id, chunk.fileName);
							this.emitFile({
								type: 'asset',
								fileName: MARKLESS_INTERACTION_CLOSURES_ASSET,
								source: interactionClosuresAsset({
									root: root(),
									closures,
									packs: groups,
									partition: partitioned ? 'tiers' : 'unsplit:entry-roots',
									chunkOf,
								}),
							});
						},
					}
				: {}),
		},
		lazyModuleFacadesPlugin(
			root,
			(id) => groups.get(id),
			(pack) => routeSets.get(pack),
		),
	];
}
