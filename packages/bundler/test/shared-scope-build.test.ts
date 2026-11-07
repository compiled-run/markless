import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearCompileCache } from '@markless/compiler';
import { rolldown } from 'rolldown';
import { afterEach, expect, test } from 'vitest';
import { marklessServer } from '../src/rolldown.ts';

afterEach(() => clearCompileCache());

const page = (scope: string) => `import { shared, state } from '@markless/core';
export const session = shared(() => {
	const data = state({ status: 'anonymous' });
	return { ...data };
}, { scope: '${scope}' });
export default function Page() @{
	const current = session();
	<output>{current.status}</output>
}`;

async function build(scope: string) {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'markless-shared-scope-')));
	try {
		await writeFile(join(directory, 'Page.tsrx'), page(scope));
		await writeFile(join(directory, 'entry.js'), `export { default } from './Page.tsrx';\n`);
		const bundle = await rolldown({
			input: join(directory, 'entry.js'),
			external: [/^@markless\//],
			plugins: [marklessServer({ rootDir: directory })],
		});
		try {
			await bundle.generate({ format: 'es' });
		} finally {
			await bundle.close();
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test.each([
	['request', 'app'],
	['page', 'app'],
	['widget', 'subtree'],
])('a shared() with the old scope "%s" fails the build and names "%s"', async (old, next) => {
	await expect(build(old)).rejects.toThrow(
		new RegExp(`MARKLESS_SHARED_SCOPE_INVALID[\\s\\S]*shared\\(\\) scope "${old}" is now "${next}"`),
	);
});

test.each(['app', 'container', 'subtree'])('a shared() with scope "%s" builds', async (scope) => {
	await expect(build(scope)).resolves.toBeUndefined();
});
