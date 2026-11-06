import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearCompileCache } from '@markless/compiler';
import { rolldown } from 'rolldown';
import { afterEach, expect, test } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import type { MarklessRolldownOptions } from '../src/types.ts';

afterEach(() => clearCompileCache());

const ASYNC_PAGE = `import { computed, state } from '@markless/core';
export default function Page() @{
	let id = state(1);
	const quote = computed(async () => ({ text: String(id) }));
	<main>
		@try {
			<p>{quote.text}</p>
		} @pending {
			<p>Loading</p>
		}
	</main>
}`;

const PLAIN_PAGE = `import { state } from '@markless/core';
export default function Page() @{
	let count = state(0);
	<button onClick={() => count++}>{count}</button>
}`;

async function build(page: string, resumeCache: MarklessRolldownOptions['resumeCache']): Promise<string> {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'markless-kept-answers-')));
	try {
		await writeFile(join(directory, 'Page.tsrx'), page);
		await writeFile(join(directory, 'entry.js'), `export { default } from './Page.tsrx';\n`);
		const bundle = await rolldown({
			input: join(directory, 'entry.js'),
			external: [/^@markless\//],
			plugins: [marklessClient({ rootDir: directory, resumeCache })],
		});
		try {
			const { output } = await bundle.generate({ format: 'es' });
			return output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n');
		} finally {
			await bundle.close();
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test('a page serving an async value installs the resume cache with its exclude list', async () => {
	const code = await build(ASYNC_PAGE, { exclude: ['quo*'] });
	expect(code).toContain('@markless/web/fns/resume-cache');
	expect(code).toContain('installMarklessResumeCache(["quo*"])');
	expect(code).toMatch(/"buildHash":\s*"[0-9a-z]+"/);
});

test('resumeCache: false, or no async value on the page, emits no cache code', async () => {
	expect(await build(ASYNC_PAGE, false)).not.toContain('@markless/web/fns/resume-cache');
	expect(await build(PLAIN_PAGE, { exclude: [] })).not.toContain('@markless/web/fns/resume-cache');
});

test('an exclude entry that names no async computed fails the build', async () => {
	await expect(build(ASYNC_PAGE, { exclude: ['quotes'] })).rejects.toThrow(
		/MARKLESS_RESUME_CACHE_EXCLUDE_UNMATCHED: resumeCache.exclude entry "quotes".*Nearest names: quote/,
	);
});
