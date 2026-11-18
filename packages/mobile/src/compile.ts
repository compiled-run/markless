import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	buildSemanticGraph,
	type SemanticGraphArtifact,
	type CompilerDiagnostic,
	type ModuleGraphInterfaceArtifact,
} from '@markless/compiler';
import {
	createNativeViewPayload,
	DEVICE_TARGET_FACTS,
	NATIVE_FACT_COLLECTORS,
	type NativeViewArtifact,
} from '@markless/compiler/native';
import {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	type RouteManifest,
} from '@markless/router';
import type { NativeAppPayload, NativeViewPayload } from '@markless/serializer';
import { NATIVE_APP_VERSION } from '@markless/serializer/native-view';
import { nativeStyleInputs, type NativeStyleInput } from './style-input.ts';
import type { NativeDeviceFeature } from '@markless/serializer/native-device';
import { deviceManifest, type DeviceAppConfig, type DeviceManifest } from './permissions.ts';

export type NativeBuild = {
	readonly payload: NativeViewPayload | null;
	/**
	 * The scoped CSS as the compiler compiled it for web, of every component the payload shows: the components it imports
	 * first, then its own. Dragon compiles the same text for each platform.
	 */
	readonly styles: ReadonlyArray<{ readonly scopeId: string; readonly cssText: string }>;
	/** Stylesheets imported for their effect (`import './app.css'`) by the module or a module it imports, in import order. */
	readonly stylesheets: ReadonlyArray<NativeStylesheet>;
	/** The device features the payload uses, and the manifest entries they need. */
	readonly features: ReadonlyArray<NativeDeviceFeature>;
	readonly manifest: DeviceManifest;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
	/** Each payload element's tag and where it is written, by node id, for build errors that name an element. */
	readonly elementSources: NativeViewArtifact['elementSources'];
};

/** A stylesheet's text as the web build ships it, unscoped: its rules reach every page that imports it. */
export type NativeStylesheet = { readonly file: string; readonly cssText: string };

/** Reads a stylesheet a module imports for its effect (`./app.css`); the caller owns file access. */
export type ReadStylesheet = (specifier: string, importer: string) => NativeStylesheet | undefined;

const stylesheetsOf = (
	requests: ReadonlyArray<string>,
	importer: string,
	read: ReadStylesheet | undefined,
): NativeStylesheet[] =>
	requests.map((request) => {
		const sheet = read?.(request, importer);
		if (!sheet)
			throw new Error(
				`${importer} imports the stylesheet ${request}, which could not be read`,
			);
		return sheet;
	});

type ReadModule = (
	specifier: string,
	importer: string,
) => { readonly filename: string; readonly source: string } | undefined;

/** A JSON file imports as a module whose default export is its value, as the web build loads it. */
const withJsonModules =
	(read: ReadModule | undefined): ReadModule | undefined =>
	read &&
	((specifier, importer) => {
		const module = read(specifier, importer);
		if (!module?.filename.endsWith('.json')) return module;
		try {
			JSON.parse(module.source);
		} catch {
			return undefined;
		}
		return { filename: module.filename, source: `const json = ${module.source};\nexport default json;\n` };
	});

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
	readonly readStylesheet?: ReadStylesheet;
	/** The app config's `device` section (usage text per feature). */
	readonly device?: DeviceAppConfig;
	/** The phone this payload is for; without one it serves both, and a read of `platform` is refused. */
	readonly target?: 'ios' | 'android';
	/** Where handlers run (`NativeViewOptions['scriptHandlers']`); the default runs each as data where it lowers. */
	readonly scriptHandlers?: 'fallback' | 'all' | 'never';
}): Promise<NativeBuild> {
	const manifest =
		input.manifest ?? (input.page ? buildRouteManifestFromFileIds([input.page]) : undefined);
	const route = input.page
		? manifest?.routes.find((candidate) => candidate.file === input.page)
		: undefined;
	if (input.page && !route) throw new Error(`${input.page} is not a page the router routes`);
	const readModule = withJsonModules(input.readModule);
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		symbols: [],
		nativeFacts: NATIVE_FACT_COLLECTORS,
		target: input.target ?? 'native',
		deviceTargetFacts: DEVICE_TARGET_FACTS,
	});
	const importedStyles: NativeBuild['styles'][number][] = [];
	const stylesheets = stylesheetsOf(
		compiled.publicRenderPlan.stylesheetImports,
		input.filename,
		input.readStylesheet,
	);
	for (const entry of compiled.semanticGraph.moduleImports) {
		if (entry.typeOnly || !entry.source.startsWith('.')) continue;
		const module = readModule?.(entry.source, input.filename);
		if (!module) continue;
		const plan = (await compileTsrxModule({ ...module, symbols: [] })).publicRenderPlan;
		importedStyles.push(...plan.styleScopes);
		stylesheets.push(
			...stylesheetsOf(plan.stylesheetImports, module.filename, input.readStylesheet),
		);
	}
	const targetFacts = {
		nativeFacts: NATIVE_FACT_COLLECTORS,
		target: input.target ?? ('native' as const),
		deviceTargetFacts: DEVICE_TARGET_FACTS,
	};
	// The pass names each module it needs and has no analysis of; analyze those and build again until none is missing.
	const graphs = new Map<string, SemanticGraphArtifact>([
		[input.filename, compiled.semanticGraph],
	]);
	const read = new Map<string, { readonly filename: string; readonly source: string }>();
	const resolve = (specifier: string, importer: string): string | undefined => {
		const module = readModule?.(specifier, importer);
		if (module) read.set(module.filename, module);
		return module?.filename;
	};
	// A module is analyzed with the interfaces of the modules it imports, as the web build links them, so a shared()
	// definition from another file (`toolbarState()` in toggle) resolves to the same definition there.
	const interfaces = new Map<string, SemanticGraphArtifact>();
	const analyze = async (file: string, visiting: Set<string>): Promise<SemanticGraphArtifact> => {
		const known = interfaces.get(file) ?? graphs.get(file);
		if (known) return known;
		const module = read.get(file)!;
		const importedModuleInterfaces: Record<string, ModuleGraphInterfaceArtifact> = {};
		const plain = await buildSemanticGraph({ ...module, ...targetFacts });
		visiting.add(file);
		for (const entry of plain.moduleImports) {
			if (entry.typeOnly || !entry.source.startsWith('.')) continue;
			const dependency = resolve(entry.source, file);
			if (dependency === undefined || visiting.has(dependency)) continue;
			importedModuleInterfaces[entry.source] = (
				await analyze(dependency, visiting)
			).moduleGraphInterface;
		}
		const graph =
			Object.keys(importedModuleInterfaces).length === 0
				? plain
				: await buildSemanticGraph({
						...module,
						...targetFacts,
						importedModuleInterfaces,
					});
		interfaces.set(file, graph);
		return graph;
	};
	let native: NativeViewArtifact;
	for (;;) {
		native = createNativeViewPayload(compiled.semanticGraph, {
			...(route
				? {
						route: {
							pattern: route.pattern,
							params: route.params.map((param) => param.name),
						},
					}
				: {}),
			modules: { graphs, resolve },
			readSource: (file: string) => (file === input.filename ? input.source : read.get(file)?.source),
			...(input.scriptHandlers ? { scriptHandlers: input.scriptHandlers } : {}),
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
		const missing = (native.missingModules ?? []).filter((file) => !graphs.has(file));
		if (missing.length === 0) break;
		for (const file of missing) graphs.set(file, await analyze(file, new Set()));
	}
	// A phone build reads only the analysis; what the web's emission passes cannot emit does not bind it.
	const errors = collectTsrxModuleDiagnostics(compiled).filter(
		(diagnostic) =>
			diagnostic.severity === 'error' &&
			(diagnostic.phase === 'parse' || diagnostic.phase === 'semantic-graph'),
	);
	const { manifest: deviceEntries, diagnostics: usage } = deviceManifest(
		native.features,
		input.device,
	);
	return {
		payload: errors.length > 0 || usage.length > 0 ? null : native.payload,
		styles: [...importedStyles, ...compiled.publicRenderPlan.styleScopes].filter(
			(style, index, all) =>
				all.findIndex((other) => other.scopeId === style.scopeId) === index,
		),
		stylesheets: stylesheets.filter(
			(sheet, index, all) => all.findIndex((other) => other.file === sheet.file) === index,
		),
		features: native.features,
		manifest: deviceEntries,
		elementSources: native.elementSources,
		diagnostics: [...errors, ...native.diagnostics, ...usage],
	};
}

export type NativeAppBuild = {
	readonly payload: NativeAppPayload | null;
	/** Each styled route's style input for Dragon, in the payload's route order; a route with no CSS has none. */
	readonly styleInputs: ReadonlyArray<{
		readonly pattern: string;
		readonly page: string;
		readonly input: NativeStyleInput;
		/** Each system sheet's content, laid out once per resting height. */
		readonly sheets: ReadonlyArray<{
			readonly node: string;
			readonly snapPoint: number;
			readonly input: NativeStyleInput;
		}>;
	}>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic & { readonly page: string }>;
};

/**
 * Compiles every page of an app (`pages/index.tsrx`, `pages/orders/[id].tsrx`...) into one payload: the router's own
 * manifest gives each page's route and the match order, and each page's links are checked against it. A page's styles are
 * the app document's stylesheets, then its own and its components'; Dragon compiles each styled page once.
 */
export async function compileNativeApp(input: {
	readonly pages: ReadonlyArray<{
		readonly page: string;
		readonly filename: string;
		readonly source: string;
	}>;
	/** The app's `document.tsrx`: the stylesheets it imports reach every page, as on the web. */
	readonly document?: { readonly filename: string; readonly source: string };
	readonly readModule?: Parameters<typeof compileNativeComponent>[0]['readModule'];
	readonly readStylesheet?: ReadStylesheet;
}): Promise<NativeAppBuild> {
	const manifest = buildRouteManifestFromFileIds(input.pages.map((page) => page.page));
	const routes: NativeAppPayload['routes'][number][] = [];
	const styleInputs: NativeAppBuild['styleInputs'][number][] = [];
	const diagnostics: (CompilerDiagnostic & { readonly page: string })[] = [];
	const documentSheets = input.document
		? stylesheetsOf(
				(
					await compileTsrxModule({
						filename: input.document.filename,
						source: input.document.source,
						symbols: [],
					})
				).publicRenderPlan.stylesheetImports,
				input.document.filename,
				input.readStylesheet,
			)
		: [];
	for (const route of manifest.routes) {
		const page = input.pages.find((candidate) => candidate.page === route.file)!;
		const build = await compileNativeComponent({
			...page,
			manifest,
			...(input.readModule ? { readModule: input.readModule } : {}),
			...(input.readStylesheet ? { readStylesheet: input.readStylesheet } : {}),
		});
		diagnostics.push(
			...build.diagnostics.map((diagnostic) => ({ ...diagnostic, page: page.page })),
		);
		if (!build.payload) continue;
		routes.push({
			pattern: route.pattern,
			params: route.params.map((param) => param.name),
			page: build.payload,
		});
		const sheets = [...documentSheets, ...build.stylesheets].filter(
			(sheet, index, all) => all.findIndex((other) => other.file === sheet.file) === index,
		);
		if (sheets.length > 0 || build.styles.some((style) => style.cssText.length > 0)) {
			const inputs = nativeStyleInputs(build.payload, build.styles, sheets);
			styleInputs.push({
				pattern: route.pattern,
				page: page.page,
				input: inputs.page,
				sheets: inputs.sheets,
			});
		}
	}
	return {
		payload: diagnostics.length > 0 ? null : { version: NATIVE_APP_VERSION, routes },
		styleInputs: diagnostics.length > 0 ? [] : styleInputs,
		diagnostics,
	};
}
