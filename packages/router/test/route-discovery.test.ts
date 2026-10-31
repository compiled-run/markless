import { expect, test } from 'vitest';
import { createRouteDiscovery } from '../src/vite/runtime/create-route-discovery.ts';

test('a page module whose default export is a promise loads as its settled artifact', async () => {
	const artifact = { renderData: { title: 'home' }, loadSymbol: () => undefined };
	const { pageModuleLoaders } = createRouteDiscovery({
		'/pages/index.tsrx': async () => ({ default: Promise.resolve(artifact) }),
	});
	const page = (await pageModuleLoaders['pages/index.tsrx']!()) as { default: unknown };
	expect(page.default).toBe(artifact);
});

test('a page module with a plain default export loads as the module itself', async () => {
	const module = { default: { renderData: {} } };
	const { pageModuleLoaders } = createRouteDiscovery({ '/pages/about.mdx': async () => module });
	expect(await pageModuleLoaders['pages/about.mdx']!()).toBe(module);
});
