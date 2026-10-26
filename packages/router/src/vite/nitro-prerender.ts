import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { OutputBundle } from 'rolldown';
import { join, resolve } from 'pathe';
import { joinURL, parseURL, withoutBase } from 'ufo';

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
	readonly options: {
		readonly buildDir: string;
		readonly baseURL: string;
		readonly output: { readonly publicDir: string };
	};
	readonly hooks: {
		hook(
			name: 'prerender:config',
			handler: (config: {
				renderer?: false | Record<string, unknown>;
				output?: Record<string, unknown>;
			}) => Promise<void>,
		): unknown;
		hook(
			name: 'prerender:done',
			handler: (result: {
				readonly prerenderedRoutes?: readonly { readonly fileName?: string }[];
			}) => Promise<void>,
		): unknown;
	};
}

// Nitro builds its prerenderer without the Vite services, so it never reaches the built page server on its own.
export function prerenderRendererModule(state: ServerBuildState, clientDirs: readonly string[]) {
	return {
		name: 'markless-router:prerender-renderer',
		setup(nitro: PrerenderNitro) {
			nitro.hooks.hook('prerender:done', async ({ prerenderedRoutes = [] }) => {
				const missing = await missingPrerenderedFiles(
					nitro.options.output.publicDir,
					nitro.options.baseURL,
					clientDirs,
					prerenderedRoutes.flatMap((route) => (route.fileName ? [route.fileName] : [])),
				);
				if (missing.length > 0) throw new Error(missingPrerenderedFilesMessage(missing));
			});
			nitro.hooks.hook('prerender:config', async (config) => {
				// The prerenderer serves static files ahead of pages; under another preset its default folder holds an earlier build's pages.
				config.output = { ...config.output, publicDir: nitro.options.output.publicDir };
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

export type MissingPrerenderedFile = { readonly page: string; readonly url: string };

const IMPORT_MAP = /<script\b[^>]*\btype=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi;
const LOADED_URL = /<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi;

/** URLs a prerendered page loads from the client build folders: script and link targets plus import map targets. */
export function prerenderedClientUrls(
	html: string,
	baseURL: string,
	clientDirs: readonly string[],
): string[] {
	const urls = [...html.matchAll(LOADED_URL)].map((match) => match[1]!);
	for (const [, source] of html.matchAll(IMPORT_MAP)) {
		let map: {
			imports?: Record<string, unknown>;
			scopes?: Record<string, Record<string, unknown>>;
		};
		try {
			map = JSON.parse(source!);
		} catch {
			throw new Error(
				`Markless Router prerendered an import map that is not JSON: ${source}`,
			);
		}
		for (const target of [
			...Object.values(map.imports ?? {}),
			...Object.values(map.scopes ?? {}).flatMap((scope) => Object.values(scope)),
		])
			if (typeof target === 'string') urls.push(target);
	}
	const prefixes = clientDirs.map((dir) => joinURL(baseURL, dir, '/'));
	return [...new Set(urls)].filter((url) => prefixes.some((prefix) => url.startsWith(prefix)));
}

export async function missingPrerenderedFiles(
	publicDir: string,
	baseURL: string,
	clientDirs: readonly string[],
	pageFiles: readonly string[],
): Promise<MissingPrerenderedFile[]> {
	const missing: MissingPrerenderedFile[] = [];
	const exists = new Map<string, Promise<boolean>>();
	for (const page of pageFiles) {
		const html = await readFile(join(publicDir, page), 'utf8').catch(() => undefined);
		if (html === undefined) continue;
		for (const url of prerenderedClientUrls(html, baseURL, clientDirs)) {
			const file = join(
				publicDir,
				decodeURIComponent(withoutBase(parseURL(url).pathname, baseURL)),
			);
			if (!exists.has(file))
				exists.set(
					file,
					stat(file).then(
						(entry) => entry.isFile(),
						() => false,
					),
				);
			if (!(await exists.get(file))) missing.push({ page, url });
		}
	}
	return missing;
}

export function missingPrerenderedFilesMessage(missing: readonly MissingPrerenderedFile[]): string {
	const shown = missing.slice(0, 20).map(({ page, url }) => `- ${page} loads ${url}`);
	if (missing.length > shown.length) shown.push(`- and ${missing.length - shown.length} more`);
	return `Markless Router prerendered pages that load client files this build did not emit, so a browser would fail to load them:\n${shown.join('\n')}\nAn earlier build's output or a stale cache reached the prerendered pages; delete the build output folders and build again.`;
}
