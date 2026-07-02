const pageModuleLoaders = import.meta.glob(['/pages/**/*.tsrx', '/pages/**/*.mdx']);

export async function resumeContainerEvent(input: {
	readonly root: ParentNode;
	readonly [key: string]: unknown;
}) {
	const file = routeFileFromRoot(input.root);
	const loadPageModule = file && (pageModuleLoaders[file] ?? pageModuleLoaders[`/${file}`]);
	const pageModule = loadPageModule ? await loadPageModule() : undefined;
	const resume = (pageModule as RouteResumeModule | undefined)?.resumeContainerEvent;
	if (typeof resume !== 'function') {
		throw new Error(`Markless Router could not resume route module: ${file ?? '<unknown>'}`);
	}
	await resume(input);
}

interface RouteResumeModule {
	readonly resumeContainerEvent?: (input: unknown) => unknown;
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
