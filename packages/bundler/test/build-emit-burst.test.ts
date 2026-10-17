import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';

const exec = promisify(execFile);
const buildScript = resolve(import.meta.dirname, 'helpers/build-emit-burst.ts');
const workDirs: string[] = [];
afterAll(() => Promise.all(workDirs.map((path) => rm(path, { force: true, recursive: true }))));

// A deadlocked build blocks its own main thread, so only a parent process can time it out.
async function buildWithin(mode: 'emit' | 'component', count: number, timeout: number) {
	const workDir = await mkdtemp(join(tmpdir(), 'markless-emit-burst-'));
	workDirs.push(workDir);
	const { stdout } = await exec(process.execPath, [buildScript, mode, workDir, String(count)], {
		timeout,
		killSignal: 'SIGKILL',
	});
	return stdout;
}

// vite-plus 0.1.x bundled a Rolldown whose emitFile blocked forever once about 1,024 chunks were
// queued from hooks, which is how large Markless components stalled every build.
test('the pinned Vite build drains more emitted chunks than the old 1,024 queue held', async () => {
	expect(await buildWithin('emit', 2_000, 60_000)).toContain('built');
}, 90_000);

test('a component with 150 unrolled rows of computeds and handlers builds without stalling', async () => {
	expect(await buildWithin('component', 150, 120_000)).toContain('built');
}, 150_000);
