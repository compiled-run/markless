import { createRouteDiscovery } from '@arcade/router/vite/runtime/create-route-discovery';
import { startRouteUpdateRenderer } from '../../route-renderer.ts';
import { __arcadeRouterStartSpaNavigation } from '../../spa-navigation.ts';

const routeDiscovery = createRouteDiscovery(
	import.meta.glob(['/pages/**/*.tsrx', '/pages/**/*.mdx']),
);

export const pageModules = routeDiscovery.pageModuleLoaders;
export const routeFileIds = routeDiscovery.routeFileIds;

void __arcadeRouterStartSpaNavigation({
	pageModuleLoaders: pageModules,
	routeFileIds,
});
startRouteUpdateRenderer(document);

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
