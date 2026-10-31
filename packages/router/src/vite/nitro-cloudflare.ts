import { readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'pathe';
import type { Plugin } from 'vite';
import { buildRouteManifestFromFileIds, normalizeRouteFileId } from '../route-manifest.ts';
import { FRAGMENT_PATH_PREFIX } from './fragment-navigation.ts';
import { isCloudflarePreset } from './nitro-compressed-assets.ts';

interface CloudflareNitro {
	readonly options: {
		readonly preset?: string;
		readonly dev?: boolean;
		readonly rootDir?: string;
		readonly cloudflare?: {
			readonly wrangler?: { readonly assets?: { readonly run_worker_first?: unknown } };
		};
		prerender: { autoSubfolderIndex?: boolean };
		readonly output: { readonly serverDir: string };
	};
	readonly hooks?: {
		hook(name: 'compiled', handler: () => Promise<void>): unknown;
		hook(
			name: 'prerender:done',
			handler: (result: {
				readonly prerenderedRoutes?: readonly {
					readonly route: string;
					readonly error?: unknown;
				}[];
			}) => Promise<void>,
		): unknown;
	};
	readonly logger?: { info(message: string): void };
}

// Cloudflare serves an asset only at the URL its file name implies and redirects the other spelling,
// so a prerendered page is written as `guide.html` for `/guide` and `guide/index.html` for `/guide/`.
export function cloudflareModule(configured: { readonly autoSubfolderIndex: boolean }) {
	return {
		name: 'markless-router:cloudflare',
		async setup(nitro: CloudflareNitro) {
			if (nitro.options.dev || !isCloudflarePreset(nitro.options.preset)) return;
			trim.pages = nitro.options.preset === 'cloudflare-pages';
			trim.workerFirst =
				Boolean(nitro.options.cloudflare?.wrangler?.assets?.run_worker_first) ||
				(await nearestWranglerSays(nitro.options.rootDir ?? '.', /run_worker_first/));
			if (!configured.autoSubfolderIndex) nitro.options.prerender.autoSubfolderIndex = false;
			// Nitro prerenders before it writes the Worker, so the pages are left out once it is written.
			let prerendered = new Set<string>();
			nitro.hooks?.hook('prerender:done', async ({ prerenderedRoutes = [] }) => {
				prerendered = new Set(
					prerenderedRoutes.flatMap((route) => (route.error ? [] : [route.route])),
				);
			});
			nitro.hooks?.hook('compiled', async () => {
				const serverDir = nitro.options.output.serverDir;
				const config = JSON.parse(
					await readFile(join(serverDir, 'wrangler.json'), 'utf8').catch(() => '{}'),
				) as WranglerConfig;
				const workerFirst = workerFirstPatterns(config);
				if (workerFirst === undefined || !config.main) return;
				const { pages, bytes } = await pruneRenderedPages(
					serverDir,
					prerendered,
					workerFirst,
					config.main,
				);
				if (pages > 0)
					nitro.logger?.info(
						`Markless Router left ${pages} prerendered pages out of the Worker (${(bytes / 1048576).toFixed(1)} MiB).`,
					);
			});
		},
	};
}

interface WranglerAssets {
	readonly html_handling?: string;
	readonly run_worker_first?: boolean | readonly string[];
}

interface WranglerConfig {
	readonly main?: string;
	readonly pages_build_output_dir?: string;
	readonly assets?: WranglerAssets;
	readonly env?: Readonly<Record<string, { readonly assets?: WranglerAssets }>>;
}

// Every run_worker_first pattern of the config and its environments, or undefined when pruning is not safe:
// Pages routes by _routes.json, and only Cloudflare's default html handling serves `/guide` from guide.html.
export function workerFirstPatterns(config: WranglerConfig): string[] | undefined {
	if (config.pages_build_output_dir !== undefined) return undefined;
	const patterns: string[] = [];
	for (const assets of [
		config.assets,
		...Object.values(config.env ?? {}).map((env) => env.assets),
	]) {
		if (!assets) continue;
		if (assets.html_handling !== undefined && assets.html_handling !== 'auto-trailing-slash')
			return undefined;
		if (assets.run_worker_first === true) return undefined;
		if (Array.isArray(assets.run_worker_first)) patterns.push(...assets.run_worker_first);
	}
	return patterns;
}

const PAGE_IMPORT = /"(\/?pages\/[^"]+)"\s*:\s*\(\)\s*=>\s*import\(\s*"(\.{1,2}\/[^"]+)"\s*\)/g;
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g;

/**
 * Cloudflare's Worker is capped at 64 MiB, and a request for a prerendered page or its fragment URL never reaches it.
 * A page with no params whose page and fragment URLs were both prerendered loses its import from the route table,
 * and every server module nothing else reaches is deleted.
 */
export async function pruneRenderedPages(
	serverDir: string,
	prerendered: ReadonlySet<string>,
	workerFirst: readonly string[] = [],
	main = 'index.mjs',
): Promise<{ pages: number; bytes: number }> {
	// A URL that `assets.run_worker_first` sends to the Worker is rendered there even when its file exists; a `!` pattern wins.
	const glob = (pattern: string) =>
		new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
	const include = workerFirst.filter((pattern) => !pattern.startsWith('!')).map(glob);
	const exclude = workerFirst
		.filter((pattern) => pattern.startsWith('!'))
		.map((pattern) => glob(pattern.slice(1)));
	const runsWorker = (url: string) =>
		include.some((pattern) => pattern.test(url)) &&
		!exclude.some((pattern) => pattern.test(url));
	const servedAsFile = (path: string) => {
		const spellings = [path.replace(/\/$/, '') || '/', `${path.replace(/\/$/, '')}/`];
		return (
			spellings.some((spelling) => prerendered.has(spelling)) && !spellings.some(runsWorker)
		);
	};
	const files = (await readdir(serverDir, { recursive: true }))
		.filter((file) => file.endsWith('.mjs'))
		.map((file) => join(serverDir, file));
	const sources = new Map(
		await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const)),
	);
	let pages = 0;
	for (const [file, source] of sources) {
		const imports = [...source.matchAll(PAGE_IMPORT)];
		if (imports.length === 0) continue;
		const manifest = buildRouteManifestFromFileIds(imports.map((match) => match[1]!));
		const unrendered = new Set(
			manifest.routes
				.filter(
					(route) =>
						route.params.length === 0 &&
						servedAsFile(route.pathname) &&
						servedAsFile(`${FRAGMENT_PATH_PREFIX}${route.pathname}`),
				)
				.map((route) => route.file),
		);
		if (unrendered.size === 0) continue;
		const rewritten = source.replace(PAGE_IMPORT, (match, page: string) => {
			if (!unrendered.has(normalizeRouteFileId(page))) return match;
			pages++;
			return `${JSON.stringify(page)}: () => Promise.reject(new Error(${JSON.stringify(`Markless Router: ${page} is prerendered and served as a file, so this Worker does not carry it.`)}))`;
		});
		sources.set(file, rewritten);
		await writeFile(file, rewritten);
	}
	if (pages === 0) return { pages, bytes: 0 };
	const reached = new Set<string>();
	const pending = [resolve(serverDir, main)];
	for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
		if (reached.has(file)) continue;
		reached.add(file);
		for (const match of sources.get(file)?.matchAll(RELATIVE_IMPORT) ?? [])
			pending.push(resolve(dirname(file), match[1]!));
	}
	let bytes = 0;
	for (const file of files) {
		if (reached.has(file)) continue;
		bytes += (await stat(file)).size;
		await rm(file);
		await rm(`${file}.map`, { force: true });
	}
	return { pages, bytes };
}

const WORKER_CONDITIONS = ['workerd', 'worker', 'browser'];

type ExportsEntry = string | { readonly [condition: string]: ExportsEntry } | null | undefined;

function conditionTarget(entry: ExportsEntry, conditions: readonly string[]): string | undefined {
	if (typeof entry === 'string') return entry;
	if (!entry || typeof entry !== 'object') return undefined;
	for (const [condition, value] of Object.entries(entry))
		if (conditions.includes(condition)) {
			const target = conditionTarget(value, conditions);
			if (target) return target;
		}
	return undefined;
}

async function installedPackage(name: string, importer: string) {
	for (let dir = dirname(importer); dir !== dirname(dir); dir = dirname(dir)) {
		const root = join(dir, 'node_modules', name);
		const manifest = await readFile(join(root, 'package.json'), 'utf8').catch(() => undefined);
		if (manifest === undefined) continue;
		return {
			root: await realpath(root),
			exports: (JSON.parse(manifest) as { exports?: unknown }).exports as
				| Record<string, ExportsEntry>
				| ExportsEntry,
		};
	}
	return undefined;
}

/**
 * A package whose exports offer a Node build and a default one, with no Worker or browser build, ships the default one
 * for runtimes without Node's APIs, often missing what the Node build exports. Under nodejs_compat a Worker has those
 * APIs, so a Worker build takes the Node build there, as a Node server would.
 */
export function cloudflareNodeBuildsPlugin(): Plugin {
	return {
		name: 'markless-router:cloudflare-node-builds',
		apply: 'build',
		applyToEnvironment: (environment) =>
			environment.name === 'nitro' &&
			environment.config.resolve.conditions.includes('workerd'),
		// CommonJS code bundled into the Worker's ESM still reads __filename and __dirname, which a Worker never defines.
		configEnvironment(name, config) {
			if (name !== 'nitro' || !config.resolve?.conditions?.includes('workerd')) return;
			return {
				define: {
					__filename: JSON.stringify('/index.mjs'),
					__dirname: JSON.stringify('/'),
				},
			};
		},
		resolveId: {
			order: 'pre',
			async handler(source, importer, options) {
				if (!importer || !/^(?:@[\w-][\w.-]*\/)?[\w-][\w.-]*(?:\/|$)/.test(source)) return;
				const parts = source.split('/');
				const name = source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
				const found = await installedPackage(name, importer.split('?')[0]!);
				if (!found || !found.exports || typeof found.exports !== 'object') return;
				const subpath = `.${source.slice(name.length)}`;
				const exportsMap = found.exports as Record<string, ExportsEntry>;
				const entry = Object.keys(exportsMap).some((key) => key.startsWith('.'))
					? exportsMap[subpath]
					: subpath === '.'
						? exportsMap
						: undefined;
				if (!entry || typeof entry !== 'object' || !('node' in entry)) return;
				if (Object.keys(entry).some((condition) => WORKER_CONDITIONS.includes(condition)))
					return;
				const required =
					(options as { kind?: string } | undefined)?.kind === 'require-call';
				const node = conditionTarget(
					entry.node,
					required
						? ['node', 'require', 'default']
						: ['node', 'import', 'module', 'default'],
				);
				return node ? resolve(found.root, node) : undefined;
			},
		},
	};
}

const PUBLIC_ASSETS_DATA = '#nitro/virtual/public-assets-data';
const EMPTY_PUBLIC_ASSETS = '\0markless-router:cloudflare-public-assets';

/**
 * Nitro lists every public file, with its etag and size, in the server bundle so a request for one can be forwarded to
 * the assets. Cloudflare serves those files before the Worker runs, so the Worker drops the list (2.7 MB to parse on
 * every cold isolate for 11,664 files), unless an app's run_worker_first sends asset URLs to the Worker.
 */
// Pages routes requests by _routes.json, which can send public files to the Function: it keeps the list, as does a
// Worker whose run_worker_first sends asset URLs to it.
const trim = { pages: false, workerFirst: false };

// The wrangler config Nitro merges: the nearest wrangler.json, wrangler.jsonc or wrangler.toml at or above the app.
async function nearestWranglerSays(rootDir: string, pattern: RegExp): Promise<boolean> {
	for (let dir = resolve(rootDir); ; dir = dirname(dir)) {
		for (const name of ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']) {
			const text = await readFile(join(dir, name), 'utf8').catch(() => undefined);
			if (text !== undefined) return pattern.test(text);
		}
		if (dir === dirname(dir)) return false;
	}
}

export function cloudflareWorkerTrimPlugin(): Plugin {
	return {
		name: 'markless-router:cloudflare-worker-trim',
		apply: 'build',
		applyToEnvironment: (environment) =>
			environment.name === 'nitro' &&
			environment.config.resolve.conditions.includes('workerd'),
		resolveId: {
			order: 'pre',
			handler(source) {
				if (source === PUBLIC_ASSETS_DATA && !trim.workerFirst && !trim.pages)
					return EMPTY_PUBLIC_ASSETS;
			},
		},
		load(id) {
			if (id === EMPTY_PUBLIC_ASSETS) return 'export default {};';
		},
	};
}
