import { mkdir, writeFile } from 'node:fs/promises';
import type { OutputBundle } from 'rolldown';
import { join, resolve } from 'pathe';

export interface ServerBuildState {
	entry: string | undefined;
}

export function serverBuildState(): ServerBuildState {
	return { entry: undefined };
}

export function recordServerEntry(
	state: ServerBuildState,
	outDir: string | undefined,
	bundle: OutputBundle,
	isServerEntry: (facadeModuleId: string) => boolean,
): void {
	if (!outDir) return;
	const entries = Object.values(bundle).filter(
		(item) => item.type === 'chunk' && item.isEntry,
	) as Array<{ fileName: string; facadeModuleId: string | null }>;
	const entry =
		entries.find((chunk) => chunk.facadeModuleId && isServerEntry(chunk.facadeModuleId)) ??
		(entries.length === 1 ? entries[0] : undefined);
	if (entry) state.entry = resolve(outDir, entry.fileName);
}

interface PrerenderNitro {
	readonly options: { readonly buildDir: string };
	readonly hooks: {
		hook(
			name: 'prerender:config',
			handler: (config: { renderer?: false | Record<string, unknown> }) => Promise<void>,
		): unknown;
	};
}

// Nitro builds its prerenderer without the Vite services, so it never reaches the built page server on its own.
export function prerenderRendererModule(state: ServerBuildState) {
	return {
		name: 'markless-router:prerender-renderer',
		setup(nitro: PrerenderNitro) {
			nitro.hooks.hook('prerender:config', async (config) => {
				if (!state.entry) return;
				const dir = join(nitro.options.buildDir, 'markless-router');
				const handler = join(dir, 'prerender-renderer.mjs');
				await mkdir(dir, { recursive: true });
				await writeFile(
					handler,
					[
						`import * as service from ${JSON.stringify(state.entry)};`,
						'const server = service.default ?? service;',
						'export default ({ req }) => server.fetch(req);',
						'',
					].join('\n'),
				);
				config.renderer = { handler };
			});
		},
	};
}
