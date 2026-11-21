import { describe, expect, it } from 'vitest';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

// A URL from the root that a page's JavaScript fetches reaches the app's site (app.json `origin`), as the web's reaches
// the page's origin; without an origin the phone says what it needs.

const build = (url: string, origin?: string) =>
	compileNativeComponent({
		filename: 'app/App.tsrx',
		source: `import { state } from '@markless/core';
export default function App() @{
	let text = state('');
	<button onClick={() => { void fetch(${JSON.stringify(url)}).catch((error) => { text = String(error.message); }); }}>{text}</button>
}
`,
		...(origin === undefined ? {} : { origin }),
	});
const sent = async (url: string, origin?: string) => {
	const { payload, diagnostics } = await build(url, origin);
	expect(diagnostics).toEqual([]);
	const runtime = createNativeRuntime(
		payload!,
		new Map(),
		{},
		undefined,
		undefined,
		nodeScriptHost(),
	);
	return runtime.dispatch({ event: 'activate', host: payload!.events[0]!.host });
};

describe('a URL from the root fetched on a phone', () => {
	it('reaches the app origin, path and query kept', async () => {
		expect(await sent('/api/products?category=tools', 'https://shop.example')).toContainEqual(
			expect.objectContaining({
				op: 'fetch',
				request: expect.objectContaining({
					url: 'https://shop.example/api/products?category=tools',
					method: 'GET',
				}),
			}),
		);
	});

	it('takes the scheme of the origin for a URL that names its own host', async () => {
		expect(await sent('//cdn.example/a.json', 'https://shop.example')).toContainEqual(
			expect.objectContaining({
				request: expect.objectContaining({ url: 'https://cdn.example/a.json' }),
			}),
		);
	});

	it('leaves an absolute URL as written', async () => {
		expect(await sent('http://127.0.0.1:28761/x', 'https://shop.example')).toContainEqual(
			expect.objectContaining({
				request: expect.objectContaining({ url: 'http://127.0.0.1:28761/x' }),
			}),
		);
	});

	it('says what it needs when the app names no origin', async () => {
		expect(await sent('/api/products')).toContainEqual(
			expect.objectContaining({
				op: 'text',
				value: `Failed to parse URL from /api/products: a phone resolves a URL from the root ('/…') only against the app's origin (app.json "origin")`,
			}),
		);
	});

	it('refuses an origin that is not one', async () => {
		await expect(build('/x', 'https://shop.example/')).rejects.toThrow(
			'app.json "origin" is "https://shop.example/"; write the site\'s origin',
		);
	});
});
