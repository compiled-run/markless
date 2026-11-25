import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The folder name every test run's temp folder starts with, then the run's pid. */
export const RUN_TEMP_PREFIX = 'markless-test-run-';

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/**
 * A temp folder for one test run under `root`, removed by `release`. Folders that runs which died
 * before their teardown left under `root` are removed first.
 */
export function holdRunTempDir(root: string): { readonly dir: string; release(): void } {
	for (const name of readdirSync(root)) {
		if (!name.startsWith(RUN_TEMP_PREFIX)) continue;
		const pid = Number.parseInt(name.slice(RUN_TEMP_PREFIX.length), 10);
		if (Number.isInteger(pid) && pid !== process.pid && !alive(pid))
			rmSync(join(root, name), { recursive: true, force: true });
	}
	const dir = mkdtempSync(join(root, `${RUN_TEMP_PREFIX}${process.pid}-`));
	return { dir, release: () => rmSync(dir, { recursive: true, force: true }) };
}

interface Held {
	readonly dir: string;
	readonly outer: string | undefined;
	readonly release: () => void;
	users: number;
}

const HELD = Symbol.for('markless.test-run-temp-dir');

/**
 * Vitest global setup: every temp folder a test, or a process it starts, makes through TMPDIR lands in
 * this run's folder, which teardown removes. Projects of one run share the folder.
 */
export default function setup(): () => void {
	const store = globalThis as { [HELD]?: Held };
	let held = store[HELD];
	if (!held) {
		const outer = process.env.TMPDIR;
		const run = holdRunTempDir(tmpdir());
		held = { dir: run.dir, outer, release: run.release, users: 0 };
		store[HELD] = held;
		process.env.TMPDIR = run.dir;
	}
	held.users += 1;
	const mine = held;
	return () => {
		mine.users -= 1;
		if (mine.users > 0) return;
		delete store[HELD];
		if (mine.outer === undefined) delete process.env.TMPDIR;
		else process.env.TMPDIR = mine.outer;
		mine.release();
	};
}
