const mdxPageModuleLoaders = import.meta.glob('/pages/**/*.mdx', {
	query: '?markless-resume',
});
const tsrxResumeModuleLoaders = import.meta.glob('/pages/**/*.tsrx', {
	query: '?markless-resume',
});
const routeResumeModules = new WeakMap<() => Promise<unknown>, Promise<unknown>>();

export async function resumeContainerEvent(input: {
	readonly root: ParentNode;
	readonly [key: string]: unknown;
}) {
	const file = routeFileFromRoot(input.root);
	// The page this event belongs to: a navigation that keeps the container starts a new one while the route module loads.
	const life = (input.root as { readonly __mL?: object }).__mL;
	try {
		const loadRouteResumeModule = file && routeResumeModuleLoader(file);
		const routeResumeModule = loadRouteResumeModule
			? await loadRouteModuleOnce(loadRouteResumeModule)
			: undefined;
		if ((input.root as { readonly __mL?: object }).__mL !== life) return;
		const resume = (routeResumeModule as RouteResumeModule | undefined)?.resumeContainerEvent;
		if (typeof resume !== 'function') {
			throw new Error(
				`Markless Router could not resume route module: ${file ?? '<unknown>'}`,
			);
		}
		await resume(input);
	} catch (error) {
		const failure = `${error}`;
		// A gesture needing a chunk a deploy removed reloads once; the failure names the chunk's hashed URL.
		if (
			import.meta.env.DEV ||
			!input.event ||
			!/imported module|script failed/.test(failure) ||
			sessionStorage.mlChunkReload === failure
		) {
			throw error;
		}
		sessionStorage.mlChunkReload = failure;
		location.reload();
	}
}

interface RouteResumeModule {
	readonly resumeContainerEvent?: (input: unknown) => unknown;
}

function loadRouteModuleOnce(load: () => Promise<unknown>): Promise<unknown> {
	let pending = routeResumeModules.get(load);
	if (!pending) {
		pending = load().catch((error: unknown) => {
			routeResumeModules.delete(load);
			throw error;
		});
		routeResumeModules.set(load, pending);
	}
	return pending;
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
