// The browser half of <Code>. The editor session is its own entry chunk, reached through
// a URL the bundler cannot follow, so a page with a block preloads none of it. The result
// runs in /_code-frame.html and compiles in the one Web Worker the session starts, where the
// bundler's Node-only imports are swapped for in-memory stand-ins.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';
import { CODE_PREFETCH_FILE } from '../components/docs/code/prefetch.ts';
import { codePrefetchManifest, type PrefetchBundle } from './code-prefetch.ts';

const RUNTIME_SOURCES_SCRIPT = fileURLToPath(new URL('./code-runtime-sources.ts', import.meta.url));

// Its own process: the block compiles must not share module state with this build's bundler.
async function siteRuntimeSources(): Promise<Record<string, string[]>> {
	const { stdout } = await promisify(execFile)(
		process.execPath,
		['--experimental-transform-types', '--no-warnings', RUNTIME_SOURCES_SCRIPT],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	return JSON.parse(stdout) as Record<string, string[]>;
}

async function warmPackReader(): Promise<(code: string) => string[]> {
	const core = createRequire(createRequire(import.meta.url).resolve('@markless/core'));
	const preload = await import(pathToFileURL(core.resolve('@markless/bundler/preload')).href);
	return preload.warmEvaluatedImports;
}

/** The import map the bundler wrote into a built page. */
function importMapOf(html: string): Record<string, string> {
	const map = /<script type="?importmap"?>([\s\S]*?)<\/script>/.exec(html)?.[1];
	return map ? (JSON.parse(map) as { imports: Record<string, string> }).imports : {};
}

const CODE_DIR = fileURLToPath(new URL('../components/docs/code/', import.meta.url));
const FRAME_ENTRY = `${CODE_DIR}frame.ts`;
const FRAME_RUNTIME = `${CODE_DIR}frame-runtime.ts`;
// Each is its own entry chunk the page reaches only through the URL its virtual module exports.
const BROWSER_ENTRIES: Readonly<Record<string, { readonly file: string; readonly name: string }>> = {
	'virtual:code-session-url': { file: `${CODE_DIR}session.ts`, name: 'code-session' },
	'virtual:code-live-url': {
		file: fileURLToPath(new URL('../components/docs/playground/live.ts', import.meta.url)),
		name: 'code-live',
	},
};
const BUNDLER_SWAPS: Readonly<Record<string, string>> = {
	'node:fs': `${CODE_DIR}source-fs.ts`,
	'node:fs/promises': `${CODE_DIR}source-fs.ts`,
	'node:url': `${CODE_DIR}bundler-shims.ts`,
	vite: `${CODE_DIR}bundler-shims.ts`,
	'vite/module-runner': `${CODE_DIR}bundler-shims.ts`,
	'rolldown/experimental': `${CODE_DIR}oxc-transform.ts`,
};

// Every source the swap answers; any other import never leaves rolldown.
const BUNDLER_SWAP_SOURCE = new RegExp(
	`^(?:${[...Object.keys(BUNDLER_SWAPS), 'node:path']
		.map((source) => source.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
		.join('|')})$|(?:^|/)event-loop\\.ts$`,
);

/** The file the frame is served as, under the site's base path. */
export const CODE_FRAME_FILE = '_code-frame.html';

/** The frame page: an empty stage and the script that fills it. */
export function codeFrameHtml(script: string, preloads: readonly string[] = []): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Code result</title>
<style>@font-face{font-family:'Shantell Sans';font-style:normal;font-weight:400 700;font-display:swap;src:url('/fonts/ShantellSans-latin-variable.woff2') format('woff2')}html{background:transparent;color-scheme:light}html.dark{color-scheme:dark}body{margin:0;color:CanvasText;font-family:system-ui,sans-serif}</style>
${preloads.map((href) => `<link rel="modulepreload" href="${href}">`).join('\n')}
<script type="module" src="${script}"></script>
</head>
<body class="code-stage" data-code-frame></body>
</html>
`;
}

/** Answers the bundler's Node-only imports with in-memory stand-ins, for the worker only. */
export function codeCompilerSwaps(): Plugin {
	return {
		name: 'compiled-website:code-compiler-swaps',
		enforce: 'pre',
		resolveId: {
			filter: { id: BUNDLER_SWAP_SOURCE },
			async handler(source, importer) {
				if (this.environment?.config.consumer === 'server' || !importer) return null;
				if (!importer.includes('/packages/bundler/src/')) return null;
				// The bundler's hooks run in the worker over an in-memory copy of the block's source.
				if (source === 'node:path')
					return (await this.resolve('pathe', importer, { skipSelf: true }))?.id ?? null;
				if (/(?:^|\/)event-loop\.ts$/.test(source)) return `${CODE_DIR}bundler-shims.ts`;
				return BUNDLER_SWAPS[source] ?? null;
			},
		},
	};
}

export function codeClient(): Plugin[] {
	let base = '/';
	let frameRef = '';
	let runtimeSources: Promise<Record<string, string[]>> | undefined;
	const entryRefs = new Map<string, string>();
	return [
		codeCompilerSwaps(),
		{
			name: 'compiled-website:code-frame',
			config() {
				return {
					worker: { format: 'es' as const, plugins: () => [codeCompilerSwaps()] },
				};
			},
			configResolved(config) {
				base = config.base;
			},
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					const path = (req.url ?? '').split('?', 1)[0];
					if (path !== `${base}${CODE_FRAME_FILE}`) return next();
					res.setHeader('content-type', 'text/html; charset=utf-8');
					res.end(codeFrameHtml(`${base}@fs${FRAME_ENTRY}`));
				});
			},
			buildStart() {
				if (
					this.environment?.name !== 'client' ||
					this.environment.config.command !== 'build'
				)
					return;
				runtimeSources = siteRuntimeSources();
				runtimeSources.catch(() => {});
				frameRef = this.emitFile({ type: 'chunk', id: FRAME_ENTRY, name: 'code-frame' });
				for (const [url, entry] of Object.entries(BROWSER_ENTRIES))
					entryRefs.set(url, this.emitFile({ type: 'chunk', id: entry.file, name: entry.name }));
			},
			resolveId: {
				filter: { id: /^virtual:code-/ },
				handler(source) {
					return Object.hasOwn(BROWSER_ENTRIES, source) ? `\0${source}` : null;
				},
			},
			load: {
				filter: { id: /^\0virtual:code-/ },
				handler(id) {
					const url = id.startsWith('\0') ? id.slice(1) : '';
					const entry = Object.hasOwn(BROWSER_ENTRIES, url) ? BROWSER_ENTRIES[url] : undefined;
					if (!entry) return null;
					if (this.environment?.config.consumer === 'server') return 'export default "";';
					const ref = entryRefs.get(url);
					if (ref) return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
					return `export default ${JSON.stringify(`${base}@fs${entry.file}`)};`;
				},
			},
			// A quoted relative path lets the bundler name the chunk through the import map, so a rename re-fetches only it.
			resolveFileUrl({ referenceId, relativePath }) {
				if (![...entryRefs.values()].includes(referenceId)) return null;
				return JSON.stringify(relativePath.startsWith('.') ? relativePath : `./${relativePath}`);
			},
			generateBundle(_options, bundle) {
				if (!frameRef || this.environment?.name !== 'client') return;
				const script = this.getFileName(frameRef);
				const chunk = bundle[script];
				const imports = chunk?.type === 'chunk' ? chunk.imports : [];
				this.emitFile({
					type: 'asset',
					fileName: CODE_FRAME_FILE,
					source: codeFrameHtml(
						`${base}${script}`,
						imports.map((file) => `${base}${file}`),
					),
				});
			},
			// The bundler gives every .html asset the import map the frame's chunks need, and also a
			// modulepreload for every chunk of the site; the frame keeps the map and its own preloads.
			writeBundle: {
				order: 'post',
				async handler(options, bundle) {
					if (!frameRef || this.environment?.name !== 'client' || !options.dir) return;
					const dir = options.dir;
					const file = join(dir, CODE_FRAME_FILE);
					const frameHtml = readFileSync(file, 'utf8');
					writeFileSync(file, dropSitePreloads(frameHtml));
					const manifest = codePrefetchManifest(bundle as unknown as PrefetchBundle, {
						base,
						sessionEntry: BROWSER_ENTRIES['virtual:code-session-url']!.file,
						liveEntry: BROWSER_ENTRIES['virtual:code-live-url']!.file,
						frameEntry: FRAME_ENTRY,
						runtimeTable: FRAME_RUNTIME,
						frameFile: `${base}${CODE_FRAME_FILE}`,
						blocks: await runtimeSources!,
						warmImports: await warmPackReader(),
						importMap: importMapOf(frameHtml),
					});
					const listed = [manifest.session, manifest.live, manifest.cache, ...Object.values(manifest.blocks)].flat();
					const missing = listed.filter((url) => !existsSync(join(dir, url.slice(base.length))));
					if (missing.length) throw new Error(`${CODE_PREFETCH_FILE} names files the build did not write: ${missing.join(', ')}`);
					writeFileSync(join(dir, CODE_PREFETCH_FILE), JSON.stringify(manifest));
				},
			},
		},
	];
}

/** Removes the bundler's unquoted `<link rel=modulepreload ...>` tags; the frame's own are quoted. */
export function dropSitePreloads(html: string): string {
	return html.replace(/<link rel=modulepreload [^>]*>/g, '');
}
