import { mdxResumeModules, tsrxResumeModules } from 'virtual:markless-router/dev-resume-modules';

const routeResumeModules = new Map<unknown, Promise<unknown>>();

export async function resumeContainerEvent(input: {
	readonly root: ParentNode;
	readonly [key: string]: unknown;
}) {
	const route = routeFromRoot(input.root);
	const file = route?.file;
	// The page this event belongs to: a navigation that keeps the container starts a new one while the route module loads.
	const life = (input.root as { readonly __mL?: object }).__mL;
	try {
		const routeResumeModule = route ? await loadRouteResumeModule(route) : undefined;
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

interface RouteScript {
	readonly file?: string;
	// The built chunk holding the route's resume module, and the export that evaluates it inside a shared pack.
	readonly resume?: readonly [url: string, loader?: string];
}

function loadRouteResumeModule(route: RouteScript): Promise<unknown> | undefined {
	const [url, loader] = route.resume ?? [];
	const key = url ?? (route.file && devResumeModuleLoader(route.file));
	if (!key) return undefined;
	let pending = routeResumeModules.get(key);
	if (!pending) {
		pending = (
			typeof key === 'string'
				? import(/* @vite-ignore */ key).then((module: Record<string, () => unknown>) =>
						loader ? module[loader]!() : module,
					)
				: key()
		).catch((error: unknown) => {
			routeResumeModules.delete(key);
			throw error;
		});
		routeResumeModules.set(key, pending);
	}
	return pending;
}

function devResumeModuleLoader(file: string): (() => Promise<unknown>) | undefined {
	const loaders = file.endsWith('.mdx') ? mdxResumeModules : tsrxResumeModules;
	return loaders?.[file] ?? loaders?.[`/${file}`];
}

function routeFromRoot(root: ParentNode): RouteScript | undefined {
	const script = root.querySelector?.('script[type="@markless/core/route"]');
	const text = script?.textContent;
	if (!text) {
		return undefined;
	}

	try {
		const route = JSON.parse(text) as RouteScript;
		return typeof route.file === 'string' ? route : undefined;
	} catch {
		return undefined;
	}
}
