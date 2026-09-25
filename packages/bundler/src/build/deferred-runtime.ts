import type { Plugin } from 'rolldown';
import type { RuntimeDemandMapManifest } from '../types.ts';
import { runtimeModuleIdFromOrigin } from './bundle-graph.ts';
import { MARKLESS_DEFERRED_PACK } from './route-pack-groups.ts';
import {
	isReExportDoor,
	undemandedRuntimeModules,
	withUndemandedReExportDoors,
} from './undemanded-runtime.ts';

type ModuleEdges = {
	readonly dependencies: readonly string[];
	readonly dynamicDependencies: readonly string[];
	readonly reExportsOnly?: boolean;
};

/**
 * Deferred packs for runtime no compiled demand names: each such dynamic-import target, plus what
 * only such targets reach. Modules reached from the same targets share one pack, so each target
 * stays its own chunk. A target other code imports statically still gets a pack: that importer
 * loads it through its static edge, while no preload plan follows a dynamic edge into it.
 */
export function deferredRuntimePacks(input: {
	readonly modules: ReadonlyMap<string, ModuleEdges>;
	readonly undemanded: ReadonlySet<string>;
}): Map<string, string> {
	const packs = new Map<string, string>();
	if (input.undemanded.size === 0) return packs;
	const undemanded = withUndemandedReExportDoors(input.modules, input.undemanded);
	const reach = (roots: Iterable<string>, skipUndemanded: boolean) => {
		const reached = new Set<string>();
		const pending = [...roots];
		while (pending.length) {
			const id = pending.pop()!;
			if (reached.has(id)) continue;
			reached.add(id);
			const module = input.modules.get(id);
			if (!module) continue;
			pending.push(...module.dependencies);
			for (const target of module.dynamicDependencies)
				if (!skipUndemanded || !undemanded.has(target)) pending.push(target);
		}
		return reached;
	};
	const lazy = reach(undemanded, false);
	const kept = reach(
		[...input.modules.keys()].filter((id) => !lazy.has(id)),
		true,
	);
	const dynamicTargets = new Set<string>();
	const behindUndemanded = new Set<string>();
	for (const [id, module] of input.modules) {
		for (const target of module.dynamicDependencies) dynamicTargets.add(target);
		if (undemanded.has(id))
			for (const dependency of module.dependencies) behindUndemanded.add(dependency);
	}
	const reachedBy = new Map<string, string[]>();
	for (const target of [...undemanded].sort()) {
		// Never import()ed and statically behind another undemanded module: it packs with that importer.
		if (behindUndemanded.has(target) && !dynamicTargets.has(target)) continue;
		const label = runtimeModuleIdFromOrigin(target.split('?')[0]!) ?? 'runtime';
		for (const id of reach([target], false)) {
			if (!input.modules.has(id) || (kept.has(id) && !undemanded.has(id))) continue;
			const labels = reachedBy.get(id) ?? [];
			if (!labels.includes(label)) labels.push(label);
			reachedBy.set(id, labels);
		}
	}
	for (const [id, labels] of reachedBy)
		packs.set(id, `${MARKLESS_DEFERRED_PACK}-${labels.join('+').replace(/[^\w+-]/g, '-')}`);
	return packs;
}

type DeferredRuntimePlugin = Pick<Plugin, 'name' | 'options' | 'buildEnd' | 'outputOptions'>;

// Unpacked client builds: runtime no compiled record demands leaves the shared chunks for deferred
// packs, which no preload plan follows; each still loads on its first import().
export function deferredRuntimePlugin(
	demandMaps: () => Iterable<RuntimeDemandMapManifest | undefined>,
): DeferredRuntimePlugin {
	let packs = new Map<string, string>();
	return {
		name: 'markless:deferred-runtime',
		// Deferred packs leave shared dependencies where they are, which Rolldown allows only here.
		options(input) {
			return input.preserveEntrySignatures === false
				? null
				: { ...input, preserveEntrySignatures: 'allow-extension' };
		},
		buildEnd(error) {
			packs = new Map();
			if (error) return;
			const modules = new Map<string, ModuleEdges>();
			for (const id of this.getModuleIds()) {
				const info = this.getModuleInfo(id);
				if (!info || ('isExternal' in info && info.isExternal)) continue;
				modules.set(id, {
					dependencies: info.importedIds,
					dynamicDependencies: info.dynamicallyImportedIds,
					reExportsOnly: isReExportDoor(info),
				});
			}
			packs = deferredRuntimePacks({
				modules,
				undemanded: undemandedRuntimeModules({
					demandMaps: demandMaps(),
					moduleIds: modules.keys(),
				}),
			});
		},
		outputOptions(output) {
			if (typeof output.codeSplitting !== 'object') return null;
			return {
				...output,
				codeSplitting: {
					...output.codeSplitting,
					groups: [
						{
							name: (id: string) => packs.get(id) ?? null,
							priority: 1000,
							includeDependenciesRecursively: false,
						},
						...(output.codeSplitting.groups ?? []),
					],
				},
			};
		},
	};
}
