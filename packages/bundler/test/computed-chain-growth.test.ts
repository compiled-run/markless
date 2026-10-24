import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';

const exec = promisify(execFile);
const buildScript = resolve(import.meta.dirname, 'helpers/build-computed-chain.ts');
const workDirs: string[] = [];
afterAll(() => Promise.all(workDirs.map((path) => rm(path, { force: true, recursive: true }))));

async function builtBytes(levels: number): Promise<number> {
	const workDir = await mkdtemp(join(tmpdir(), 'markless-computed-chain-'));
	workDirs.push(workDir);
	// The benchmark's shape at any depth: one state owner every ten levels, each read at its own level.
	const owners = Array.from({ length: levels / 10 }, (_, index) => index * 10 + 1).join(',');
	const { stdout } = await exec(process.execPath, [buildScript, workDir, String(levels), owners], {
		timeout: 240_000,
		killSignal: 'SIGKILL',
	});
	return JSON.parse(stdout.trim().split('\n').at(-1)!).bytes;
}

// Each component level binds the symbols of the levels below it. When a level re-encoded the ids of
// the level below, the bytes grew with the square of the depth: 100 levels built 2.19 MB.
test('a chain twice as deep builds about twice the JavaScript, not four times', async () => {
	const half = await builtBytes(50);
	const full = await builtBytes(100);
	expect(full / half).toBeLessThan(2.3);
}, 600_000);
