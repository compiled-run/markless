import type { Plugin } from 'rolldown';
import { isAbsolute, relative } from 'pathe';
import { isStartupPack, planRoutePackGroups } from './route-pack-groups.ts';
import { isAppModule } from './byte-attribution.ts';
import { lazyModuleFacadesPlugin } from './lazy-module-facades.ts';
import { shortExportNamesPlugin } from './short-export-names.ts';
import { packTopLevelPlugin } from './pack-top-level.ts';
import { MARKLESS_INTERACTION_CLOSURES_ASSET } from './planned-landing.ts';
import {
	isReExportDoor,
	undemandedRuntimeModules,
	withUndemandedReExportDoors,
} from './undemanded-runtime.ts';
import {
	computeInteractionClosures,
	interactionClosuresAsset,
	type InteractionDemandSource,
	type RouteInteractionClosures,
} from './interaction-closures.ts';
import type { RuntimeDemandMapManifest } from '../types.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from '../execution-log.ts';
import {
	MARKLESS_ROUTE_SOURCE_QUERY_RE,
	isResumeSourceRequest,
	isRouteNavigationSourceRequest,
	isSymbolOnlySourceRequest,
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
	demandSources: () => Iterable<InteractionDemandSource> = () => [],
): NativePackingPlugin[] {
	let groups = new Map<string, string>();
	let routeSets = new Map<string, ReadonlyArray<string>>();
	let eagerLazyRoutes = new Map<string, ReadonlyArray<string>>();
	let closures: RouteInteractionClosures[] | undefined;
	let partitioned = false;
	const facades = lazyModuleFacadesPlugin(
		root,
		(id) => groups.get(id),
		(pack) => routeSets.get(pack),
		(pack) => eagerLazyRoutes.get(pack),
	);
	return [
		{
			name: 'markless:route-packs',
			options(input) {
				return { ...input, preserveEntrySignatures: 'allow-extension' };
			},
			buildEnd(error) {
				groups = new Map();
				routeSets = new Map();
				eagerLazyRoutes = new Map();
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
						firstEvent?: boolean;
						handler?: boolean;
						size?: number;
						app?: boolean;
						reExportsOnly?: boolean;
					}
				>();
				const routes = new Map<string, string[]>();
				const routeSources = new Set<string>();
				const entrySources = new Set<string>();
				const entryIds = new Set<string>();
				for (const id of this.getModuleIds()) {
					const info = this.getModuleInfo(id);
					if (!info || ('isExternal' in info && info.isExternal)) continue;
					const handlerSource = sourceForSymbolVirtualImporter(id);
					const eventSource =
						handlerSource ??
						sourceForResumeVirtualImporter(id) ??
						sourceForPrerenderWakeVirtualImporter(id) ??
						sourceForSettleVirtualImporter(id) ??
						sourceForTriggerGroupVirtualImporter(id);
					const source =
						eventSource ??
						resolverVirtualModuleSourceFile(normalizeVirtualId(id)) ??
						(isAbsolute(id) ? id.split('?')[0] : undefined);
					modules.set(id, {
						firstEvent:
							!!eventSource ||
							!!info.isEntry ||
							isResumeSourceRequest(id) ||
							isSymbolOnlySourceRequest(id),
						handler: !!handlerSource,
						dependencies: info.importedIds,
						dynamicDependencies: info.dynamicallyImportedIds,
						source,
						reachedFrom: renderDataReachedFromQuery(id),
						size: info.code?.length ?? 0,
						app: isAppModule(id, root()),
						reExportsOnly: isReExportDoor(info),
					});
					if (!source) continue;
					if (MARKLESS_ROUTE_SOURCE_QUERY_RE.test(id)) routeSources.add(source);
					if (info.isEntry) {
						entrySources.add(source);
						entryIds.add(id);
					}
				}
				const roots = routeSources.size ? routeSources : entrySources;
				for (const [id, module] of modules) {
					if (routeSources.size && isRouteNavigationSourceRequest(id))
						module.navigationOnly = true;
					if (!module.source || !roots.has(module.source)) continue;
					// A bare module belongs to the entry importing it, not to resume or wake entries sharing its source.
					if (
						!routeSources.size &&
						!entryIds.has(id) &&
						isAbsolute(id) &&
						!id.includes('?')
					)
						continue;
					const route = relative(root(), module.source);
					const ids = routes.get(route) ?? [];
					ids.push(id);
					routes.set(route, ids);
				}
				closures = computeInteractionClosures({
					root: root(),
					modules,
					routes,
					demand: demandSources(),
				});
				// Entry-rooted builds resolve symbols through their source's symbol chunk, so their first use counts as unknown.
				partitioned = routeSources.size > 0;
				groups = planRoutePackGroups({
					modules,
					routes,
					routeSets,
					eagerLazyRoutes,
					pagesLoadOneRoute: routeSources.size > 0,
					closures: partitioned ? closures : [],
					undemandedDynamicTargets: withUndemandedReExportDoors(
						modules,
						undemandedRuntimeModules({
							demandMaps: demandMaps(),
							moduleIds: modules.keys(),
						}),
					),
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
			generateBundle(_output, bundle) {
				if (!closures) return;
				const chunkOf = new Map<string, string[]>();
				const add = (id: string, fileName: string) =>
					chunkOf.set(id, [...(chunkOf.get(id) ?? []), fileName]);
				for (const chunk of Object.values(bundle))
					if (chunk.type === 'chunk')
						for (const id of chunk.moduleIds) add(id, chunk.fileName);
				// A module-free facade chunk is the file an import() of its module fetches first.
				for (const chunk of Object.values(bundle))
					if (chunk.type === 'chunk' && !chunk.moduleIds.length && chunk.facadeModuleId)
						add(chunk.facadeModuleId, chunk.fileName);
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
		},
		facades,
		packTopLevelPlugin(),
		shortExportNamesPlugin(() => facades.api.removedChunks()),
	];
}
