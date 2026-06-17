import { createArcadeRolldownPlugin } from '../../rolldown/src/index.ts';
import type { ArcadeRolldownTransformResult } from '../../rolldown/src/index.ts';
import type { PipelineManifest, PipelineReceipt } from '../../protocol/src/index.ts';

export type ArcadeHotUpdateContext = {
	readonly file: string;
	readonly read: () => string | Promise<string>;
};

export type ArcadeHotUpdateResult = {
	readonly moduleId: string;
	readonly refreshedManifest: true;
	readonly changedVirtualModules: ReadonlyArray<string>;
	readonly beforeRevision: number;
	readonly afterRevision: number;
	readonly transformed: boolean;
};

export type ArcadeVitePlugin = {
	readonly name: '@arcadejs/bundler/vite';
	readonly enforce: 'pre';
	readonly arcade: {
		readonly compilerModel: 'rolldown-base-plugin';
		readonly usesSecondCompilerModel: false;
		readonly basePluginName: '@arcadejs/bundler/rolldown';
		readonly manifest: () => PipelineManifest;
		readonly receipts: () => ReadonlyArray<PipelineReceipt>;
	};
	readonly transform: (code: string, id: string) => Promise<ArcadeRolldownTransformResult | null>;
	readonly load: (id: string) => Promise<string | null>;
	readonly handleHotUpdate: (context: ArcadeHotUpdateContext) => Promise<ArcadeHotUpdateResult>;
};

export function createArcadeVitePlugin(): ArcadeVitePlugin {
	const base = createArcadeRolldownPlugin();
	const adapterReceipts: PipelineReceipt[] = [];

	return {
		name: '@arcadejs/bundler/vite',
		enforce: 'pre',
		arcade: {
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
