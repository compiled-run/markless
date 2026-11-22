import { join } from 'node:path';
import { expect, test } from 'vitest';
import { PROOF_PAYLOAD_PATH, PROOF_STYLE_PATH, stylesShapeText } from '../src/harness/proof-app.ts';
import { compileRungApp } from '../src/harness/rung.ts';

const proof = (folder: string) => join(import.meta.dirname, '..', 'proofs', folder);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const style = (planRepeats: unknown[]) => bytes({ targets: { android: { routes: [{ planRepeats }] } } });

test("an APK carries Dragon's text shaper when its styles lay rows out, or a page text that follows state", async () => {
	const growing = (await compileRungApp(proof('s30-growing-text'))).payload!;
	const fixed = (await compileRungApp(proof('s20-styled-arms'))).payload!;
	const app = (payload: unknown, planRepeats: unknown[] = []) =>
		new Map([
			[PROOF_STYLE_PATH, style(planRepeats)],
			[PROOF_PAYLOAD_PATH, bytes(payload)],
		]);
	expect(stylesShapeText(app(growing))).toBe(true);
	expect(stylesShapeText(app(fixed, [{ id: 'repeat:0' }]))).toBe(true);
	expect(stylesShapeText(app(fixed))).toBe(false);
	expect(stylesShapeText(new Map([[PROOF_PAYLOAD_PATH, bytes(growing)]]))).toBe(false);
});
