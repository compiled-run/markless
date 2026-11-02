import { rolldown, type Plugin } from 'rolldown';
import { expect, test } from 'vitest';
import { nativePackingPlugins } from '../src/build/native-packing.ts';

// Rolldown 1.2 reports a late renderChunk failure on its own below about 30 chunks; a real site renders thousands.
const pages = Array.from({ length: 48 }, (_, index) => `page${index}`);
const sources: Record<string, string> = {
	'/app/shared.js': `export const shared = (name) => name.toUpperCase();`,
	'/app/later.js': `export const later = 'later';`,
	...Object.fromEntries(
		pages.map((page, index) => [
			`/app/${page}.js`,
			index % 2
				? `import { shared } from './shared.js'; export const ${page} = () => shared('${page}');`
				: `export const ${page} = () => import('./later.js');`,
		]),
	),
};

// Like Vite's CSS minify failing one chunk: the error lands after every other chunk has gone on to later plugins.
function failsOneChunkLate(name: string): Plugin {
	let passed = 0;
	let othersPassed!: () => void;
	const others = new Promise<void>((resolve) => (othersPassed = resolve));
	return {
		name: 'fails-one-chunk-late',
		async renderChunk(_code, chunk, _options, meta) {
			if (chunk.name !== name) {
				if (++passed === Object.keys(meta.chunks).length - 1) othersPassed();
				return null;
			}
			await others;
			await new Promise((resolve) => setTimeout(resolve, 50));
			throw new Error(`${name} cannot render`);
		},
	};
}

test('a chunk another plugin fails to render fails the packed build instead of holding it open', async () => {
	const build = await rolldown({
		input: Object.fromEntries(pages.map((page) => [page, `/app/${page}.js`])),
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => {
					const resolved = id.startsWith('./') ? `/app/${id.slice(2)}` : id;
					return resolved in sources ? resolved : null;
				},
				load: (id) => sources[id],
			},
			failsOneChunkLate('page7'),
			...nativePackingPlugins(() => '/app'),
		],
	});
	try {
		await expect(build.generate({ format: 'es' })).rejects.toThrow('page7 cannot render');
	} finally {
		await build.close();
	}
}, 15_000);
