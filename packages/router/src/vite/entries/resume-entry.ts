import { createRouteDiscovery } from '@arcade/router/vite/runtime/create-route-discovery';
import { startRouteUpdateRenderer } from '../../route-renderer.ts';
import { __arcadeRouterStartSpaNavigation, ensureNavigationRuntime } from '../../spa-navigation.ts';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '../../route-manifest.ts';

const routeDiscovery = createRouteDiscovery(
	import.meta.glob(['/pages/**/*.tsrx', '/pages/**/*.mdx']),
);

export const pageModules = routeDiscovery.pageModuleLoaders;
export const routeFileIds = routeDiscovery.routeFileIds;
const routeManifest = buildRouteManifestFromFileIds(routeFileIds);

export async function resumeContainerEvent(input: {
	readonly root: ParentNode;
	readonly [key: string]: unknown;
}) {
	const file = routeFileFromRoot(input.root);
	const pageModule = file
		? ((await pageModules[file]?.()) as RouteResumeModule | undefined)
		: undefined;
	const resume = pageModule?.resumeContainerEvent;
	if (typeof resume !== 'function') {
		throw new Error(`Arcade Router could not resume route module: ${file ?? '<unknown>'}`);
	}
	await resume(input);
}

export async function navigateArcadeRouterLink(input: {
	readonly href: string;
	readonly replace?: boolean;
	readonly scroll?: 'manual';
}) {
	const runtimeWindow = window;
	const url = parseSameOriginUrl(input.href, runtimeWindow.location.href);
	const match = url && matchRouteManifest(url.pathname, routeManifest);
	if (!url || !match) {
		runtimeWindow.location.assign(input.href);
		return;
	}

	startRouteUpdateRenderer(runtimeWindow.document);
	await __arcadeRouterStartSpaNavigation({
		pageModuleLoaders: pageModules,
		routeFileIds,
		window: runtimeWindow,
	});
	const navigation = await ensureNavigationRuntime(runtimeWindow);
	navigation.navigate(url.href, {
		history: input.replace ? 'replace' : 'push',
		info: {
			__arcadeRouterLink: true,
			scroll: input.scroll,
		},
	});
}

interface RouteResumeModule {
	readonly resumeContainerEvent?: (input: unknown) => unknown;
}

function routeFileFromRoot(root: ParentNode): string | undefined {
	const script = root.querySelector?.('script[type="arcade/route"]');
	const text = script?.textContent;
	if (!text) {
		return undefined;
	}

	try {
		const route = JSON.parse(text) as { readonly file?: unknown };
		return typeof route.file === 'string' ? route.file : undefined;
	} catch {
		return undefined;
	}
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
