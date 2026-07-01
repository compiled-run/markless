import { createMarklessRolldownPlugin } from '../../rolldown/src/index.ts';
import type { MarklessRolldownTransformResult } from '../../rolldown/src/index.ts';
import type { PipelineManifest, PipelineReceipt } from '../../protocol/src/index.ts';

export type MarklessHotUpdateContext = {
	readonly file: string;
	readonly read: () => string | Promise<string>;
};

export type MarklessHotUpdateResult = {
	readonly moduleId: string;
	readonly refreshedManifest: true;
	readonly changedVirtualModules: ReadonlyArray<string>;
	readonly beforeRevision: number;
	readonly afterRevision: number;
	readonly transformed: boolean;
};

export type MarklessVitePlugin = {
	readonly name: '@markless/bundler/vite';
	readonly enforce: 'pre';
	readonly markless: {
		readonly compilerModel: 'rolldown-base-plugin';
		readonly usesSecondCompilerModel: false;
		readonly basePluginName: '@markless/bundler/rolldown';
		readonly manifest: () => PipelineManifest;
		readonly receipts: () => ReadonlyArray<PipelineReceipt>;
	};
	readonly transform: (
		code: string,
		id: string,
	) => Promise<MarklessRolldownTransformResult | null>;
	readonly load: (id: string) => Promise<string | null>;
	readonly handleHotUpdate: (
		context: MarklessHotUpdateContext,
	) => Promise<MarklessHotUpdateResult>;
};

export function createMarklessVitePlugin(): MarklessVitePlugin {
	const base = createMarklessRolldownPlugin();
	const adapterReceipts: PipelineReceipt[] = [];

	return {
		name: '@markless/bundler/vite',
		enforce: 'pre',
		markless: {
			compilerModel: 'rolldown-base-plugin',
			usesSecondCompilerModel: false,
			basePluginName: base.name,
			manifest: () => base.manifest(),
			receipts: () => [...base.receipts(), ...adapterReceipts],
		},
		async transform(code, id) {
			const result = await base.transform(code, id);

			if (result) {
				adapterReceipts.push({
					stage: 'vite-transform',
					moduleId: id,
					inspectable: true,
					summary:
						'Vite POC adapter delegated TSRX transform to the Rolldown base plugin.',
					details: {
						basePluginName: base.name,
						usesSecondCompilerModel: false,
					},
				});
			}

			return result;
		},
		load(id) {
			return base.load(id);
		},
		async handleHotUpdate(context) {
			const before = base.manifest();
			const beforeVirtualIds = new Set(before.virtualModules.map((module) => module.id));
			const source = await context.read();
			const result = await base.transform(source, context.file);
			const after = base.manifest();
			const afterVirtualIds = after.virtualModules.map((module) => module.id);
			const changedVirtualModules = afterVirtualIds.filter((id) => beforeVirtualIds.has(id));

			adapterReceipts.push({
				stage: 'hmr-update',
				moduleId: context.file,
				inspectable: true,
				summary:
					'Vite POC adapter refreshed transform and manifest records for an HMR edit.',
				details: {
					beforeRevision: before.revision,
					afterRevision: after.revision,
					refreshedManifest: true,
					changedVirtualModules,
				},
			});

			return {
				moduleId: context.file,
				refreshedManifest: true,
				changedVirtualModules,
				beforeRevision: before.revision,
				afterRevision: after.revision,
				transformed: result !== null,
			};
		},
	};
}
