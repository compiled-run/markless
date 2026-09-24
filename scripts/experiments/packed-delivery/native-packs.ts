import { writeFile } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import type { Plugin } from 'vite';
import { planRoutePackGroups } from '../../../packages/bundler/src/build/route-pack-groups.ts';
import { lazyModuleFacadesPlugin } from '../../../packages/bundler/src/build/lazy-module-facades.ts';
import {
	normalizeVirtualId,
	resolverVirtualModuleSourceFile,
	sourceForSymbolVirtualImporter,
	sourceForResumeVirtualImporter,
	sourceForPrerenderWakeVirtualImporter,
	sourceForSettleVirtualImporter,
	sourceForTriggerGroupVirtualImporter,
} from '../../../packages/bundler/src/virtual-ids.ts';

export function nativePacks(): Plugin[] {
	let root = '';
	let groups = new Map<string, string>();
	return [
		{
			name: 'markless-native-packs-experiment',
			enforce: 'post',
			apply: 'build',
			configResolved(config) {
				root = config.root;
			},
			options(input) {
				if (this.environment.config.consumer === 'client')
					return { ...input, preserveEntrySignatures: 'allow-extension' };
			},
			buildEnd() {
				if (this.environment.config.consumer !== 'client') return;
				const modules = new Map<string, { dependencies: string[]; source?: string }>();
				const routes = new Map<string, string[]>();
				for (const id of this.getModuleIds()) {
					const info = this.getModuleInfo(id);
					if (!info || info.isExternal) continue;
					const bare = normalizeVirtualId(id);
					const source =
						sourceForSymbolVirtualImporter(id) ??
						sourceForResumeVirtualImporter(id) ??
						sourceForPrerenderWakeVirtualImporter(id) ??
						sourceForSettleVirtualImporter(id) ??
						sourceForTriggerGroupVirtualImporter(id) ??
						resolverVirtualModuleSourceFile(bare) ??
						(isAbsolute(id) ? id.split('?')[0] : undefined);
					modules.set(id, {
						dependencies: [...info.importedIds, ...info.dynamicallyImportedIds],
						source,
					});
					const route = source ? relative(root, source) : '';
					if (!/^pages\/.+\.(tsrx|mdx)$/.test(route)) continue;
					const roots = routes.get(route) ?? [];
					roots.push(id);
					routes.set(route, roots);
				}
				groups = planRoutePackGroups({ modules, routes });
			},
			outputOptions(output) {
				if (this.environment.config.consumer !== 'client') return;
				if (typeof output.codeSplitting === 'boolean')
					throw new Error('Expected Markless chunk groups.');
				return {
					...output,
					strictExecutionOrder: true,
					minifyInternalExports: false,
					codeSplitting: {
						...output.codeSplitting,
						groups: [
							{
								name: (id) => groups.get(id) ?? null,
								priority: 1000,
								includeDependenciesRecursively: false,
							},
							...(output.codeSplitting?.groups ?? []),
						],
					},
				};
			},
			generateBundle: {
				order: 'post',
				async handler(_, bundle) {
					if (this.environment.config.consumer !== 'client') return;
					await writeFile(
						'/private/tmp/markless-native-packs.json',
						JSON.stringify({
							groups: [...groups],
							chunks: Object.values(bundle)
								.filter((item) => item.type === 'chunk')
								.map((item) => ({
									fileName: item.fileName,
									bytes: item.code.length,
									imports: item.imports,
									dynamicImports: item.dynamicImports,
									moduleIds: item.moduleIds,
									code: item.code,
									facadeModuleId: item.facadeModuleId,
									exports: item.exports,
								})),
						}),
					);
				},
			},
		},
		{
			...lazyModuleFacadesPlugin(),
			applyToEnvironment(environment) {
				return environment.config.consumer === 'client';
			},
		},
	];
}
