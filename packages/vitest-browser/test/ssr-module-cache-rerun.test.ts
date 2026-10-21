import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, expect, test } from 'vitest';

const run = promisify(execFile);
const packageDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageDir, '../..');
let cacheDir: string | undefined;

afterAll(async () => {
	if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

// Vitest's cross-run module cache once served a .tsrx without running its compile, and the
// second run's renderSSR then waited forever on the registrations that compile makes.
test('a renderSSR browser test passes again on a warm Vitest module cache', async () => {
	cacheDir = await mkdtemp(join(tmpdir(), 'markless-ssr-module-cache-'));
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST')),
	);
	const once = () =>
		run(
			process.execPath,
			[
				join(repoRoot, 'node_modules/vitest/vitest.mjs'),
				'run',
				'--config',
				join(packageDir, 'vitest.config.ts'),
				'--fsModuleCachePath',
				cacheDir!,
				'--testTimeout',
				'20000',
				'browser/module-cache-rerun/served-counter.test.ts',
			],
			{ cwd: packageDir, env, timeout: 120_000 },
		);

	await once();
	expect((await readdir(cacheDir)).length).toBeGreaterThan(1);
	const warm = await once();
	expect(warm.stdout).toMatch(/Tests\s+1 passed/);
}, 300_000);
