import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { compileNativeComponent } from '../compile.ts';
import { type ProofExpected, readProofExpected } from './expected.ts';
import { PROOF_PAYLOAD_PATH } from './proof-app.ts';

/** Files a shell carries for one rung, by path inside the iOS bundle or the APK's assets. */
export type ProofAssets = ReadonlyMap<string, Uint8Array>;

export type ProofRung = {
	readonly name: string;
	readonly dir: string;
	readonly flowPath: string;
	readonly flow: string;
	readonly expected: ProofExpected;
	readonly assets: ProofAssets;
};

const COMPONENT_FILE = 'App.tsrx';
/** A hand-made payload, only for the harness's own fixture rung that proves the machinery without the compiler. */
const HAND_MADE_PAYLOAD = 'payload.json';

/** Reads a rung folder and compiles its App.tsrx with the real compiler into the native payload both shells embed. */
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
	let payload: Uint8Array;
	if (existsSync(component)) {
		const { payload: compiled, diagnostics } = await compileNativeComponent({
			filename: component,
			source: readFileSync(component, 'utf8'),
		});
		if (!compiled || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
			const lines = diagnostics.map(
				(diagnostic) => `  ${diagnostic.code}: ${diagnostic.message}`,
			);
			throw new Error(`${name}: ${COMPONENT_FILE} has no native build\n${lines.join('\n')}`);
		}
		payload = new TextEncoder().encode(JSON.stringify(compiled));
	} else if (existsSync(join(dir, HAND_MADE_PAYLOAD))) {
		payload = readFileSync(join(dir, HAND_MADE_PAYLOAD));
	} else {
		throw new Error(`${name}: ${COMPONENT_FILE} is missing`);
	}
	return {
		name,
		dir,
		flowPath,
		flow: readFileSync(flowPath, 'utf8'),
		expected,
		assets: new Map([[PROOF_PAYLOAD_PATH, payload]]),
	};
}
