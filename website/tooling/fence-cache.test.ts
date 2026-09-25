import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createFenceInputs, openFenceCache, recordRead } from './fence-cache.ts';
import { createFencePool } from './fence-pool.ts';
import { replaceFences } from './highlight-code.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

// Under the test runner's resolve conditions shiki loads a wasm build Node cannot run, so this renders in a plain child.
function renderInProcess(html: string): string {
	const script = `import { highlightFencesInProcess } from ${JSON.stringify(new URL('./highlight-code.ts', import.meta.url).href)};
process.stdout.write(await highlightFencesInProcess(${JSON.stringify(html)}));`;
	return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	});
}

function temporaryDirectory(): string {
	const dir = mkdtempSync(join(tmpdir(), 'markless-fence-cache-'));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

test('an entry holds only while every recorded input still matches the disk', () => {
	const dir = temporaryDirectory();
	const read = join(dir, 'read.d.ts');
	const missing = join(dir, 'missing.d.ts');
	writeFileSync(read, 'export declare const a: 1;');
	const inputs = createFenceInputs();
	recordRead(inputs, read, 'export declare const a: 1;');
	inputs.isFile.set(missing, false);

	openFenceCache(join(dir, 'cache')).store('key', '<pre>one</pre>', inputs);
	expect(openFenceCache(join(dir, 'cache')).lookup('key')).toBe('<pre>one</pre>');

	writeFileSync(read, 'export declare const a: 2;');
	expect(openFenceCache(join(dir, 'cache')).lookup('key')).toBeUndefined();
	writeFileSync(read, 'export declare const a: 1;');
	expect(openFenceCache(join(dir, 'cache')).lookup('key')).toBe('<pre>one</pre>');

	// A file that appears where resolution once found nothing can change what a fence resolves to.
	writeFileSync(missing, '');
	expect(openFenceCache(join(dir, 'cache')).lookup('key')).toBeUndefined();
});

test('a session that read one file twice with different contents is never stored', () => {
	const dir = temporaryDirectory();
	const inputs = createFenceInputs();
	recordRead(inputs, join(dir, 'a.ts'), 'one');
	recordRead(inputs, join(dir, 'a.ts'), 'two');
	openFenceCache(join(dir, 'cache')).store('key', '<pre></pre>', inputs);
	expect(openFenceCache(join(dir, 'cache')).lookup('key')).toBeUndefined();
});

test('worker-rendered fences match the in-process renderer and follow edits to the types they read', async () => {
	const cacheDir = temporaryDirectory();
	const fixture = new URL(`./fence-cache-fixture-${process.pid}.ts`, import.meta.url);
	cleanups.push(() => rmSync(fixture, { force: true }));
	const declare = (doc: string) =>
		writeFileSync(
			fixture,
			`/** ${doc} */\nexport function fixtureValue(): number {\n\treturn 1;\n}\n`,
		);
	const name = fixture.pathname.split('/').pop()!;
	const html = `<p>x</p><pre><code class="language-tsrx">import { fixtureValue } from './tooling/${name}';
fixtureValue();</code></pre><pre><code class="language-css">a { color: red; }</code></pre><pre><code class="language-nope">?</code></pre>`;
	const render = (pool: ReturnType<typeof createFencePool>) => replaceFences(html, pool.render);

	declare('First wording.');
	const cold = await render(createFencePool({ cacheDir, workers: 2 }));
	expect(cold).toBe(renderInProcess(html));
	expect(cold).toContain('First wording.');
	expect(cold).toContain('<pre><code class="language-nope">?</code></pre>');
	const stored = readdirSync(join(cacheDir, 'entries')).length;
	expect(stored).toBe(3);

	expect(await render(createFencePool({ cacheDir, workers: 1 }))).toBe(cold);

	declare('Second wording.');
	const edited = await render(createFencePool({ cacheDir, workers: 1 }));
	expect(edited).toContain('Second wording.');
	expect(edited).not.toContain('First wording.');
}, 60000);
