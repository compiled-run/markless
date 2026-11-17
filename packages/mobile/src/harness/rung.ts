import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { LadderRung } from '../../proofs/ladder.ts';
import { compileNativeComponent } from '../compile.ts';
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
};

const COMPONENT_FILE = 'App.tsrx';
/** A hand-made payload, only for the harness's own fixture rungs that prove the machinery without the compiler. */
const HAND_MADE_PAYLOAD = 'payload.json';
/** Written here for Dragon; Dragon's export comes back as STYLE_EXPORT, committed with the rung. */
const STYLE_INPUT = 'native-style-input.json';
const STYLE_EXPORT = 'native-style.json';

type StyleExportFonts = {
	readonly fonts?: ReadonlyArray<{ readonly id: string; readonly file: string }>;
};

/** The style export and every font face it names, checked against the face's `sha256:` id. */
function styleAssets(dir: string, name: string): Array<[string, Uint8Array]> {
	const exportPath = join(dir, STYLE_EXPORT);
	const bytes = readFileSync(exportPath);
	const assets: Array<[string, Uint8Array]> = [[PROOF_STYLE_PATH, bytes]];
	const fonts = (JSON.parse(bytes.toString('utf8')) as StyleExportFonts).fonts ?? [];
	const dragon = process.env.MARKLESS_DRAGON_DIR;
	if (fonts.length > 0 && !dragon) {
		throw new Error(
			`${name}: ${STYLE_EXPORT} names fonts; set MARKLESS_DRAGON_DIR to the Dragon checkout it came from`,
		);
	}
	for (const font of fonts) {
		const file = resolve(dragon!, font.file);
		if (!existsSync(file)) {
			throw new Error(
				`${name}: font ${font.id} is not at ${file}; MARKLESS_DRAGON_DIR must be the Dragon checkout the export came from`,
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
	if (existsSync(component)) {
		const build = await compileNativeComponent({
			filename: component,
			source: readFileSync(component, 'utf8'),
			// A rung that is a page compiles as its page file, so the router derives its route.
			...(expected.route === undefined ? {} : { page: `pages/${expected.route}.tsrx` }),
		});
		if (!build.payload) {
			const lines = build.diagnostics.map(
				(diagnostic) => `  ${diagnostic.code}: ${diagnostic.message}`,
			);
			throw new Error(`${name}: ${COMPONENT_FILE} has no native build\n${lines.join('\n')}`);
		}
		assets.push([PROOF_PAYLOAD_PATH, new TextEncoder().encode(JSON.stringify(build.payload))]);
		if (build.styles.some((style) => style.cssText.length > 0)) {
			writeFileSync(
				join(dir, STYLE_INPUT),
				`${JSON.stringify(nativeStyleInput(build.payload, build.styles), null, '\t')}\n`,
			);
			if (!existsSync(join(dir, STYLE_EXPORT))) {
				throw new Error(
					`${name}: the component has styles but no ${STYLE_EXPORT}; run Dragon's export on ${STYLE_INPUT}`,
				);
			}
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
	};
}
