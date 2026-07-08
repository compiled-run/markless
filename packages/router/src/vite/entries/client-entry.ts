// Package specifiers only: this file ships as source in the tarball and is
// compiled in the CONSUMER app's module graph (so import.meta.glob resolves
// against the app root) — relative paths into src/ would escape the package.
import { createRouteDiscovery } from '@markless/router/vite/runtime/create-route-discovery';
import {
	__marklessRouterStartSpaNavigation,
	buildRouteManifestFromFileIds,
	ensureNavigationRuntime,
	matchRouteManifest,
	startRouteUpdateRenderer,
} from '@markless/router';
import { preloadRouteModule } from 'virtual:markless-router/route-preloads';

const routeDiscovery = createRouteDiscovery(
	import.meta.glob(['/pages/**/*.tsrx', '/pages/**/*.mdx']),
);

export const pageModules = routeDiscovery.pageModuleLoaders;
export const routeFileIds = routeDiscovery.routeFileIds;
const routeManifest = buildRouteManifestFromFileIds(routeFileIds);

void __marklessRouterStartSpaNavigation({
	pageModuleLoaders: pageModules,
	preloadRouteModule,
	routeFileIds,
});
startRouteUpdateRenderer(document);

export async function navigateMarklessRouterLink(input: {
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
	await __marklessRouterStartSpaNavigation({
		pageModuleLoaders: pageModules,
		preloadRouteModule,
		routeFileIds,
		window,
	});
	const navigation = await ensureNavigationRuntime(window);
	navigation.navigate(url.href, {
		history: input.replace ? 'replace' : 'push',
		info: {
			__marklessRouterLink: true,
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
