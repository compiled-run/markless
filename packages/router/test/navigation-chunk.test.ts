import { execFile } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixtureOutput = resolve(root, 'packages/router/fixtures/router/.output');

test('router navigation chunk co-locates route imports with navigation', async () => {
	await rm(fixtureOutput, { force: true, recursive: true });
	await exec('pnpm', ['--filter', '@markless/fixture-router', 'build'], {
		cwd: root,
		timeout: 120_000,
	});

	const buildDir = resolve(fixtureOutput, 'public/build');
	const chunks = await Promise.all(
		(await readdir(buildDir))
			.filter((file) => file.endsWith('.js'))
			.map(async (file) => ({ file, code: await readFile(resolve(buildDir, file), 'utf8') })),
	);
	const navigationChunks = chunks.filter(({ code }) =>
		code.includes('navigateMarklessRouterLink'),
	);

	expect(navigationChunks, 'expected exactly one router navigation entry chunk').toHaveLength(1);
	// vite-plus 0.3.0 may emit the entry as a re-export facade over a shared chunk;
	// co-location then means the route map sits in the entry's STATIC closure - one
	// fetch wave, no dynamic hop. Walk static imports rather than the entry alone.
	const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk.code]));
	const closure = new Set<string>();
	const queue = [navigationChunks[0]?.file ?? ''];
	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (closure.has(file) || !byFile.has(file)) continue;
		closure.add(file);
		for (const match of (byFile.get(file) as string).matchAll(
			/(?:from|import)\s*[`"']\.\/([^`"']+\.js)[`"']/g,
		)) {
			queue.push(match[1] as string);
		}
	}
	expect(
		[...closure].some((file) =>
			/["']\/pages\/index\.tsrx["']:\(\)=>import\([`"']\.\/chunk-[^`"']+\.js[`"']\)/.test(
				byFile.get(file) as string,
			),
		),
		`route map not in the navigation entry's static closure: ${[...closure].join(', ')}`,
	).toBe(true);
	expect(
		chunks.some(
			({ code }) =>
				code.includes('__marklessRouterLink') &&
				!code.includes('navigateMarklessRouterLink'),
		),
		'the shared runtime marker must not be mistaken for the navigation entry',
	).toBe(true);
}, 120_000);
