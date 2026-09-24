// Builds a fixture through its own config into another directory; SSR fixtures render to index.html.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { createBuilder, preview, type InlineConfig } from 'vite';

const [name, outDir, portFlag] = process.argv.slice(2);
if (!name || !outDir || !portFlag) throw new Error('usage: <fixture> <outDir> <port>');
const fixture = resolve(import.meta.dirname, '../../fixtures', name);
const prerender = name === 'vite-prerender-multi-child';

const config: InlineConfig = {
	configFile: resolve(fixture, 'vite.config.ts'),
	root: fixture,
	logLevel: 'error',
	build: { outDir, emptyOutDir: true },
	environments: {
		ssr: { build: { outDir: resolve(outDir, 'server') } },
		...(name === 'vite-ssr'
			? { ssrRender: { build: { outDir: resolve(outDir, 'server-render') } } }
			: {}),
	},
};

const builder = await createBuilder(config);
await builder.buildApp();

if (!prerender) {
	const port = Number(portFlag);
	const server = await preview({
		...config,
		preview: { host: '127.0.0.1', port, strictPort: true },
	});
	try {
		const response = await fetch(`http://127.0.0.1:${port}/`, {
			headers: { accept: 'text/html' },
		});
		if (!response.ok) throw new Error(`SSR render failed with ${response.status}`);
		await writeFile(resolve(outDir, 'index.html'), await response.text());
	} finally {
		await new Promise<void>((done, fail) =>
			server.httpServer.close((error) => (error ? fail(error) : done())),
		);
	}
}
