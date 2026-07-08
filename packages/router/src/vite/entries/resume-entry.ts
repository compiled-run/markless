const mdxPageModuleLoaders = import.meta.glob('/pages/**/*.mdx');
const tsrxResumeModuleLoaders = import.meta.glob('/pages/**/*.tsrx', {
	query: '?markless-resume',
});

export async function resumeContainerEvent(input: {
	readonly root: ParentNode;
	readonly [key: string]: unknown;
}) {
	const file = routeFileFromRoot(input.root);
	const loadRouteResumeModule = file && routeResumeModuleLoader(file);
	const routeResumeModule = loadRouteResumeModule ? await loadRouteResumeModule() : undefined;
	const resume = (routeResumeModule as RouteResumeModule | undefined)?.resumeContainerEvent;
	if (typeof resume !== 'function') {
		throw new Error(`Markless Router could not resume route module: ${file ?? '<unknown>'}`);
	}
	await resume(input);
}

interface RouteResumeModule {
	readonly resumeContainerEvent?: (input: unknown) => unknown;
}

function routeResumeModuleLoader(file: string): (() => Promise<unknown>) | undefined {
	const loaders = file.endsWith('.mdx') ? mdxPageModuleLoaders : tsrxResumeModuleLoaders;
	return loaders[file] ?? loaders[`/${file}`];
}

function routeFileFromRoot(root: ParentNode): string | undefined {
	const script = root.querySelector?.('script[type="@markless/core/route"]');
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
