// Renders fences off the build's main thread and records every input the render read, for the disk cache.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { createFenceInputs, fenceKey, openFenceCache, recordRead } from './fence-cache.ts';

type Request = { readonly id: number; readonly code: string; readonly fenceLanguage: string };

const inputs = createFenceInputs();
const cacheDir = (workerData as { cacheDir: string | false }).cacheDir;
const cache = cacheDir === false ? undefined : openFenceCache(cacheDir);

const recordFile = (url: string | URL, source?: string | Uint8Array | null) => {
	const path = fileURLToPath(url);
	if (inputs.files.has(path)) return;
	try {
		recordRead(inputs, path, source ?? readFileSync(path));
	} catch {
		inputs.unrepeatable = true;
	}
};

recordFile(import.meta.url);
recordFile(new URL('./fence-cache.ts', import.meta.url));
registerHooks({
	load(url, context, nextLoad) {
		const loaded = nextLoad(url, context);
		if (url.startsWith('file:'))
			recordFile(
				url,
				typeof loaded.source === 'string' || loaded.source instanceof Uint8Array
					? loaded.source
					: undefined,
			);
		return loaded;
	},
});

let tooling: Promise<typeof import('./highlight-code.ts')> | undefined;

const loadTooling = () =>
	(tooling ??= (async () => {
		const quickInfo = await import('./twoslash-quickinfo.ts');
		quickInfo.recordQuickInfoInputs({
			read: (path, text) => recordRead(inputs, path, text),
			fileExists: (path, found) => inputs.isFile.set(path, found),
			directoryExists: (path, found) => inputs.isDirectory.set(path, found),
			realpath: (path, real) => inputs.realpaths.set(path, real),
			unrepeatable: () => {
				inputs.unrepeatable = true;
			},
		});
		const code = await import('./highlight-code.ts');
		recordFile(code.TSRX_GRAMMAR_URL);
		return code;
	})());

async function render({ code, fenceLanguage }: Request): Promise<string | null> {
	const key = fenceKey(code, fenceLanguage);
	const cached = cache?.lookup(key);
	if (cached !== undefined) return cached;
	const html = (await (await loadTooling()).renderFence(code, fenceLanguage)) ?? null;
	cache?.store(key, html, inputs);
	return html;
}

parentPort!.on('message', (request: Request) => {
	render(request).then(
		(html) => parentPort!.postMessage({ id: request.id, html }),
		(error: unknown) =>
			parentPort!.postMessage({
				id: request.id,
				error: error instanceof Error ? (error.stack ?? error.message) : String(error),
			}),
	);
});
