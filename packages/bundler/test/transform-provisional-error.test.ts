import { expect, test, vi } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import { callTransform } from './helpers.ts';

// The provisional compile is a recovery attempt inside the transform's catch
// block. No real source makes it throw — it collects diagnostics rather than
// failing closed — so the only honest way to reach the guard is to make it
// throw here.
vi.mock('@markless/compiler', async (importOriginal) => ({
	...(await importOriginal<typeof import('@markless/compiler')>()),
	compileTsrxModuleLinkArtifact: () => {
		throw new Error('PROVISIONAL_LINK_ARTIFACT_FAILED');
	},
}));

test('a failing provisional compile never masks the transform diagnostic', async () => {
	const filename = '/workspace/app/src/Broken.tsrx';
	const source = `import { state } from '@markless/core';
export function Broken( @{ <p>x</p> }`;

	let caught: unknown;
	try {
		await callTransform(marklessClient(), source, filename, { resolve: vi.fn() });
	} catch (error) {
		caught = error;
	}

	expect(String((caught as Error | undefined)?.message)).toContain('MARKLESS_COMPILE_BLOCKED');
	expect(String((caught as Error | undefined)?.message)).not.toContain(
		'PROVISIONAL_LINK_ARTIFACT_FAILED',
	);
});
