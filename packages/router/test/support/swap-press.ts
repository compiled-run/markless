import type { Page, Route } from '@playwright/test';
import { readClientAssetsManifest } from '../../src/vite/client-assets-manifest.ts';
import { fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';

// Records the page's requests for files only the swap's lazy modules use, and holds page fragments unanswered on demand.
export async function watchSwapModules(page: Page, clientOutDir: string) {
	const manifest = await readClientAssetsManifest(clientOutDir, '/');
	const [shared, kept] = manifest.entries.fragmentSwapModules ?? [[], []];
	const swap = new Set([...shared, ...kept]);
	const pageCode = new Set([
		...Object.values(manifest.routes.navigation).flat(),
		...Object.values(manifest.routes.ssr).flat(),
	]);
	const requested: string[] = [];
	page.on('request', (request) => {
		const path = new URL(request.url()).pathname;
		if (swap.has(path) && !pageCode.has(path)) requested.push(path);
	});
	const held: Route[] = [];
	const fragment = (url: URL) => fragmentPageUrl(url) !== undefined;
	return {
		shared,
		kept,
		swap,
		requested: () => [...requested],
		// The swap modules the page shown already has, which a press finds there.
		present: () =>
			page.evaluate(
				(swap) =>
					[...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')]
						.map((link) => new URL(link.href).pathname)
						.filter((path) => swap.includes(path)),
				[...swap],
			),
		held: () => held.length,
		hold: () => page.route(fragment, (route) => void held.push(route)),
		release: async () => {
			// A fetch the page itself aborted is already settled.
			for (const route of held.splice(0)) await route.continue().catch(() => {});
			await page.unroute(fragment);
			await page.waitForLoadState('networkidle');
		},
	};
}
