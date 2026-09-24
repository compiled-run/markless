import { resolve } from 'pathe';
import { build as viteBuild } from 'vite';
import { expect, test } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';

const fixture = resolve(import.meta.dirname, 'fixtures/nested-child-compile-error');
const root = resolve(import.meta.dirname, '..');

function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`build did not settle within ${ms}ms`)), ms),
		),
	]);
}

test('a compile error two modules below the entry fails the build with its diagnostic', async () => {
	const build = viteBuild({
		configFile: false,
		root,
		logLevel: 'silent',
		plugins: [marklessClient({ executionLog: 'never', rootDir: root })],
		build: {
			write: false,
			rolldownOptions: {
				input: resolve(fixture, 'page.tsrx'),
				preserveEntrySignatures: 'exports-only',
			},
		},
	});
	await expect(settleWithin(build, 20_000)).rejects.toThrow('MARKLESS_CAPTURE_OPAQUE_PROP');
}, 30_000);
