import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'pathe';
import { buildRouteManifestFromFileIds, normalizeRouteFileId } from '../route-manifest.ts';
import { FRAGMENT_PATH_PREFIX } from './fragment-navigation.ts';
import { isCloudflarePreset } from './nitro-compressed-assets.ts';

interface CloudflareNitro {
	readonly options: {
		readonly preset?: string;
		readonly dev?: boolean;
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
		setup(nitro: CloudflareNitro) {
			if (nitro.options.dev || !isCloudflarePreset(nitro.options.preset)) return;
			if (!configured.autoSubfolderIndex) nitro.options.prerender.autoSubfolderIndex = false;
			// Nitro prerenders before it writes the Worker, so the pages are left out once it is written.
			let prerendered = new Set<string>();
			nitro.hooks?.hook('prerender:done', async ({ prerenderedRoutes = [] }) => {
				prerendered = new Set(
					prerenderedRoutes.flatMap((route) => (route.error ? [] : [route.route])),
				);
			});
			nitro.hooks?.hook('compiled', async () => {
				const { pages, bytes } = await pruneRenderedPages(
					nitro.options.output.serverDir,
					prerendered,
				);
				if (pages > 0)
					nitro.logger?.info(
						`Markless Router left ${pages} prerendered pages out of the Worker (${(bytes / 1048576).toFixed(1)} MiB).`,
					);
			});
		},
	};
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
): Promise<{ pages: number; bytes: number }> {
	const files = (await readdir(serverDir, { recursive: true }))
		.filter((file) => file.endsWith('.mjs'))
		.map((file) => join(serverDir, file));
	const sources = new Map(
		await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const)),
	);
	const isPrerendered = (path: string) =>
		prerendered.has(path) || prerendered.has(`${path.replace(/\/$/, '')}/`);
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
						isPrerendered(route.pathname) &&
						isPrerendered(`${FRAGMENT_PATH_PREFIX}${route.pathname}`),
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
	const pending = [join(serverDir, 'index.mjs')];
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
