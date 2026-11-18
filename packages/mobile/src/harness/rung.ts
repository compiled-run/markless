import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { LadderRung } from '../../proofs/ladder.ts';
import { nativeAppStyle, nativeAppStyleSize, type DragonStyleExport } from '../app-style.ts';
import { compileNativeApp, compileNativeComponent, type NativeAppBuild } from '../compile.ts';
import type { DeviceAppConfig, DeviceManifest } from '../permissions.ts';
import { dragonDir, dragonStyleExport } from '../style-export.ts';
import { nativeStyleInput } from '../style-input.ts';
import { readProofExpected } from './expected.ts';
import {
	PROOF_FONTS_FOLDER,
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

/** The app config, one per app, beside the app's rung folders: `{ "device": { "usage": { "<feature>": "<text>" } } }`. */
const APP_CONFIG = 'app.json';

/** The config of the app a rung folder belongs to; empty when the app has none. */
export function readAppConfig(rungDir: string): { readonly device?: DeviceAppConfig } {
	const file = join(dirname(rungDir), APP_CONFIG);
	return existsSync(file)
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

/** The app's document, when the rung has its own (`document.tsrx`, whose stylesheet imports reach every page). */
const APP_DOCUMENT = 'document.tsrx';

/** Compiles a navigation rung's app: every page under `pages/`, with repo-relative filenames as for one-screen rungs. */
export function compileRungApp(dir: string) {
	const document = join(dir, APP_DOCUMENT);
	return compileNativeApp({
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
		readModule: readRelativeModule,
		readStylesheet: readRelativeStylesheet,
	});
}

/** A hand-made payload, only for the harness's own fixture rungs that prove the machinery without the compiler. */
const HAND_MADE_PAYLOAD = 'payload.json';
/** Written here for Dragon, which turns it into the style export at proof time (DRAGON_DIR, `../style-export.ts`). */
const STYLE_INPUT = 'native-style-input.json';

type StyleExportFonts = {
	readonly fonts?: ReadonlyArray<{ readonly id: string; readonly file: string }>;
};

/** Dragon's export for one style input file, or the rung's refusal naming Dragon's reasons. */
function styleExport(inputPath: string, name: string): Uint8Array {
	try {
		return dragonStyleExport(inputPath, dragonDir());
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
	const pages = inputs.map(({ pattern, page, input }) => {
		const file = join(
			dir,
			APP_STYLE_INPUTS,
			`${relative('pages', page).slice(0, -'.tsrx'.length)}.json`,
		);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify(input, null, '\t')}\n`);
		const exported = JSON.parse(
			new TextDecoder().decode(styleExport(file, name)),
		) as DragonStyleExport;
		return { pattern, exported };
	});
	const style = nativeAppStyle(pages);
	writeFileSync(
		join(dir, STYLE_SIZE),
		`${JSON.stringify(nativeAppStyleSize(pages, style), null, '\t')}\n`,
	);
	return new TextEncoder().encode(JSON.stringify(style));
}

/** The style file and every font face it names, checked against the face's `sha256:` id. */
function styleAssets(bytes: Uint8Array, name: string): Array<[string, Uint8Array]> {
	const dragon = dragonDir();
	const assets: Array<[string, Uint8Array]> = [[PROOF_STYLE_PATH, bytes]];
	const fonts = (JSON.parse(new TextDecoder().decode(bytes)) as StyleExportFonts).fonts ?? [];
	for (const font of fonts) {
		const file = resolve(dragon, font.file);
		if (!existsSync(file)) {
			throw new Error(
				`${name}: font ${font.id} is not at ${file} in the Dragon checkout ${dragon}`,
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
				readModule: readRelativeModule,
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
			if (build.styles.some((style) => style.cssText.length > 0)) {
				// Dragon lays out one input for both phones, so both must build the same views.
				if (
					payloads.ios !== undefined &&
					payloads.android !== undefined &&
					payloads.ios !== payloads.android
				)
					throw new Error(
						`${name}: a styled rung whose views differ per phone has no single style export yet`,
					);
				writeFileSync(
					join(dir, STYLE_INPUT),
					`${JSON.stringify(nativeStyleInput(build.payload, build.styles), null, '\t')}\n`,
				);
				if (platform === 'android') {
					const styled = styleAssets(styleExport(join(dir, STYLE_INPUT), name), name);
					assets.ios.push(...styled);
					assets.android.push(...styled);
				}
			}
		}
	} else if (existsSync(join(dir, 'pages'))) {
		const build = await compileRungApp(dir);
		if (!build.payload) {
			const lines = build.diagnostics.map(
				(diagnostic) => `  ${diagnostic.page}: ${diagnostic.code}: ${diagnostic.message}`,
			);
			throw new Error(`${name}: the app has no native build\n${lines.join('\n')}`);
		}
		const styled =
			build.styleInputs.length > 0
				? styleAssets(appStyle(dir, name, build.styleInputs), name)
				: [];
		for (const platform of PROOF_PLATFORMS)
			assets[platform].push(
				[PROOF_PAYLOAD_PATH, new TextEncoder().encode(JSON.stringify(build.payload))],
				...styled,
			);
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
