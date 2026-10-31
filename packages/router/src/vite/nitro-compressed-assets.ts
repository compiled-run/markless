import { availableParallelism } from 'node:os';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import { join } from 'pathe';
import type { Plugin } from 'vite';
import { MARKLESS_BUILD_PREFIX } from '@markless/bundler/rolldown';

type EdgeRoute = {
	readonly src: string;
	readonly dest: string;
	readonly has: ReadonlyArray<{
		readonly type: 'header';
		readonly key: string;
		readonly value: string;
	}>;
	readonly headers: Readonly<Record<string, string>>;
};

type CompressedAssetsNitro = {
	options: {
		preset?: string;
		dev?: boolean;
		entry?: string;
		buildDir?: string;
		handlers?: Array<{ route: string; middleware: boolean; handler: string }>;
		baseURL?: string;
		serveStatic?: boolean | string;
		output: { publicDir: string; serverDir?: string };
		compressPublicAssets?: boolean | { gzip?: boolean; brotli?: boolean; zstd?: boolean };
		vercel?: { config?: { routes?: EdgeRoute[] } };
	};
	hooks?: { hook(name: 'compiled', handler: () => Promise<void>): unknown };
};

// A rendered page is compressed per request while it streams, so brotli runs at a quality cheap enough to keep up.
export const RENDERED_BROTLI_QUALITY = 5;

// Each chunk is flushed as it is written, so a @pending arm reaches the browser before the data behind it is ready.
const compressRenderedSource = `import { constants, createBrotliCompress, createGzip } from 'node:zlib';
const accepts = (header, name) =>
	header.split(',').some((part) => {
		const [coding, ...params] = part.trim().toLowerCase().split(';');
		const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
		return coding === name && (!q || Number(q.slice(2)) > 0);
	});
const compressed = (source, zip) =>
	new ReadableStream({
		start(controller) {
			zip.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk)));
			zip.on('end', () => controller.close());
			zip.on('error', (error) => controller.error(error));
			void (async () => {
				const reader = source.getReader();
				try {
					for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
						if (!zip.write(chunk.value)) await new Promise((done) => zip.once('drain', done));
					zip.end();
				} catch (error) {
					zip.destroy(error);
				}
			})();
		},
		cancel(reason) {
			zip.destroy();
			return source.cancel(reason);
		},
	});
export default async function compressRendered(event, next) {
	const response = await next();
	if (!(response instanceof Response) || !response.body) return response;
	const headers = response.headers;
	if (headers.has('content-encoding') || !/^text\\/html\\b/i.test(headers.get('content-type') ?? '')) return response;
	if (/\\bno-transform\\b/i.test(headers.get('cache-control') ?? '')) return response;
	const accepted = event.req.headers.get('accept-encoding') ?? '';
	const encoding = accepts(accepted, 'br') ? 'br' : accepts(accepted, 'gzip') ? 'gzip' : undefined;
	const sent = new Headers(headers);
	sent.append('vary', 'accept-encoding');
	if (!encoding) return new Response(response.body, { status: response.status, statusText: response.statusText, headers: sent });
	sent.set('content-encoding', encoding);
	sent.delete('content-length');
	const zip =
		encoding === 'br'
			? createBrotliCompress({
					flush: constants.BROTLI_OPERATION_FLUSH,
					params: { [constants.BROTLI_PARAM_QUALITY]: ${RENDERED_BROTLI_QUALITY} },
				})
			: createGzip({ flush: constants.Z_SYNC_FLUSH });
	return new Response(compressed(response.body, zip), { status: response.status, statusText: response.statusText, headers: sent });
}
`;

// Nitro's brotli runs at quality 11: about 30 to 37 ms a file against 0.4 to 0.5 ms at 9, for 4 to 15% fewer bytes.
export const PUBLIC_BROTLI_QUALITY = 9;

// Vercel's and Cloudflare's edges compress 15 to 20% larger than quality 11; a client chunk is built once and fetched on every landing.
export const EDGE_BROTLI_QUALITY = 11;

const EDGE_CONTENT_TYPES = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };

export interface CompressedAssetsState {
	brotliDir: string | undefined;
	// Client chunks a CDN host serves from their brotli copies.
	edgeBrotliDir?: string | undefined;
}

export function compressedAssetsState(): CompressedAssetsState {
	return { brotliDir: undefined };
}

// Cloudflare compresses every response again unless the Worker sends it with encodeBody 'manual'.
const cloudflareEntrySource = (
	entry: string,
	prefix: string,
) => `import worker from ${JSON.stringify(entry)};
export * from ${JSON.stringify(entry)};
const prefix = ${JSON.stringify(prefix)};
const types = ${JSON.stringify(EDGE_CONTENT_TYPES)};
const acceptsBrotli = (header) =>
	header.split(',').some((part) => {
		const [coding, ...params] = part.trim().toLowerCase().split(';');
		const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
		return coding === 'br' && (!q || Number(q.slice(2)) > 0);
	});
export default {
	...worker,
	async fetch(request, env, context) {
		const url = new URL(request.url);
		const type = url.pathname.startsWith(prefix) && types[url.pathname.slice(url.pathname.lastIndexOf('.') + 1)];
		if (type && env.ASSETS && !request.headers.has('range') && acceptsBrotli(request.headers.get('accept-encoding') ?? '')) {
			const copy = await env.ASSETS.fetch(new Request(new URL(url.pathname + '.br', url), request));
			if (copy.status === 200 || copy.status === 304) {
				const headers = new Headers(copy.headers);
				headers.set('content-type', type);
				headers.set('cache-control', 'public, max-age=31536000, immutable');
				headers.set('vary', 'Accept-Encoding');
				if (copy.status === 200) headers.set('content-encoding', 'br');
				return new Response(copy.body, { status: copy.status, headers, encodeBody: 'manual' });
			}
		}
		return worker.fetch(request, env, context);
	},
};
`;

/** Whether a Nitro preset deploys to Cloudflare Workers or Pages. */
export function isCloudflarePreset(preset: string | undefined): boolean {
	return preset !== undefined && preset.startsWith('cloudflare') && preset !== 'cloudflare-dev';
}

// A server that serves its own files (node, bun, deno) gets gzip and brotli copies; a host with a CDN (vercel, netlify) compresses at its edge.
export function compressedAssetsModule(
	configured: boolean,
	state: CompressedAssetsState = compressedAssetsState(),
) {
	return {
		name: 'markless-router:compressed-assets',
		async setup(nitro: CompressedAssetsNitro) {
			const { preset, serveStatic } = nitro.options;
			// The prerenderer is a second Nitro with its own preset and output; the files served are the build's own.
			if (preset === 'nitro-prerender') return;
			if (isCloudflarePreset(preset) && !nitro.options.dev) {
				// Cloudflare never serves Nitro's .gz or .br copies, which would only count against its file limit.
				const off = nitro.options.compressPublicAssets === false;
				nitro.options.compressPublicAssets = false;
				if (
					(configured && off) ||
					preset === 'cloudflare-pages' ||
					!nitro.options.entry ||
					!nitro.options.buildDir
				)
					return;
				const base = nitro.options.baseURL ?? '/';
				const dir = join(nitro.options.buildDir, 'markless-router');
				const entry = join(dir, 'cloudflare-entry.mjs');
				await mkdir(dir, { recursive: true });
				await writeFile(
					entry,
					cloudflareEntrySource(nitro.options.entry, `${base}${MARKLESS_BUILD_PREFIX}`),
				);
				nitro.options.entry = entry;
				nitro.hooks?.hook('compiled', async () => {
					const file = join(nitro.options.output.serverDir ?? '', 'wrangler.json');
					const config = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as {
						assets?: { run_worker_first?: boolean | string[] };
					} | null;
					if (!config?.assets) return;
					const own = config.assets.run_worker_first;
					if (own === true) return;
					config.assets.run_worker_first = [
						...new Set([...(own || []), `${base}${MARKLESS_BUILD_PREFIX}*`]),
					];
					await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
				});
				state.edgeBrotliDir = join(nitro.options.output.publicDir, MARKLESS_BUILD_PREFIX);
				return;
			}
			if (preset?.startsWith('vercel')) {
				if (configured) return;
				const base = nitro.options.baseURL ?? '/';
				nitro.options.vercel ??= {};
				nitro.options.vercel.config ??= {};
				nitro.options.vercel.config.routes = [
					...Object.entries(EDGE_CONTENT_TYPES).map(([extension, type]) => ({
						src: `^${escapeRegExp(`${base}${MARKLESS_BUILD_PREFIX}`)}(.+\\.${extension})$`,
						has: [
							{
								type: 'header' as const,
								key: 'accept-encoding',
								value: '.*\\bbr\\b.*',
							},
						],
						dest: `${base}${MARKLESS_BUILD_PREFIX}$1.br`,
						headers: {
							'content-encoding': 'br',
							'content-type': type,
							vary: 'Accept-Encoding',
							'cache-control': 'public, max-age=31536000, immutable',
						},
					})),
					...(nitro.options.vercel.config.routes ?? []),
				];
				state.edgeBrotliDir = join(nitro.options.output.publicDir, MARKLESS_BUILD_PREFIX);
				return;
			}
			if (!serveStatic || serveStatic === 'inline') return;
			if (!nitro.options.dev && nitro.options.buildDir && nitro.options.handlers) {
				const dir = join(nitro.options.buildDir, 'markless-router');
				const handler = join(dir, 'compress-rendered.mjs');
				await mkdir(dir, { recursive: true });
				await writeFile(handler, compressRenderedSource);
				nitro.options.handlers.push({ route: '/**', middleware: true, handler });
			}
			if (configured) return;
			nitro.options.compressPublicAssets = { gzip: true };
			state.brotliDir = nitro.options.output.publicDir;
		},
	};
}

const brotli = promisify(brotliCompress);
const exists = (file: string) =>
	access(file).then(
		() => true,
		() => false,
	);

// Nitro gzips every public file it judges compressible before it builds the server that lists them, so each .gz marks a file to give a .br.
export function brotliCopiesPlugin(state: CompressedAssetsState): Plugin {
	return {
		name: 'markless-router:brotli-copies',
		apply: 'build',
		applyToEnvironment: (environment) => environment.name === 'nitro',
		async buildStart() {
			if (state.brotliDir) {
				const dir = state.brotliDir;
				await writeBrotliCopies(
					(await readdir(dir, { recursive: true }))
						.filter((file) => file.endsWith('.gz'))
						.map((file) => join(dir, file.slice(0, -3))),
					PUBLIC_BROTLI_QUALITY,
				);
			}
			if (state.edgeBrotliDir) {
				const dir = state.edgeBrotliDir;
				const extensions = Object.keys(EDGE_CONTENT_TYPES);
				await writeBrotliCopies(
					(await readdir(dir, { recursive: true }).catch(() => []))
						.filter((file) =>
							extensions.includes(file.slice(file.lastIndexOf('.') + 1)),
						)
						.map((file) => join(dir, file)),
					EDGE_BROTLI_QUALITY,
				);
			}
		},
	};
}

async function writeBrotliCopies(files: string[], quality: number): Promise<void> {
	const next = async (): Promise<void> => {
		const file = files.pop();
		if (file === undefined) return;
		if (!(await exists(`${file}.br`))) {
			const source = await readFile(file).catch(() => undefined);
			if (source)
				await writeFile(
					`${file}.br`,
					await brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }),
				);
		}
		return next();
	};
	await Promise.all(Array.from({ length: availableParallelism() }, next));
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
