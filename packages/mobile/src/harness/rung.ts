import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import { pathToFileURL } from 'node:url';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { LadderRung } from '../../proofs/ladder.ts';
import {
	appStyleFonts,
	nativeAppStyle,
	nativeAppStyleSize,
	type DragonStyleExport,
	type StyleFont,
} from '../app-style.ts';
import {
	compileNativeApp,
	compileNativeComponent,
	type NativeAppBuild,
	type NativeBuild,
} from '../compile.ts';
import type { DeviceAppConfig, DeviceManifest } from '../permissions.ts';
import { pageScrollDiagnostics } from '../page-scroll.ts';
import { dragonDir, dragonStyleExport } from '../style-export.ts';
import type { NativeImage, NativeImageManifest } from '../images.ts';
import { nativeStyleInput, nativeStyleInputAt, type NativeStyleInput } from '../style-input.ts';
import { readProofExpected } from './expected.ts';
import {
	PROOF_FONTS_FOLDER,
	PROOF_IMAGES_FOLDER,
	PROOF_IMAGES_PATH,
	PROOF_PAYLOAD_PATH,
	PROOF_PLATFORMS,
	PROOF_STYLE_PATH,
	type ProofPlatform,
} from './proof-app.ts';

/** Files a shell carries for one rung, by path inside the iOS bundle or the APK's assets. */
export type ProofAssets = ReadonlyMap<string, Uint8Array>;

export type ProofRung = {
	readonly name: string;
	readonly dir: string;
	readonly flowPath: string;
	readonly flow: string;
	readonly expected: LadderRung;
	/** Each phone's own build: a `platform` check keeps a different arm on each. */
	readonly assets: Readonly<Record<ProofPlatform, ProofAssets>>;
	/** The Info.plist and AndroidManifest.xml entries the build derived from the device features the rung uses. */
	readonly manifest: DeviceManifest;
};

/** The app config, one per app, in an app rung folder or beside the rung folders of a ladder: `{ "device": { "usage": { "<feature>": "<text>" } } }`. */
const APP_CONFIG = 'app.json';

/** The config of the app a rung folder is (its own app.json) or belongs to (one beside it); empty when the app has none. */
export function readAppConfig(rungDir: string): { readonly device?: DeviceAppConfig } {
	const file = [join(rungDir, APP_CONFIG), join(dirname(rungDir), APP_CONFIG)].find((path) =>
		existsSync(path),
	);
	return file
		? (JSON.parse(readFileSync(file, 'utf8')) as { readonly device?: DeviceAppConfig })
		: {};
}

const COMPONENT_FILE = 'App.tsrx';
const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..');

/** Reads a module a rung imports by relative path (`./Stepper.tsrx`), so the build can lower its components in place. */
export function readRelativeModule(specifier: string, importer: string) {
	const file = resolve(repoRoot, dirname(importer), specifier);
	return existsSync(file)
		? { filename: relative(repoRoot, file), source: readFileSync(file, 'utf8') }
		: undefined;
}
/** Every page file under `<dir>/pages`, as the router names them (`pages/orders/[id].tsrx`). */
function pageFiles(dir: string, under = 'pages'): string[] {
	return readdirSync(join(dir, under), { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? pageFiles(dir, join(under, entry.name))
			: entry.name.endsWith('.tsrx')
				? [join(under, entry.name)]
				: [],
	);
}

/** Reads a stylesheet a module imports for its effect (`../styles/app.css`), as the web build would ship it. */
export function readRelativeStylesheet(specifier: string, importer: string) {
	const file = resolve(repoRoot, dirname(importer), specifier);
	return existsSync(file)
		? { file: relative(repoRoot, file), cssText: readFileSync(file, 'utf8') }
		: undefined;
}

/** A file an app serves at a path (`/static/y18.gif`): the file in its public folder, as Vite serves it. */
export function servedFileReader(appRoot: string) {
	const publicDir = resolve(appRoot, 'public');
	return (href: string) => {
		if (!href.startsWith('/') || href.startsWith('//')) return undefined;
		const file = resolve(publicDir, `.${href.split(/[?#]/)[0]}`);
		return file.startsWith(`${publicDir}/`) && existsSync(file) && statSync(file).isFile()
			? { file: relative(repoRoot, file), bytes: new Uint8Array(readFileSync(file)) }
			: undefined;
	};
}

/** A stylesheet an app serves at a path (`/static/news.css`): the file in its public folder, as Vite serves it. */
export function servedReader(appRoot: string) {
	const read = servedFileReader(appRoot);
	return (href: string) => {
		const served = read(href);
		return served && { file: served.file, cssText: new TextDecoder().decode(served.bytes) };
	};
}

/** A file a module imports as an asset, beside the importer (`import logo from './logo.png'`). */
export function assetReader(specifier: string, importer: string) {
	if (!specifier.startsWith('.')) return undefined;
	const file = resolve(repoRoot, dirname(importer), specifier);
	return existsSync(file) && statSync(file).isFile()
		? { file: relative(repoRoot, file), bytes: new Uint8Array(readFileSync(file)) }
		: undefined;
}

/** The app's packaged images: each file under `markless-images/`, and the manifest of src to file and natural size. */
function imageAssets(images: ReadonlyArray<NativeImage>): Array<[string, Uint8Array]> {
	if (images.length === 0) return [];
	const manifest: Record<string, NativeImageManifest[string]> = {};
	const files: Array<[string, Uint8Array]> = [];
	for (const image of images) {
		const size =
			image.width !== undefined && image.height !== undefined
				? { width: image.width, height: image.height }
				: {};
		// An SVG file travels as its compiled drawing; the phone never reads SVG.
		if (image.drawing) {
			manifest[image.src] = { ...size, drawing: image.drawing };
			continue;
		}
		const file = `${PROOF_IMAGES_FOLDER}/${createHash('sha256').update(image.bytes).digest('hex')}.${image.format}`;
		manifest[image.src] = {
			file,
			...size,
			...(image.orientation && { orientation: image.orientation }),
		};
		if (!files.some(([path]) => path === file)) files.push([file, image.bytes]);
	}
	return [
		[PROOF_IMAGES_PATH, new TextEncoder().encode(`${JSON.stringify(manifest)}\n`)],
		...files,
	];
}

/** The app's document, when the rung has its own (`document.tsrx`, whose stylesheet imports reach every page). */
const APP_DOCUMENT = 'document.tsrx';

/** Compiles a navigation rung's app: every page under `pages/`, with repo-relative filenames as for one-screen rungs. */
export function compileRungApp(
	dir: string,
	options: { readonly target?: ProofPlatform; readonly device?: DeviceAppConfig } = {},
) {
	const document = join(dir, APP_DOCUMENT);
	return compileNativeApp({
		...options,
		pages: pageFiles(dir).map((page) => ({
			page,
			filename: relative(repoRoot, join(dir, page)),
			source: readFileSync(join(dir, page), 'utf8'),
		})),
		...(existsSync(document)
			? {
					document: {
						filename: relative(repoRoot, document),
						source: readFileSync(document, 'utf8'),
					},
				}
			: {}),
		readModule: readWorkspaceModule,
		readStylesheet: readRelativeStylesheet,
		readServedStylesheet: servedReader(dir),
		readServedFile: servedFileReader(dir),
		readAsset: assetReader,
	});
}

/**
 * Reads a module a rung imports, relative (`./Stepper.tsrx`) or from a workspace package (`@markless/ui`), resolved as
 * Node resolves it from the importing file, so the build can lower the components it exports.
 */
export function readWorkspaceModule(specifier: string, importer: string) {
	if (specifier.startsWith('.')) return readRelativeModule(specifier, importer);
	const file = resolvePackageModule(specifier, resolve(repoRoot, importer));
	return file === undefined
		? undefined
		: { filename: relative(repoRoot, file), source: readFileSync(file, 'utf8') };
}

/** The ES module conditions a phone's script loads a package by, in the order a bundler for the browser tries them. */
const IMPORT_CONDITIONS = ['import', 'module', 'browser', 'default'];

/**
 * A package specifier resolved as an ES module import from `importer` (a phone's script loads ES modules, so a package's
 * `import` build, not its `require` one), else as Node's `require` resolves it.
 */
export function resolvePackageModule(specifier: string, importer: string): string | undefined {
	const manifestPath = (() => {
		try {
			return findPackageJSON(specifier, pathToFileURL(importer));
		} catch {
			return undefined;
		}
	})();
	if (manifestPath) {
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			readonly name?: string;
			readonly exports?: unknown;
			readonly module?: string;
		};
		const subpath =
			manifest.name && specifier.startsWith(`${manifest.name}/`)
				? `.${specifier.slice(manifest.name.length)}`
				: '.';
		const pick = (entry: unknown): string | undefined => {
			if (typeof entry === 'string') return entry;
			if (entry && typeof entry === 'object' && !Array.isArray(entry))
				for (const condition of IMPORT_CONDITIONS) {
					const found = pick((entry as Record<string, unknown>)[condition]);
					if (found) return found;
				}
			return undefined;
		};
		const exportsField = manifest.exports;
		const exported =
			exportsField &&
			typeof exportsField === 'object' &&
			!Array.isArray(exportsField) &&
			Object.keys(exportsField).some((key) => key.startsWith('.'))
				? pick((exportsField as Record<string, unknown>)[subpath])
				: subpath === '.'
					? pick(exportsField)
					: undefined;
		const target = exported ?? (subpath === '.' ? manifest.module : undefined);
		// Real paths, as `require.resolve` answers: a workspace package is named by its folder, not a node_modules link.
		if (target) return realpathSync(resolve(dirname(manifestPath), target));
	}
	try {
		return createRequire(importer).resolve(specifier);
	} catch {
		return undefined;
	}
}
/** A hand-made payload, only for the harness's own fixture rungs that prove the machinery without the compiler. */
const HAND_MADE_PAYLOAD = 'payload.json';
/** Written here for Dragon, which turns it into the style export at proof time (DRAGON_DIR, `../style-export.ts`). */
const STYLE_INPUT = 'native-style-input.json';

type StyleExportFonts = { readonly fonts?: ReadonlyArray<StyleFont> };

/** Writes a style input for Dragon, each font file relative to it; a font file the CSS names that is not there is a build error. */
function writeStyleInput(file: string, input: NativeStyleInput, name: string): void {
	mkdirSync(dirname(file), { recursive: true });
	const at = nativeStyleInputAt(input, (font) => {
		const path = resolve(repoRoot, font);
		if (!existsSync(path))
			throw new Error(
				`${name}: the stylesheets name the font file ${font}, which is not there`,
			);
		return relative(dirname(file), path);
	});
	writeFileSync(file, `${JSON.stringify(at, null, '\t')}\n`);
}

/** Dragon's export for one style input file, or the rung's refusal naming Dragon's reasons. */
function styleExport(inputPath: string, name: string, plan = false): Uint8Array {
	try {
		return dragonStyleExport(inputPath, dragonDir(), plan);
	} catch (error) {
		throw new Error(
			`${name}: the component has styles, and its style export could not be made: ${(error as Error).message}`,
		);
	}
}

/** Written beside an app rung's style inputs: the app style's size against the per-page exports it replaces. */
const STYLE_SIZE = 'style-size.json';
/** An app rung's style inputs, one per styled page, at the page's path under `pages/`. */
const APP_STYLE_INPUTS = 'native-style-input';

/** Runs Dragon once per styled page and joins the exports into the app's one style file. */
function appStyle(dir: string, name: string, inputs: NativeAppBuild['styleInputs']) {
	rmSync(join(dir, APP_STYLE_INPUTS), { recursive: true, force: true });
	const exportOf = (file: string, input: NativeStyleInput, plan: boolean): DragonStyleExport => {
		writeStyleInput(file, input, name);
		const exported = JSON.parse(
			new TextDecoder().decode(styleExport(file, name, plan)),
		) as DragonStyleExport;
		// The inputs sit at different depths; the app style names an input's font file from the rung folder.
		return {
			...exported,
			fonts: exported.fonts.map((font) =>
				font.from === 'input'
					? { ...font, file: relative(dir, resolve(dirname(file), font.file)) }
					: font,
			),
		};
	};
	const pages = inputs.map(({ pattern, page, input, sheets }) => {
		const base = join(dir, APP_STYLE_INPUTS, relative('pages', page).slice(0, -'.tsrx'.length));
		const sheetNodes = [...new Set(sheets.map((sheet) => sheet.node))];
		return {
			pattern,
			exported: exportOf(`${base}.json`, input, true),
			sheets: sheets.map((sheet) => ({
				node: sheet.node,
				snapPoint: sheet.snapPoint,
				// One input per sheet and resting height: `index.sheet0-0.5.json`.
				exported: exportOf(
					`${base}.sheet${sheetNodes.indexOf(sheet.node)}-${sheet.snapPoint}.json`,
					sheet.input,
					false,
				),
			})),
		};
	});
	const style = nativeAppStyle(pages);
	writeFileSync(
		join(dir, STYLE_SIZE),
		`${JSON.stringify(nativeAppStyleSize(pages, style), null, '\t')}\n`,
	);
	return { bytes: new TextEncoder().encode(JSON.stringify(style)), fonts: appStyleFonts(pages) };
}

/** A styled page whose scroll range Dragon cannot decide is a build error naming the file and the element. */
function checkPageScroll(
	bytes: Uint8Array,
	build: NativeBuild,
	filename: string,
	name: string,
): Uint8Array {
	const exported = JSON.parse(new TextDecoder().decode(bytes)) as Parameters<
		typeof pageScrollDiagnostics
	>[0];
	const unscrollable = pageScrollDiagnostics(exported, build, filename);
	if (unscrollable.length > 0)
		throw new Error(
			`${name}: ${COMPONENT_FILE} has no native build\n${unscrollable.map((d) => `  ${d.code}: ${d.message}`).join('\n')}`,
		);
	return bytes;
}

/**
 * The style file and every font face it names, checked against the face's `sha256:` id: a face `from` the input is a file of
 * the rung, relative to `dir`; any other is in the Dragon checkout.
 */
function styleAssets(
	bytes: Uint8Array,
	fonts: ReadonlyArray<StyleFont>,
	name: string,
	dir: string,
): Array<[string, Uint8Array]> {
	const dragon = dragonDir();
	const assets: Array<[string, Uint8Array]> = [[PROOF_STYLE_PATH, bytes]];
	for (const font of fonts) {
		const file = resolve(font.from === 'input' ? dir : dragon, font.file);
		if (!existsSync(file)) {
			throw new Error(
				font.from === 'input'
					? `${name}: font ${font.id} is not at ${file}`
					: `${name}: font ${font.id} is not at ${file} in the Dragon checkout ${dragon}`,
			);
		}
		const face = readFileSync(file);
		const digest = `sha256:${createHash('sha256').update(face).digest('hex')}`;
		if (digest !== font.id)
			throw new Error(`${name}: ${file} is ${digest}, not the export's ${font.id}`);
		assets.push([`${PROOF_FONTS_FOLDER}/${digest.slice('sha256:'.length)}.ttf`, face]);
	}
	return assets;
}

/**
 * Reads a rung folder and compiles its App.tsrx with the real compiler into the native payload both shells embed. A rung
 * with styles also writes Dragon's input and needs Dragon's export beside it.
 */
export async function loadRung(dir: string): Promise<ProofRung> {
	const name = basename(dir);
	const flowPath = join(dir, 'flow.yaml');
	const expectedPath = join(dir, 'expected.json');
	for (const required of [flowPath, expectedPath]) {
		if (!existsSync(required)) throw new Error(`${name}: ${basename(required)} is missing`);
	}
	const expected = readProofExpected(
		JSON.parse(readFileSync(expectedPath, 'utf8')),
		expectedPath,
	);
	const component = join(dir, COMPONENT_FILE);
	const assets: Record<ProofPlatform, Array<[string, Uint8Array]>> = { ios: [], android: [] };
	let manifest: DeviceManifest = { ios: [], android: [] };
	const appConfig = readAppConfig(dir);
	if (existsSync(component)) {
		const payloads: Partial<Record<ProofPlatform, string>> = {};
		for (const platform of PROOF_PLATFORMS) {
			const build = await compileNativeComponent({
				// Repo-relative: the scope class hashes the filename, so every checkout builds the same payload and style input.
				filename: relative(repoRoot, component),
				source: readFileSync(component, 'utf8'),
				// A rung that is a page compiles as its page file, so the router derives its route.
				...(expected.route === undefined ? {} : { page: `pages/${expected.route}.tsrx` }),
				readModule: readWorkspaceModule,
				readServedStylesheet: servedReader(dir),
				readServedFile: servedFileReader(dir),
				readAsset: assetReader,
				...(appConfig.device ? { device: appConfig.device } : {}),
				target: platform,
			});
			if (!build.payload) {
				const lines = build.diagnostics.map(
					(diagnostic) => `  ${diagnostic.code}: ${diagnostic.message}`,
				);
				throw new Error(
					`${name}: ${COMPONENT_FILE} has no ${platform} build\n${lines.join('\n')}`,
				);
			}
			manifest = build.manifest;
			payloads[platform] = JSON.stringify(build.payload);
			assets[platform].push([
				PROOF_PAYLOAD_PATH,
				new TextEncoder().encode(payloads[platform]),
			]);
			assets[platform].push(...imageAssets(build.images));
			if (
				build.styles.some((style) => style.cssText.length > 0) ||
				build.stylesheets.length > 0
			) {
				// Dragon lays out one input for both phones, so both must build the same views.
				if (
					payloads.ios !== undefined &&
					payloads.android !== undefined &&
					payloads.ios !== payloads.android
				)
					throw new Error(
						`${name}: a styled rung whose views differ per phone has no single style export yet`,
					);
				writeStyleInput(
					join(dir, STYLE_INPUT),
					nativeStyleInput(build.payload, build.styles, build.stylesheets),
					name,
				);
				if (platform === 'android') {
					const style = checkPageScroll(
						styleExport(join(dir, STYLE_INPUT), name, true),
						build,
						relative(repoRoot, component),
						name,
					);
					const fonts =
						(JSON.parse(new TextDecoder().decode(style)) as StyleExportFonts).fonts ??
						[];
					const styled = styleAssets(style, fonts, name, dir);
					assets.ios.push(...styled);
					assets.android.push(...styled);
				}
			}
		}
	} else if (existsSync(join(dir, 'pages'))) {
		const payloads: Partial<Record<ProofPlatform, string>> = {};
		for (const platform of PROOF_PLATFORMS) {
			const build = await compileRungApp(dir, {
				target: platform,
				...(appConfig.device ? { device: appConfig.device } : {}),
			});
			if (!build.payload) {
				const lines = build.diagnostics.map(
					(diagnostic) =>
						`  ${diagnostic.page}: ${diagnostic.code}: ${diagnostic.message}`,
				);
				throw new Error(`${name}: the app has no ${platform} build\n${lines.join('\n')}`);
			}
			manifest = build.manifest;
			payloads[platform] = JSON.stringify(build.payload);
			assets[platform].push([
				PROOF_PAYLOAD_PATH,
				new TextEncoder().encode(payloads[platform]),
			]);
			assets[platform].push(...imageAssets(build.images));
			if (build.styleInputs.length > 0 && platform === 'android') {
				// Dragon lays out one input for both phones, so both must build the same views.
				if (payloads.ios !== payloads.android)
					throw new Error(
						`${name}: a styled app whose views differ per phone has no single style export yet`,
					);
				const style = appStyle(dir, name, build.styleInputs);
				const styled = styleAssets(style.bytes, style.fonts, name, dir);
				assets.ios.push(...styled);
				assets.android.push(...styled);
			}
		}
	} else if (existsSync(join(dir, HAND_MADE_PAYLOAD))) {
		for (const platform of PROOF_PLATFORMS)
			assets[platform].push([PROOF_PAYLOAD_PATH, readFileSync(join(dir, HAND_MADE_PAYLOAD))]);
	} else {
		throw new Error(`${name}: ${COMPONENT_FILE} is missing`);
	}
	return {
		name,
		dir,
		flowPath,
		flow: readFileSync(flowPath, 'utf8'),
		expected,
		assets: { ios: new Map(assets.ios), android: new Map(assets.android) },
		manifest,
	};
}
