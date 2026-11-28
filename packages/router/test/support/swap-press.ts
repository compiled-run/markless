import type { Page, Route } from '@playwright/test';
import { readClientAssetsManifest } from '../../src/vite/client-assets-manifest.ts';
import { fragmentPageUrl } from '../../src/vite/fragment-navigation.ts';

// Opens `path` with every page fragment held unanswered and records requests for the build's swap modules.
export async function openHoldingPages(page: Page, clientOutDir: string, url: string) {
	const manifest = await readClientAssetsManifest(clientOutDir, '/');
	const [shared, kept] = manifest.entries.fragmentSwapModules ?? [[], []];
	const swap = new Set([...shared, ...kept]);
	const requested: string[] = [];
	page.on('request', (request) => {
		const path = new URL(request.url()).pathname;
		if (swap.has(path)) requested.push(path);
	});
	const held: Route[] = [];
	const fragment = (url: URL) => fragmentPageUrl(url) !== undefined;
	await page.route(fragment, (route) => void held.push(route));
	await page.goto(url);
	const landed = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map(
			(link) => new URL(link.href).pathname,
		),
	);
	const before = requested.length;
	return {
		shared,
		kept,
		// The swap modules a press finds already there: the page landed with them.
		landed: landed.filter((path) => swap.has(path)),
		requested: () => requested.slice(before),
		held: () => held.length,
		press: async (link: string) => {
			await page.focus(link);
			// The run half preloads a press's code in the task it takes the press in.
			await page.waitForFunction(() => '__marklessFragmentNav' in document);
		},
		release: async () => {
			// A fetch the page itself aborted is already settled.
			for (const route of held.splice(0)) await route.continue().catch(() => {});
			await page.unroute(fragment);
			await page.waitForLoadState('networkidle');
		},
	};
}
