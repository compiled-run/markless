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
	nativeRefusal,
	nativeUnsupported,
	selectorAttributes,
	type NativeScriptEngine,
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
import { NATIVE_APP_VERSION, NATIVE_NOT_FOUND_ROUTE } from '@markless/serializer/native-view';
import {
	booleanCellsOf,
	itemValuesOf,
	nativeStyleInputs,
	nativeStyleRowAttribute,
	readsRow,
	rowAttributeOptions,
	sheetsOf,
	type NativeStyleInput,
} from './style-input.ts';
import { imageHeader, svgImage, type NativeImage } from './images.ts';
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
	/** The images the app packages for this payload: each `<img src>` the build read, with its natural size. */
	readonly images: ReadonlyArray<NativeImage>;
};

/** A stylesheet's text as the web build ships it, unscoped: its rules reach every page that imports it. */
export type NativeStylesheet = { readonly file: string; readonly cssText: string };

/** Reads a stylesheet a module imports for its effect (`./app.css`); the caller owns file access. */
export type ReadStylesheet = (specifier: string, importer: string) => NativeStylesheet | undefined;
/** A file the build reads as it is: one the app serves at a path, or one a module imports as an asset. */
export type NativeFile = { readonly file: string; readonly bytes: Uint8Array };
/** A file the app serves at `href` (`/static/y18.gif`, from its public folder), as the browser loads it. */
export type ReadServedFile = (href: string) => NativeFile | undefined;
/** The path of every file the app serves from its public folder (`/images/lamp.svg`). */
export type ListServedFiles = () => ReadonlyArray<string>;
/** A file a module imports as an asset (`import logo from './logo.png'`), resolved as Vite resolves it; else undefined. */
export type ReadAsset = (specifier: string, importer: string) => NativeFile | undefined;
/** The prefix of the URL an imported asset is shown by in a native app: the packaged file's path follows it. */
export const NATIVE_ASSET_PREFIX = '/@markless-asset/';
/** A stylesheet the app serves at `href` (`/static/news.css`, from its public folder), as a `<link>` loads it. */
export type ReadServedStylesheet = (href: string) => NativeStylesheet | undefined;

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

/** Files a module imports as code (or as JSON's value); any other file it imports is an asset, as Vite treats it. */
const MODULE_EXTENSIONS = [
	'.ts',
	'.tsx',
	'.mts',
	'.cts',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.tsrx',
	'.json',
];

/** A JSON file imports as a module whose default export is its value, as the web build loads it. */
const withJsonModules = (read: ReadModule | undefined): ReadModule | undefined =>
	read &&
	((specifier, importer) => {
		const module = read(specifier, importer);
		if (module && !MODULE_EXTENSIONS.some((extension) => module.filename.endsWith(extension)))
			return undefined;
		if (!module?.filename.endsWith('.json')) return module;
		try {
			JSON.parse(module.source);
		} catch {
			return undefined;
		}
		return {
			filename: module.filename,
			source: `const json = ${module.source};\nexport default json;\n`,
		};
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
	readonly readServedStylesheet?: ReadServedStylesheet;
	readonly readServedFile?: ReadServedFile;
	readonly listServedFiles?: ListServedFiles;
	readonly readAsset?: ReadAsset;
	/** The app config's `device` section (usage text per feature). */
	readonly device?: DeviceAppConfig;
	/** The phone this payload is for; without one it serves both, and a read of `platform` is refused. */
	readonly target?: 'ios' | 'android';
	/** Where handlers run (`NativeViewOptions['scriptHandlers']`); the default runs each as data where it lowers. */
	readonly scriptHandlers?: 'fallback' | 'all' | 'never';
	/** Routes of the app whose page did not build: a link to one opens the not-found page, or does nothing. */
	readonly unbuilt?: ReadonlySet<string>;
	/** The app config's `origin`: where the app's site is served, which a URL from the root fetched on a phone reaches. */
	readonly origin?: string;
	/** The engine text a payload's script carries (`NativeViewOptions['scriptEngine']`). */
	readonly scriptEngine?: NativeScriptEngine;
}): Promise<NativeBuild> {
	if (input.origin !== undefined) checkOrigin(input.origin);
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
	if (
		compiled.semanticGraph.diagnostics.some(
			(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_CALL_UNRESOLVED',
		)
	) {
		const linked: Record<string, ModuleGraphInterfaceArtifact> = {};
		const follow = async (
			file: string,
			names: ReadonlySet<string> | null,
			seen: Set<string>,
		): Promise<void> => {
			if (seen.has(file)) return;
			seen.add(file);
			const surface = (await analyze(file, new Set())).moduleGraphInterface;
			linked[file] = surface;
			for (const reexport of surface.reexports ?? []) {
				if (names && reexport.exportName !== '*' && !names.has(reexport.exportName))
					continue;
				const target = resolve(reexport.source, file);
				if (target) await follow(target, reexport.exportName === '*' ? names : null, seen);
			}
		};
		for (const entry of compiled.semanticGraph.moduleImports) {
			if (entry.typeOnly || entry.source.startsWith('.')) continue;
			const file = resolve(entry.source, input.filename);
			if (!file) continue;
			await follow(
				file,
				entry.kind === 'named' ? new Set([entry.importedName ?? entry.localName]) : null,
				new Set(),
			);
			linked[entry.source] = linked[file]!;
		}
		if (Object.keys(linked).length > 0)
			compiled = await compileTsrxModule({ ...rootInput, importedModuleInterfaces: linked });
	}
	const linkedSheets: NativeStylesheet[] = [];
	const images = new Map<string, NativeImage>();
	const imageRefusals: CompilerDiagnostic[] = [];
	// What the browser takes the file for comes from its type, which the server gives by its extension.
	// `refuse`: a file the page names is refused when a phone cannot draw it; one it may name is left out.
	const imageAt = (
		src: string,
		read: NativeFile | undefined,
		span?: CompilerDiagnostic['primarySpan'],
		refuse = true,
	): boolean => {
		if (!read) return false;
		if (read.file.toLowerCase().endsWith('.svg')) {
			const svg = svgImage(read.bytes);
			if (!refuse && svg && svg.refusals.length > 0) return false;
			for (const refusal of svg?.refusals ?? [])
				imageRefusals.push(
					nativeRefusal('svg', `${read.file}, the image ${src}: ${refusal}`, span),
				);
			if (svg) images.set(src, { src, file: read.file, bytes: read.bytes, ...svg.image });
			return svg !== null;
		}
		const header = imageHeader(read.bytes);
		if (header) images.set(src, { src, file: read.file, bytes: read.bytes, ...header });
		return header !== null;
	};
	const assetImport = (specifier: string, importer: string): string | undefined => {
		const read = input.readAsset?.(specifier, importer);
		const src = read && `${NATIVE_ASSET_PREFIX}${read.file}`;
		return src !== undefined && imageAt(src, read) ? src : undefined;
	};
	const linkStylesheet = (href: string): boolean => {
		const sheet = input.readServedStylesheet?.(href);
		if (sheet) linkedSheets.push(sheet);
		return sheet !== undefined;
	};
	let native: NativeViewArtifact;
	let keyHandlers = false;
	for (;;) {
		native = createNativeViewPayload(compiled.semanticGraph, {
			...(keyHandlers ? { keyHandlers } : {}),
			linkStylesheet,
			assetImport,
			...(route
				? {
						route: {
							pattern: route.pattern,
							params: route.params.map((param) => param.name),
						},
					}
				: {}),
			modules: { graphs, resolve },
			readSource: (file: string) =>
				file === input.filename ? own.source : read.get(file)?.source,
			...(input.scriptHandlers ? { scriptHandlers: input.scriptHandlers } : {}),
			...(input.origin !== undefined ? { origin: input.origin } : {}),
			...(input.scriptEngine ? { scriptEngine: input.scriptEngine } : {}),
			...(input.manifest
				? {
						routes: input.manifest.routes.map((entry) => ({
							pattern: entry.pattern,
							params: entry.params.map((param) => param.name),
						})),
						...(input.manifest.statusPages.notFound &&
						!input.unbuilt?.has(NATIVE_NOT_FOUND_ROUTE)
							? { notFound: NATIVE_NOT_FOUND_ROUTE }
							: {}),
						...(input.unbuilt ? { unbuilt: input.unbuilt } : {}),
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
		// A script that makes a KeyboardEvent can raise keydown, so elements' keydown handlers are built after all.
		if (missing.length === 0 && native.raisesKeys) {
			keyHandlers = true;
			continue;
		}
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
	const sheets = [...stylesheets, ...linkedSheets].filter(
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
			built.push(
				...(await compileTsrxModule({ ...module, symbols: [] })).publicRenderPlan
					.styleScopes,
			);
		}
	const styles = [...importedStyles, ...built, ...compiled.publicRenderPlan.styleScopes].filter(
		(style, index, all) => all.findIndex((other) => other.scopeId === style.scopeId) === index,
	);
	const unstyled = native.payload
		? unstyledOnly(
				native.payload,
				native.elementSources,
				styled ? [...sheets, ...styles].map((style) => style.cssText) : [],
			)
		: [];
	// A fixed `<img src>` the app serves: the browser loads it from the public folder, so the app packages it.
	for (const node of native.payload?.nodes ?? []) {
		const src =
			node.kind === 'element' && node.element === 'img' ? node.attributes?.src : undefined;
		if (src && src.startsWith('/') && !src.startsWith('//') && !images.has(src))
			imageAt(src, input.readServedFile?.(src), native.elementSources.get(node.id)?.span);
	}
	// An `<img>` whose src follows state can show any image the app serves, so the app packages each one a phone can draw.
	const runtimeSrc = (native.payload?.nodes ?? []).some(
		(node) =>
			node.kind === 'element' &&
			node.element === 'img' &&
			(node.bindings ?? []).some((binding) => 'attribute' in binding && binding.attribute === 'src'),
	);
	if (runtimeSrc)
		for (const href of input.listServedFiles?.() ?? [])
			if (!images.has(href)) imageAt(href, input.readServedFile?.(href), undefined, false);
	return {
		payload:
			errors.length > 0 || usage.length > 0 || unstyled.length > 0 || imageRefusals.length > 0
				? null
				: native.payload,
		images: [...images.values()],
		styles,
		stylesheets: sheets,
		features: native.features,
		manifest: deviceEntries,
		elementSources: native.elementSources,
		diagnostics: [...errors, ...native.diagnostics, ...usage, ...unstyled, ...imageRefusals],
	};
}

/** Elements a native host cannot draw on a styled page from what Dragon exports for it: a select in a system sheet and a summary's triangle. */
function unstyledOnly(
	payload: NativeViewPayload,
	sources: NativeViewArtifact['elementSources'],
	css: ReadonlyArray<string>,
): CompilerDiagnostic[] {
	if (!css.some((text) => text.length > 0)) return [];
	const tested = new Set(css.flatMap((text) => [...selectorAttributes(text)]));
	const sheetOf = sheetsOf(payload);
	return payload.nodes.flatMap((node) => {
		if (node.kind !== 'element') return [];
		const span = sources.get(node.id)?.span;
		const sheet = sheetOf.get(node.id);
		if (node.element === 'select' && sheet)
			return [
				nativeUnsupported(
					`the <select> ${node.id} inside the system sheet ${sheet} on a styled page: a sheet's content is exported without Dragon's plan layout, so no geometry for its drop-down arrow reaches the phone`,
					span,
				),
			];
		if (node.element === 'summary')
			return [
				nativeUnsupported(
					`the <summary> ${node.id} on a styled page, whose disclosure triangle Dragon does not draw yet`,
					span,
				),
			];
		if (node.element === 'center')
			return [
				nativeUnsupported(
					`the <${node.element}> ${node.id} on a styled page, whose default look Dragon does not have yet`,
					span,
				),
			];
		if (!node.row) return [];
		return (node.bindings ?? []).flatMap((binding) =>
			'attribute' in binding &&
			nativeStyleRowAttribute(binding.attribute, tested) &&
			readsRow(payload, binding.value) &&
			!rowAttributeOptions(
				binding.attribute,
				binding.value,
				booleanCellsOf(payload),
				itemValuesOf(payload),
			)
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
	/** Every page's packaged images, once each. */
	readonly images: ReadonlyArray<NativeImage>;
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
	readonly readServedStylesheet?: ReadServedStylesheet;
	readonly readServedFile?: ReadServedFile;
	readonly listServedFiles?: ListServedFiles;
	readonly readAsset?: ReadAsset;
	/** The app config's `device` section (usage text per feature), for every page. */
	readonly device?: DeviceAppConfig;
	/** The phone this payload is for; without one it serves both, and a read of `platform` is refused. */
	readonly target?: 'ios' | 'android';
	/** Keep the routes whose page builds when others refuse (their diagnostics are still returned). */
	readonly partial?: boolean;
	readonly scriptEngine?: NativeScriptEngine;
	/** The `icons` option of the app's `ui()` plugin, as `compileNativeComponent` takes it. */
	readonly icons?: false | IconsOptions;
	/** The app config's `origin`, for every page (see `compileNativeComponent`). */
	readonly origin?: string;
}): Promise<NativeAppBuild> {
	const icons = sourceTransformOf(input.icons) ?? (false as const);
	const manifest = buildRouteManifestFromFileIds(input.pages.map((page) => page.page));
	const routes: NativeAppPayload['routes'][number][] = [];
	const images: NativeImage[] = [];
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
	// The app's 404 page rides as one more route, where links to paths no route matches open it.
	const entries = [
		...manifest.routes.map((route) => ({
			file: route.file,
			pattern: route.pattern,
			params: route.params.map((param) => param.name),
			routed: true,
		})),
		...(manifest.statusPages.notFound
			? [
					{
						file: manifest.statusPages.notFound,
						pattern: NATIVE_NOT_FOUND_ROUTE,
						params: [],
						routed: false,
					},
				]
			: []),
	];
	type Entry = (typeof entries)[number];
	const buildPage = async (route: Entry, unbuilt?: ReadonlySet<string>) => {
		const page = input.pages.find((candidate) => candidate.page === route.file)!;
		const build = await compileNativeComponent({
			filename: page.filename,
			source: page.source,
			...(route.routed ? { page: page.page } : {}),
			manifest,
			...(input.readModule ? { readModule: input.readModule } : {}),
			...(input.readStylesheet ? { readStylesheet: input.readStylesheet } : {}),
			...(input.readServedStylesheet
				? { readServedStylesheet: input.readServedStylesheet }
				: {}),
			...(input.readServedFile ? { readServedFile: input.readServedFile } : {}),
			...(input.listServedFiles ? { listServedFiles: input.listServedFiles } : {}),
			...(input.readAsset ? { readAsset: input.readAsset } : {}),
			...(input.device ? { device: input.device } : {}),
			...(input.target ? { target: input.target } : {}),
			...(input.scriptEngine ? { scriptEngine: input.scriptEngine } : {}),
			...(unbuilt ? { unbuilt } : {}),
			icons,
			...(input.origin !== undefined ? { origin: input.origin } : {}),
		});
		for (const image of build.images)
			if (!images.some((other) => other.src === image.src)) images.push(image);
		const pageDiagnostics = build.diagnostics.map((diagnostic) => ({
			...diagnostic,
			page: page.page,
		}));
		if (!build.payload)
			return { route, features: build.features, diagnostics: pageDiagnostics };
		const sheets = [...documentSheets, ...build.stylesheets].filter(
			(sheet, index, all) => all.findIndex((other) => other.file === sheet.file) === index,
		);
		const styled = sheets.length > 0 || build.styles.some((style) => style.cssText.length > 0);
		const unstyled = unstyledOnly(
			build.payload,
			build.elementSources,
			[...sheets, ...build.styles].map((style) => style.cssText),
		);
		if (unstyled.length > 0)
			return {
				route,
				features: build.features,
				diagnostics: [
					...pageDiagnostics,
					...unstyled.map((diagnostic) => ({ ...diagnostic, page: page.page })),
				],
			};
		const inputs = styled ? nativeStyleInputs(build.payload, build.styles, sheets) : undefined;
		return {
			route,
			features: build.features,
			diagnostics: pageDiagnostics,
			built: {
				pattern: route.pattern,
				params: route.params,
				// Each route's page names its route, as hosts check; the 404 page is routed here, not by the router.
				page: route.routed
					? build.payload
					: { ...build.payload, route: { pattern: route.pattern, params: [] } },
			},
			...(inputs
				? {
						styleInput: {
							pattern: route.pattern,
							page: page.page,
							input: inputs.page,
							sheets: inputs.sheets,
						},
					}
				: {}),
		};
	};
	let pages: Awaited<ReturnType<typeof buildPage>>[] = [];
	for (const route of entries) pages.push(await buildPage(route));
	// A page that did not build leaves the app: the others are built again knowing it, so a link to it opens the not-found
	// page, or does nothing, rather than naming a route the app does not have.
	const unbuilt = new Set(
		pages.filter((one) => !('built' in one)).map((one) => one.route.pattern),
	);
	if (input.partial && unbuilt.size > 0 && unbuilt.size < pages.length)
		for (const [index, one] of pages.entries())
			if ('built' in one) pages[index] = await buildPage(one.route, unbuilt);
	for (const one of pages) {
		for (const feature of one.features) features.add(feature);
		diagnostics.push(...one.diagnostics);
		if ('built' in one) routes.push(one.built);
		if ('styleInput' in one && one.styleInput) styleInputs.push(one.styleInput);
	}
	// A warning names something left out of a page that still builds (a keyboard-only handler); only an error refuses the app.
	const refused = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
	return {
		payload:
			refused && !(input.partial && routes.length > 0)
				? null
				: { version: NATIVE_APP_VERSION, routes },
		styleInputs: refused && !input.partial ? [] : styleInputs,
		images,
		manifest: deviceManifest([...features], input.device).manifest,
		diagnostics,
	};
}

/** An app's `origin` is a site's origin as the web writes it: `http` or `https`, a host, maybe a port, and no path. */
function checkOrigin(origin: string): void {
	let parsed: URL | undefined;
	try {
		parsed = new URL(origin);
	} catch {}
	if (
		!parsed ||
		(parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
		parsed.origin !== origin
	)
		throw new Error(
			`app.json "origin" is ${JSON.stringify(origin)}; write the site's origin, as in "https://shop.example" (http or https, no path or trailing slash)`,
		);
}
