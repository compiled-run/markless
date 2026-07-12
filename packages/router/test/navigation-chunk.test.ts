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
	expect(navigationChunks[0]?.code).toMatch(
		/["']\/pages\/index\.tsrx["']:\(\)=>import\([`"']\.\/chunk-[^`"']+\.js[`"']\)/,
	);
	expect(
		chunks.some(
			({ code }) =>
				code.includes('__marklessRouterLink') &&
				!code.includes('navigateMarklessRouterLink'),
		),
		'the shared runtime marker must not be mistaken for the navigation entry',
	).toBe(true);
}, 120_000);
