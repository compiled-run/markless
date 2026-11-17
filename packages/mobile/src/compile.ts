import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	buildSemanticGraph,
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
	type SemanticGraphArtifact,
	type CompilerDiagnostic,
	type NativeViewArtifact,
} from '@markless/compiler';
import {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	type RouteManifest,
} from '@markless/router';
import type { NativeAppPayload, NativeViewPayload } from '@markless/serializer';
import { NATIVE_APP_VERSION } from '@markless/serializer/native-view';

export type NativeBuild = {
	readonly payload: NativeViewPayload | null;
	/** The component's scoped CSS as the compiler compiled it for web; Dragon compiles the same text for each platform. */
	readonly styles: ReadonlyArray<{ readonly scopeId: string; readonly cssText: string }>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

/** Compiles one `.tsrx` module through the real compiler, then lowers its analysis to the native view payload. */
export async function compileNativeComponent(input: {
	readonly filename: string;
	readonly source: string;
	/** The module's page file when it is a page (`pages/[fruit].tsrx`); the router derives its route. */
	readonly page?: string;
	/**
	 * Reads a module this one imports (`./Stepper.tsrx`), so its components can be built in place; the caller owns file
	 * access. Without it, an imported component is refused.
	 */
	readonly readModule?: (
		specifier: string,
		importer: string,
	) => { readonly filename: string; readonly source: string } | undefined;
	/** In an app build: every page's route, so links and `navigate()` are checked and resolved against them. */
	readonly manifest?: RouteManifest;
}): Promise<NativeBuild> {
	const manifest =
		input.manifest ?? (input.page ? buildRouteManifestFromFileIds([input.page]) : undefined);
	const route = input.page
		? manifest?.routes.find((candidate) => candidate.file === input.page)
		: undefined;
	if (input.page && !route) throw new Error(`${input.page} is not a page the router routes`);
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		symbols: [],
		nativeFacts: NATIVE_FACT_COLLECTORS,
	});
	const importedModules: Record<string, SemanticGraphArtifact> = {};
	for (const entry of compiled.semanticGraph.moduleImports) {
		if (entry.typeOnly || !entry.source.startsWith('.') || importedModules[entry.source])
			continue;
		const module = input.readModule?.(entry.source, input.filename);
		if (module)
			importedModules[entry.source] = await buildSemanticGraph({
				...module,
				nativeFacts: NATIVE_FACT_COLLECTORS,
			});
	}
	const native: NativeViewArtifact = createNativeViewPayload(compiled.semanticGraph, {
		...(route
			? { route: { pattern: route.pattern, params: route.params.map((param) => param.name) } }
			: {}),
		importedModules,
		...(input.manifest
			? {
					routes: input.manifest.routes.map((entry) => ({
						pattern: entry.pattern,
						params: entry.params.map((param) => param.name),
					})),
					resolvePath: (path: string) => {
						const matched = matchRouteManifest(path, input.manifest!);
						return matched
							? { pattern: matched.route.pattern, params: { ...matched.params } }
							: undefined;
					},
				}
			: {}),
	});
	const errors = collectTsrxModuleDiagnostics(compiled).filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
	return {
		payload: errors.length > 0 ? null : native.payload,
		styles: compiled.publicRenderPlan.styleScopes,
		diagnostics: [...errors, ...native.diagnostics],
	};
}

export type NativeAppBuild = {
	readonly payload: NativeAppPayload | null;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic & { readonly page: string }>;
};

/**
 * Compiles every page of an app (`pages/index.tsrx`, `pages/orders/[id].tsrx`...) into one payload: the router's own
 * manifest gives each page's route and the match order, and each page's links are checked against it.
 */
export async function compileNativeApp(input: {
	readonly pages: ReadonlyArray<{
		readonly page: string;
		readonly filename: string;
		readonly source: string;
	}>;
	readonly readModule?: Parameters<typeof compileNativeComponent>[0]['readModule'];
}): Promise<NativeAppBuild> {
	const manifest = buildRouteManifestFromFileIds(input.pages.map((page) => page.page));
	const routes: NativeAppPayload['routes'][number][] = [];
	const diagnostics: (CompilerDiagnostic & { readonly page: string })[] = [];
	for (const route of manifest.routes) {
		const page = input.pages.find((candidate) => candidate.page === route.file)!;
		const build = await compileNativeComponent({
			...page,
			manifest,
			...(input.readModule ? { readModule: input.readModule } : {}),
		});
		if (build.styles.some((style) => style.cssText.length > 0))
			diagnostics.push({
				code: 'MARKLESS_NATIVE_UNSUPPORTED',
				severity: 'error',
				phase: 'serialization',
				title: 'This component cannot be built for a native target yet',
				message:
					'styles in an app of several pages (one Dragon style export covers one component today)',
				why: 'Native hosts take styles from a Dragon export made per component; an app build has no per-page export yet.',
				passId: 'native-view',
				suggestions: [],
				docsUrl: 'https://markless.dev/errors/MARKLESS_NATIVE_UNSUPPORTED',
				page: page.page,
			});
		diagnostics.push(
			...build.diagnostics.map((diagnostic) => ({ ...diagnostic, page: page.page })),
		);
		if (build.payload)
			routes.push({
				pattern: route.pattern,
				params: route.params.map((param) => param.name),
				page: build.payload,
			});
	}
	return {
		payload: diagnostics.length > 0 ? null : { version: NATIVE_APP_VERSION, routes },
		diagnostics,
	};
}
