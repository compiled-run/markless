import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { markless } from '@markless/core/vite';
import { router } from '@markless/router/vite';
import type { UserConfig } from 'vite';

// Reads .git directly: the git binary is not guaranteed to be runnable on every build host.
function gitShortCommit(start: string): string {
	let dir = start;
	while (!existsSync(join(dir, '.git'))) {
		const parent = dirname(dir);
		if (parent === dir) throw new Error('BENCHMARK_BUILD_ID is unset and no git checkout was found');
		dir = parent;
	}
	let gitDir = join(dir, '.git');
	if (statSync(gitDir).isFile()) {
		gitDir = resolve(dir, readFileSync(gitDir, 'utf8').replace(/^gitdir:\s*/, '').trim());
	}
	const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
	if (!head.startsWith('ref: ')) return head.slice(0, 7);
	const ref = head.slice(5);
	const commonDir = existsSync(join(gitDir, 'commondir'))
		? resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim())
		: gitDir;
	for (const base of [gitDir, commonDir]) {
		if (existsSync(join(base, ref))) return readFileSync(join(base, ref), 'utf8').trim().slice(0, 7);
	}
	const packed = readFileSync(join(commonDir, 'packed-refs'), 'utf8')
		.split('\n')
		.find((line) => line.endsWith(` ${ref}`));
	if (!packed) throw new Error(`cannot resolve git ref ${ref}`);
	return packed.slice(0, 7);
}

const buildId = process.env.BENCHMARK_BUILD_ID || gitShortCommit(import.meta.dirname);

export default {
	define: {
		'import.meta.env.BENCHMARK_BUILD_ID': JSON.stringify(buildId),
	},
	plugins: [markless(), router()],
} satisfies UserConfig;
