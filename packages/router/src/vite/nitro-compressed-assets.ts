import { availableParallelism } from 'node:os';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import { join } from 'pathe';
import type { Plugin } from 'vite';

type CompressedAssetsNitro = {
	options: {
		serveStatic?: boolean | string;
		output: { publicDir: string };
		compressPublicAssets?: boolean | { gzip?: boolean; brotli?: boolean; zstd?: boolean };
	};
};

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
		setup(nitro: CompressedAssetsNitro) {
			const { serveStatic } = nitro.options;
			if (configured || !serveStatic || serveStatic === 'inline') return;
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
