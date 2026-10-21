#!/usr/bin/env node
// Runs compiled-run/markless-ecosystem-ci against this checkout; the suites and the runner live in that repo.
// usage: node scripts/ci/ecosystem-ci.mjs <build|run|compare|list> [ecosystem-ci options]

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repository =
	process.env.MARKLESS_ECOSYSTEM_CI_REPO ??
	'https://github.com/compiled-run/markless-ecosystem-ci.git';
const ref = process.env.MARKLESS_ECOSYSTEM_CI_REF ?? 'main';
const ecosystem = resolve(process.env.MARKLESS_ECOSYSTEM_CI_DIR ?? join(repoRoot, '.ecosystem-ci'));

const git = (...args) => {
	const result = spawnSync('git', args, { cwd: ecosystem, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
};

if (!process.env.MARKLESS_ECOSYSTEM_CI_DIR) {
	if (!existsSync(join(ecosystem, '.git'))) {
		spawnSync('mkdir', ['-p', ecosystem]);
		git('init', '-q');
		git('remote', 'add', 'origin', repository);
	}
	git('fetch', '-q', '--depth', '1', 'origin', ref);
	git('checkout', '-q', '--force', 'FETCH_HEAD');
}

const args = process.argv.slice(2);
const builds = args[0] === 'run' || args[0] === 'build';
const chosen = args.some((arg) => arg === '--ref' || arg === '--markless-dir');
const result = spawnSync(
	process.execPath,
	[
		join(ecosystem, 'ecosystem-ci.ts'),
		...args,
		...(builds && !chosen ? ['--markless-dir', repoRoot] : []),
	],
	{ stdio: 'inherit' },
);
process.exit(result.status ?? 1);
