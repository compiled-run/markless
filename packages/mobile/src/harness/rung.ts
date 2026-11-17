import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { LadderRung } from '../../proofs/ladder.ts';
import { compileNativeComponent } from '../compile.ts';
import type { DeviceAppConfig, DeviceManifest } from '../permissions.ts';
import { dragonDir, dragonStyleExport } from '../style-export.ts';
import { nativeStyleInput } from '../style-input.ts';
import { readProofExpected } from './expected.ts';
import { PROOF_FONTS_FOLDER, PROOF_PAYLOAD_PATH, PROOF_STYLE_PATH } from './proof-app.ts';

/** Files a shell carries for one rung, by path inside the iOS bundle or the APK's assets. */
export type ProofAssets = ReadonlyMap<string, Uint8Array>;

export type ProofRung = {
	readonly name: string;
	readonly dir: string;
	readonly flowPath: string;
	readonly flow: string;
	readonly expected: LadderRung;
	readonly assets: ProofAssets;
	/** The Info.plist and AndroidManifest.xml entries the build derived from the device features the rung uses. */
	readonly manifest: DeviceManifest;
};

/** A rung's app config, when it has one: `{ "device": { "usage": { "<feature>": "<text>" } } }`. */
const APP_CONFIG = 'app.json';

const COMPONENT_FILE = 'App.tsrx';
const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..');

/** Reads a module a rung imports by relative path (`./Stepper.tsrx`), so the build can lower its components in place. */
export function readRelativeModule(specifier: string, importer: string) {
	const file = resolve(repoRoot, dirname(importer), specifier);
	return existsSync(file)
		? { filename: relative(repoRoot, file), source: readFileSync(file, 'utf8') }
		: undefined;
}
/** A hand-made payload, only for the harness's own fixture rungs that prove the machinery without the compiler. */
const HAND_MADE_PAYLOAD = 'payload.json';
/** Written here for Dragon, which turns it into the style export at proof time (DRAGON_DIR, `../style-export.ts`). */
const STYLE_INPUT = 'native-style-input.json';

type StyleExportFonts = {
	readonly fonts?: ReadonlyArray<{ readonly id: string; readonly file: string }>;
};

/** The style export and every font face it names, checked against the face's `sha256:` id. */
function styleAssets(dir: string, name: string): Array<[string, Uint8Array]> {
	const dragon = dragonDir();
	let bytes: Uint8Array;
	try {
		bytes = dragonStyleExport(join(dir, STYLE_INPUT), dragon);
	} catch (error) {
		throw new Error(
			`${name}: the component has styles, and its style export could not be made: ${(error as Error).message}`,
		);
	}
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
	const assets: Array<[string, Uint8Array]> = [];
	let manifest: DeviceManifest = { ios: [], android: [] };
	const appConfig = existsSync(join(dir, APP_CONFIG))
		? (JSON.parse(readFileSync(join(dir, APP_CONFIG), 'utf8')) as {
				readonly device?: DeviceAppConfig;
			})
		: {};
	if (existsSync(component)) {
		const build = await compileNativeComponent({
			// Repo-relative: the scope class hashes the filename, so every checkout builds the same payload and style input.
			filename: relative(repoRoot, component),
			source: readFileSync(component, 'utf8'),
			// A rung that is a page compiles as its page file, so the router derives its route.
			...(expected.route === undefined ? {} : { page: `pages/${expected.route}.tsrx` }),
			readModule: readRelativeModule,
			...(appConfig.device ? { device: appConfig.device } : {}),
		});
		if (!build.payload) {
			const lines = build.diagnostics.map(
				(diagnostic) => `  ${diagnostic.code}: ${diagnostic.message}`,
			);
			throw new Error(`${name}: ${COMPONENT_FILE} has no native build\n${lines.join('\n')}`);
		}
		manifest = build.manifest;
		assets.push([PROOF_PAYLOAD_PATH, new TextEncoder().encode(JSON.stringify(build.payload))]);
		if (build.styles.some((style) => style.cssText.length > 0)) {
			writeFileSync(
				join(dir, STYLE_INPUT),
				`${JSON.stringify(nativeStyleInput(build.payload, build.styles), null, '\t')}\n`,
			);
			assets.push(...styleAssets(dir, name));
		}
	} else if (existsSync(join(dir, HAND_MADE_PAYLOAD))) {
		assets.push([PROOF_PAYLOAD_PATH, readFileSync(join(dir, HAND_MADE_PAYLOAD))]);
	} else {
		throw new Error(`${name}: ${COMPONENT_FILE} is missing`);
	}
	return {
		name,
		dir,
		flowPath,
		flow: readFileSync(flowPath, 'utf8'),
		expected,
		assets: new Map(assets),
		manifest,
	};
}
