import { createRouteDiscovery } from '@arcade/router/vite/runtime/create-route-discovery';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '../../route-manifest.ts';
import { startRouteUpdateRenderer } from '../../route-renderer.ts';
import { __arcadeRouterStartSpaNavigation, ensureNavigationRuntime } from '../../spa-navigation.ts';
import { preloadRouteModule } from 'virtual:arcade-router/route-preloads';

const routeDiscovery = createRouteDiscovery(
	import.meta.glob(['/pages/**/*.tsrx', '/pages/**/*.mdx']),
);

export const pageModules = routeDiscovery.pageModuleLoaders;
export const routeFileIds = routeDiscovery.routeFileIds;
const routeManifest = buildRouteManifestFromFileIds(routeFileIds);

void __arcadeRouterStartSpaNavigation({
	pageModuleLoaders: pageModules,
	preloadRouteModule,
	routeFileIds,
});
startRouteUpdateRenderer(document);

export async function navigateArcadeRouterLink(input: {
	readonly href: string;
	readonly replace?: boolean;
	readonly scroll?: 'manual';
}) {
	const url = parseSameOriginUrl(input.href, window.location.href);
	const match = url && matchRouteManifest(url.pathname, routeManifest);
	if (!url || !match) {
		window.location.assign(input.href);
		return;
	}

	startRouteUpdateRenderer(document);
	preloadRouteModule(match.route.file);
	await __arcadeRouterStartSpaNavigation({
		pageModuleLoaders: pageModules,
		preloadRouteModule,
		routeFileIds,
		window,
	});
	const navigation = await ensureNavigationRuntime(window);
	navigation.navigate(url.href, {
		history: input.replace ? 'replace' : 'push',
		info: {
			__arcadeRouterLink: true,
			scroll: input.scroll,
		},
	});
}

function parseSameOriginUrl(href: string, base: string): URL | undefined {
	try {
		const current = new URL(base);
		const url = new URL(href, current);
		return url.origin === current.origin ? url : undefined;
	} catch {
		return undefined;
	}
}
