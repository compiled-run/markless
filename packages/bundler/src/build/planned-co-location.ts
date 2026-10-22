import type { RolldownLog } from 'rolldown';

type ModuleEdges = {
	readonly dependencies: readonly string[];
	readonly dynamicDependencies: readonly string[];
};

/** The import() importers of each module that is also imported statically. */
export function dynamicImportersOf(
	modules: ReadonlyMap<string, ModuleEdges>,
): Map<string, readonly string[]> {
	const imported = new Set<string>();
	for (const module of modules.values()) for (const id of module.dependencies) imported.add(id);
	const importers = new Map<string, string[]>();
	for (const [id, module] of modules)
		for (const target of module.dynamicDependencies)
			if (imported.has(target)) {
				const list = importers.get(target) ?? [];
				list.push(id);
				importers.set(target, list);
			}
	return importers;
}

/**
 * Rolldown warns when an import() target lands in its importer's chunk. A pack plan that put both
 * in one pack chose that, so the import() resolves from the pack already loaded.
 */
export function isPlannedCoLocation(
	log: RolldownLog,
	packOf: (id: string) => string | undefined,
	dynamicImporters: ReadonlyMap<string, readonly string[]>,
): boolean {
	if (log.code !== 'INEFFECTIVE_DYNAMIC_IMPORT' || !log.id) return false;
	const pack = packOf(log.id);
	return (
		pack !== undefined &&
		(dynamicImporters.get(log.id) ?? []).some((importer) => packOf(importer) === pack)
	);
}
