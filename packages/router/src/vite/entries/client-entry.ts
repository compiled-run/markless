import { createRouteDiscovery } from '@arcade/router/vite/runtime/create-route-discovery';
import { render } from '@arcade/web/render';
import { ARCADE_ROUTER_ROUTE_EVENT, routePageProps, type RouteUpdate } from '../../route-state.ts';
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

document.addEventListener(ARCADE_ROUTER_ROUTE_EVENT, (event) => {
	void renderRouteUpdate((event as CustomEvent<RouteUpdate>).detail);
});

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

interface ClientPageArtifact {
	readonly renderCsr?: (props?: unknown) => unknown;
	readonly renderSsr?: (props?: unknown) => { readonly html: string };
}

async function renderRouteUpdate(update: RouteUpdate) {
	const artifact = update.page.default as ClientPageArtifact | undefined;
	if (!artifact) {
		return;
	}

	const props = routePageProps(update.route);
	if (typeof artifact.renderCsr === 'function') {
		await render({ renderCsr: () => artifact.renderCsr?.(props) } as never, {
			target: document.body,
		});
		return;
	}

	if (typeof artifact.renderSsr === 'function') {
		document.body.innerHTML = artifact.renderSsr(props).html;
	}
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
