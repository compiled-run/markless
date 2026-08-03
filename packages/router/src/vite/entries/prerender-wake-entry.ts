const mdxPageModuleLoaders = import.meta.glob('/pages/**/*.mdx');
const tsrxPrerenderWakeModuleLoaders = import.meta.glob('/pages/**/*.tsrx', {
	query: '?markless-prerender-wake',
});

export async function resumeContainerEvent(input: {
	readonly root: ParentNode;
	readonly [key: string]: unknown;
}) {
	const file = routeFileFromRoot(input.root);
	const loadRouteWakeModule = file && routeWakeModuleLoader(file);
	const routeWakeModule = loadRouteWakeModule ? await loadRouteWakeModule() : undefined;
	const resume = (routeWakeModule as RouteWakeModule | undefined)?.resumeContainerEvent;
	if (typeof resume !== 'function') {
		throw new Error(`Markless Router could not wake prerendered route module: ${file ?? '<unknown>'}`);
	}
	await resume(input);
}

interface RouteWakeModule {
	readonly resumeContainerEvent?: (input: unknown) => unknown;
}

function routeWakeModuleLoader(file: string): (() => Promise<unknown>) | undefined {
	const loaders = file.endsWith('.mdx') ? mdxPageModuleLoaders : tsrxPrerenderWakeModuleLoaders;
	return loaders[file] ?? loaders[`/${file}`];
}

function routeFileFromRoot(root: ParentNode): string | undefined {
	const script = root.querySelector?.('script[type="@markless/core/route"]');
	const text = script?.textContent;
	if (!text) return undefined;

	try {
		const route = JSON.parse(text) as { readonly file?: unknown };
		return typeof route.file === 'string' ? route.file : undefined;
	} catch {
		return undefined;
	}
}
