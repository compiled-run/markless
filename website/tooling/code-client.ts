// The browser half of <Code>. The editor session is its own entry chunk, reached through
// a URL the bundler cannot follow, so a page with a block preloads none of it. The result
// runs in /_code-frame.html and compiles in a Web Worker the frame starts; the compiler's
// parser, analyzer and printer ship as native addons, so the worker's build swaps each for
// its WebAssembly build.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const CODE_DIR = fileURLToPath(new URL('../components/docs/code/', import.meta.url));
const FRAME_ENTRY = `${CODE_DIR}frame.ts`;
const SESSION_ENTRY = `${CODE_DIR}session.ts`;
const SESSION_URL = 'virtual:code-session-url';
const SESSION_URL_ID = `\0${SESSION_URL}`;
const BUNDLER_SWAPS: Readonly<Record<string, string>> = {
	'node:fs': `${CODE_DIR}source-fs.ts`,
	'node:fs/promises': `${CODE_DIR}source-fs.ts`,
	'node:url': `${CODE_DIR}bundler-shims.ts`,
	vite: `${CODE_DIR}bundler-shims.ts`,
	'vite/module-runner': `${CODE_DIR}bundler-shims.ts`,
	'rolldown/experimental': `${CODE_DIR}oxc-transform.ts`,
};
const NATIVE_PACKAGES = ['@tsrx/yuku', 'yuku-analyzer', 'yuku-codegen'];

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
<style>html,body{margin:0;background:transparent}body{padding:0 6px 6px 0}</style>
${preloads.map((href) => `<link rel="modulepreload" href="${href}">`).join('\n')}
<script type="module" src="${script}"></script>
</head>
<body class="code-stage" data-code-frame></body>
</html>
`;
}

/** Answers the compiler's native imports with their WebAssembly builds, for the worker only. */
export function codeCompilerSwaps(): Plugin {
	return {
		name: 'compiled-website:code-compiler-swaps',
		enforce: 'pre',
		async resolveId(source, importer) {
			if (this.environment?.config.consumer === 'server' || !importer) return null;
			if (source === './binding.js' && importer.includes('/@tsrx/yuku/'))
				return `${CODE_DIR}yuku-tsrx-binding.ts`;
			if (source === './binding.js' && importer.includes('/@yuku-analyzer/wasm/'))
				return `${CODE_DIR}yuku-analyzer-binding.ts`;
			if (source === 'yuku-analyzer')
				return (
					(await this.resolve('@yuku-analyzer/wasm', FRAME_ENTRY, { skipSelf: true }))
						?.id ?? null
				);
			if (source === 'yuku-codegen') return `${CODE_DIR}yuku-codegen.ts`;
			if (!importer.includes('/packages/bundler/src/')) return null;
			// The bundler's hooks run in the worker over an in-memory copy of the block's source.
			if (source === 'node:path')
				return (await this.resolve('pathe', importer, { skipSelf: true }))?.id ?? null;
			if (/(?:^|\/)event-loop\.ts$/.test(source)) return `${CODE_DIR}bundler-shims.ts`;
			return BUNDLER_SWAPS[source] ?? null;
		},
	};
}

export function codeClient(): Plugin[] {
	let base = '/';
	let frameRef = '';
	let sessionRef = '';
	return [
		codeCompilerSwaps(),
		{
			name: 'compiled-website:code-frame',
			config() {
				return {
					optimizeDeps: {
						exclude: [...NATIVE_PACKAGES, '@yuku-analyzer/wasm', '@yuku-codegen/wasm'],
					},
					worker: { format: 'es' as const, plugins: () => [codeCompilerSwaps()] },
				};
			},
			configResolved(config) {
				base = config.base;
			},
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					const path = (req.url ?? '').split('?', 1)[0];
					// Nitro's dev middleware treats every fetch() (Sec-Fetch-Dest: empty) as a page request.
					if (path.endsWith('.wasm')) delete req.headers['sec-fetch-dest'];
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
				frameRef = this.emitFile({ type: 'chunk', id: FRAME_ENTRY, name: 'code-frame' });
				sessionRef = this.emitFile({
					type: 'chunk',
					id: SESSION_ENTRY,
					name: 'code-session',
				});
			},
			resolveId(source) {
				return source === SESSION_URL ? SESSION_URL_ID : null;
			},
			load(id) {
				if (id !== SESSION_URL_ID) return null;
				if (this.environment?.config.consumer === 'server') return 'export default "";';
				if (sessionRef) return `export default import.meta.ROLLUP_FILE_URL_${sessionRef};`;
				return `export default ${JSON.stringify(`${base}@fs${SESSION_ENTRY}`)};`;
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
				handler(options) {
					if (!frameRef || this.environment?.name !== 'client' || !options.dir) return;
					const file = join(options.dir, CODE_FRAME_FILE);
					writeFileSync(file, dropSitePreloads(readFileSync(file, 'utf8')));
				},
			},
		},
	];
}

/** Removes the bundler's unquoted `<link rel=modulepreload ...>` tags; the frame's own are quoted. */
export function dropSitePreloads(html: string): string {
	return html.replace(/<link rel=modulepreload [^>]*>/g, '');
}
