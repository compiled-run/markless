import { mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [entry, packageManifest] = process.argv.slice(2);
if (!entry) throw new Error('Pass the production Vite SSR entry to rebundle.');
const require = createRequire(
	packageManifest ? resolve(packageManifest) : import.meta.resolve('vite-plus/package.json'),
);
const engine = require.resolve(
	require('./package.json').dependencies['@voidzero-dev/vite-plus-core']
		? '@voidzero-dev/vite-plus-core/rolldown'
		: 'vite/rolldown',
);
const { rolldown, VERSION } = await import(engine);
const directory = await mkdtemp('/private/tmp/markless-ssr-rebundle-');
await writeFile(
	directory + '/entry.mjs',
	`export const load = () => import(${JSON.stringify(resolve(entry))});`,
);
const bundle = await rolldown({
	input: directory + '/entry.mjs',
	external: ['nitro'],
	preserveEntrySignatures: 'allow-extension',
});
const result = { engine, version: VERSION, entry: resolve(entry), directory, loaded: false };
try {
	await bundle.write({
		dir: directory + '/output',
		format: 'esm',
		entryFileNames: '[name].mjs',
		minify: 'dce-only',
		topLevelVar: true,
	});
	await (await import(pathToFileURL(directory + '/output/entry.mjs'))).load();
	result.loaded = true;
} catch (error) {
	result.failure = String(error);
	process.exitCode = 1;
} finally {
	await bundle.close();
	await writeFile(directory + '/results.json', JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result));
}
