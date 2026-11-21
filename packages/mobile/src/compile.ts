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
	nativeUnsupported,
	type NativeViewArtifact,
} from '@markless/compiler/native';
import {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	type RouteManifest,
} from '@markless/router';
import { iconSourceTransform, type IconsOptions } from '@markless/icons/vite';
import type { NativeAppPayload, NativeViewPayload } from '@markless/serializer';
import { uiIconsOptions } from '@markless/ui-tools';
import { isNativeStyleStateAttribute, NATIVE_APP_VERSION } from '@markless/serializer/native-view';
import { nativeStyleInputs, readsRow, rowAttributeOptions, type NativeStyleInput } from './style-input.ts';
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
/** What the web build's `ui()` plugin does to each source before markless compiles it: icon tags become inline `<svg>`. */
export type NativeSourceTransform = ReturnType<typeof iconSourceTransform>;

let uiIcons: NativeSourceTransform | undefined;
/** `ui()`'s icons, as an app's web build applies them unless its config turns them off; one per process, so packs load once. */
const sourceTransformOf = (icons: false | IconsOptions | NativeSourceTransform | undefined) =>
	icons === false
		? undefined
		: typeof icons === 'function'
			? icons
			: icons
				? iconSourceTransform(uiIconsOptions(icons))
				: (uiIcons ??= iconSourceTransform(uiIconsOptions()));

const transformed = async (
	module: { readonly filename: string; readonly source: string },
	transform: NativeSourceTransform | undefined,
) => {
	const code = transform && (await transform(module.source, module.filename)).code;
	return code === undefined ? module : { ...module, source: code };
};

export async function compileNativeComponent(input: {
	readonly filename: string;
	readonly source: string;
	/** The `icons` option of the app's `ui()` plugin (`false`: off); by default its icon tags become inline `<svg>` as on the web. */
	readonly icons?: false | IconsOptions | NativeSourceTransform;
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
	const transform = sourceTransformOf(input.icons);
	const own = await transformed(input, transform);
	const rootInput = {
		filename: input.filename,
		source: own.source,
		symbols: [],
		nativeFacts: NATIVE_FACT_COLLECTORS,
		target: input.target ?? ('native' as const),
		deviceTargetFacts: DEVICE_TARGET_FACTS,
	};
	let compiled = await compileTsrxModule(rootInput);
	const importedStyles: NativeBuild['styles'][number][] = [];
	const stylesheets = stylesheetsOf(
		compiled.publicRenderPlan.stylesheetImports,
		input.filename,
		input.readStylesheet,
	);
	for (const entry of compiled.semanticGraph.moduleImports) {
		if (entry.typeOnly || !entry.source.startsWith('.')) continue;
		const found = readModule?.(entry.source, input.filename);
		if (!found) continue;
		const module = await transformed(found, transform);
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
		// The first read stays: it is rewritten as the web build rewrites it before it is analyzed.
		if (module && !read.has(module.filename)) read.set(module.filename, module);
		return module?.filename;
	};
	// A module is analyzed with the interfaces of the modules it imports, as the web build links them, so a shared()
	// definition from another file (`toolbarState()` in toggle) resolves to the same definition there.
	const interfaces = new Map<string, SemanticGraphArtifact>();
	const analyze = async (file: string, visiting: Set<string>): Promise<SemanticGraphArtifact> => {
		const known = interfaces.get(file) ?? graphs.get(file);
		if (known) return known;
		const module = await transformed(read.get(file)!, transform);
		read.set(file, module);
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
	// A shared() accessor the app reaches through a package's barrel (`calendar.state()` from `@markless/ui`) resolves
	// against the interfaces of the modules the barrel re-exports, as the web build links them: the app is analyzed
	// again with those, following only the names it imports.
	if (compiled.semanticGraph.diagnostics.some((diagnostic) => diagnostic.code === 'MARKLESS_SHARED_CALL_UNRESOLVED')) {
		const linked: Record<string, ModuleGraphInterfaceArtifact> = {};
		const follow = async (file: string, names: ReadonlySet<string> | null, seen: Set<string>): Promise<void> => {
			if (seen.has(file)) return;
			seen.add(file);
			const surface = (await analyze(file, new Set())).moduleGraphInterface;
			linked[file] = surface;
			for (const reexport of surface.reexports ?? []) {
				if (names && reexport.exportName !== '*' && !names.has(reexport.exportName)) continue;
				const target = resolve(reexport.source, file);
				if (target) await follow(target, reexport.exportName === '*' ? names : null, seen);
			}
		};
		for (const entry of compiled.semanticGraph.moduleImports) {
			if (entry.typeOnly || entry.source.startsWith('.')) continue;
			const file = resolve(entry.source, input.filename);
			if (!file) continue;
			await follow(file, entry.kind === 'named' ? new Set([entry.importedName ?? entry.localName]) : null, new Set());
			linked[entry.source] = linked[file]!;
		}
		if (Object.keys(linked).length > 0) compiled = await compileTsrxModule({ ...rootInput, importedModuleInterfaces: linked });
	}
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
			readSource: (file: string) => (file === input.filename ? own.source : read.get(file)?.source),
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
	const sheets = stylesheets.filter(
		(sheet, index, all) => all.findIndex((other) => other.file === sheet.file) === index,
	);
	const authored = [...importedStyles, ...compiled.publicRenderPlan.styleScopes];
	const styled = sheets.length > 0 || authored.some((style) => style.cssText.length > 0);
	// A styled page gets every component module's <style> blocks it is built from, as the web bundle does (a family's
	// defaults); an unstyled page keeps the phone's own look, which those defaults do not change.
	const built: NativeBuild['styles'][number][] = [];
	if (styled)
		for (const file of graphs.keys()) {
			const module = read.get(file);
			if (file === input.filename || !module || !file.endsWith('.tsrx')) continue;
			built.push(...(await compileTsrxModule({ ...module, symbols: [] })).publicRenderPlan.styleScopes);
		}
	const styles = [...importedStyles, ...built, ...compiled.publicRenderPlan.styleScopes].filter(
		(style, index, all) => all.findIndex((other) => other.scopeId === style.scopeId) === index,
	);
	const unstyled = native.payload ? unstyledOnly(native.payload, native.elementSources, styled) : [];
	return {
		payload: errors.length > 0 || usage.length > 0 || unstyled.length > 0 ? null : native.payload,
		styles,
		stylesheets: sheets,
		features: native.features,
		manifest: deviceEntries,
		elementSources: native.elementSources,
		diagnostics: [...errors, ...native.diagnostics, ...usage, ...unstyled],
	};
}

/** Elements a native host draws only on a page Dragon does not lay out: Dragon has no box for a pop-up list yet. */
function unstyledOnly(
	payload: NativeViewPayload,
	sources: NativeViewArtifact['elementSources'],
	styled: boolean,
): CompilerDiagnostic[] {
	if (!styled) return [];
	return payload.nodes.flatMap((node) => {
		if (node.kind !== 'element') return [];
		const span = sources.get(node.id)?.span;
		if (node.element === 'select')
			return [
				nativeUnsupported(
					`the <select> ${node.id} on a styled page, which Dragon does not lay out yet`,
					span,
				),
			];
		if (!node.row) return [];
		return (node.bindings ?? []).flatMap((binding) =>
			'attribute' in binding &&
			(binding.attribute === 'class' || isNativeStyleStateAttribute(binding.attribute)) &&
			readsRow(payload, binding.value) &&
			!rowAttributeOptions(binding.attribute, binding.value)
				? [
						nativeUnsupported(
							`the \`${binding.attribute}\` of <${node.element}> ${node.id} follows its @for row on a styled page through a value the build cannot list; Dragon styles a row by each value it can give, so write it as literals chosen by conditions`,
							span,
						),
					]
				: [],
		);
	});
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
	/** The Info.plist and AndroidManifest.xml entries for the device features any page uses. */
	readonly manifest: DeviceManifest;
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
	/** The app config's `device` section (usage text per feature), for every page. */
	readonly device?: DeviceAppConfig;
	/** The phone this payload is for; without one it serves both, and a read of `platform` is refused. */
	readonly target?: 'ios' | 'android';
	/** The `icons` option of the app's `ui()` plugin, as `compileNativeComponent` takes it. */
	readonly icons?: false | IconsOptions;
}): Promise<NativeAppBuild> {
	const icons = sourceTransformOf(input.icons) ?? (false as const);
	const manifest = buildRouteManifestFromFileIds(input.pages.map((page) => page.page));
	const routes: NativeAppPayload['routes'][number][] = [];
	const styleInputs: NativeAppBuild['styleInputs'][number][] = [];
	const diagnostics: (CompilerDiagnostic & { readonly page: string })[] = [];
	const features = new Set<NativeDeviceFeature>();
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
			...(input.device ? { device: input.device } : {}),
			...(input.target ? { target: input.target } : {}),
			icons,
		});
		for (const feature of build.features) features.add(feature);
		diagnostics.push(
			...build.diagnostics.map((diagnostic) => ({ ...diagnostic, page: page.page })),
		);
		if (!build.payload) continue;
		const sheets = [...documentSheets, ...build.stylesheets].filter(
			(sheet, index, all) => all.findIndex((other) => other.file === sheet.file) === index,
		);
		const styled = sheets.length > 0 || build.styles.some((style) => style.cssText.length > 0);
		const unstyled = unstyledOnly(build.payload, build.elementSources, styled);
		if (unstyled.length > 0) {
			diagnostics.push(...unstyled.map((diagnostic) => ({ ...diagnostic, page: page.page })));
			continue;
		}
		routes.push({
			pattern: route.pattern,
			params: route.params.map((param) => param.name),
			page: build.payload,
		});
		if (styled) {
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
		manifest: deviceManifest([...features], input.device).manifest,
		diagnostics,
	};
}
