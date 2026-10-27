import { availableParallelism } from 'node:os';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import { join } from 'pathe';
import type { Plugin } from 'vite';

type CompressedAssetsNitro = {
	options: {
		preset?: string;
		dev?: boolean;
		buildDir?: string;
		handlers?: Array<{ route: string; middleware: boolean; handler: string }>;
		serveStatic?: boolean | string;
		output: { publicDir: string };
		compressPublicAssets?: boolean | { gzip?: boolean; brotli?: boolean; zstd?: boolean };
	};
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

export interface CompressedAssetsState {
	brotliDir: string | undefined;
}

export function compressedAssetsState(): CompressedAssetsState {
	return { brotliDir: undefined };
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
			if (preset === 'nitro-prerender' || !serveStatic || serveStatic === 'inline') return;
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
			const dir = state.brotliDir;
			if (!dir) return;
			const pending = (await readdir(dir, { recursive: true }))
				.filter((file) => file.endsWith('.gz'))
				.map((file) => join(dir, file.slice(0, -3)));
			const next = async (): Promise<void> => {
				const file = pending.pop();
				if (file === undefined) return;
				if (!(await exists(`${file}.br`))) {
					const source = await readFile(file).catch(() => undefined);
					if (source)
						await writeFile(
							`${file}.br`,
							await brotli(source, {
								params: { [constants.BROTLI_PARAM_QUALITY]: PUBLIC_BROTLI_QUALITY },
							}),
						);
				}
				return next();
			};
			await Promise.all(Array.from({ length: availableParallelism() }, next));
		},
	};
}
