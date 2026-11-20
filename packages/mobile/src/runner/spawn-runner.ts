import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { PhoneSpec } from './pool.ts';
import { daemonLog, runnerHome } from './store.ts';

/** Starts a runner detached from the caller, logging to the runner's log; returns its pid. */
export function spawnRunner(pool: ReadonlyArray<PhoneSpec>): number | undefined {
	mkdirSync(runnerHome(), { recursive: true });
	const out = openSync(daemonLog(), 'a');
	const child = spawn(
		process.execPath,
		[join(import.meta.dirname, 'daemon.ts'), JSON.stringify(pool)],
		{ detached: true, stdio: ['ignore', out, out] },
	);
	child.unref();
	return child.pid;
}
