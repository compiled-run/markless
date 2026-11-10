import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import type { markless } from '@markless/bundler/vite';

/** The JSON-serializable part of a fixture's `createBuilder` config; `markless()` and `router()` are always the plugins. */
export type FixtureBuild = {
	readonly root: string;
	readonly markless?: Parameters<typeof markless>[0];
	readonly nitro?: Record<string, unknown>;
	readonly build?: Record<string, unknown>;
};

const child = resolve(import.meta.dirname, 'fixture-build-child.ts');
// Each build peaks near 0.6 GB; files that start several at once across nine workers would stack them.
const BUILD_SLOTS = 3;
const slotsDir = resolve(
	tmpdir(),
	`markless-fixture-builds-${createHash('sha256').update(child).digest('hex').slice(0, 16)}`,
);

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

async function acquireSlot(): Promise<string> {
	await mkdir(slotsDir, { recursive: true });
	for (;;) {
		for (let index = 0; index < BUILD_SLOTS; index++) {
			const slot = join(slotsDir, String(index));
			try {
				await mkdir(slot);
				await writeFile(join(slot, 'pid'), String(process.pid));
				return slot;
			} catch {
				// A worker killed mid-build leaves its slot behind.
				const holder = Number(await readFile(join(slot, 'pid'), 'utf8').catch(() => ''));
				if (holder && !alive(holder)) await rm(slot, { recursive: true, force: true });
			}
		}
		await new Promise((settle) => setTimeout(settle, 50));
	}
}

/**
 * Runs `createBuilder(...).buildApp()` in a child process that exits once the app is built, so the
 * test worker does not hold the build's memory for the rest of the file. The child inherits the
 * caller's current environment, NODE_ENV included.
 */
export async function buildFixture(build: FixtureBuild): Promise<void> {
	const config = JSON.stringify(build, (key, value: unknown) => {
		if (typeof value === 'function')
			throw new TypeError(
				`buildFixture options cross a process boundary as JSON; "${key}" is a function`,
			);
		return value;
	});
	const slot = await acquireSlot();
	try {
		await new Promise<void>((done, fail) => {
			const proc = spawn(process.execPath, [child, config], {
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let output = '';
			proc.stdout.on('data', (chunk: Buffer) => (output += chunk));
			proc.stderr.on('data', (chunk: Buffer) => (output += chunk));
			proc.once('error', fail);
			proc.once('exit', (code, signal) =>
				code === 0
					? done()
					: fail(new Error(`fixture build of ${build.root} failed (${code ?? signal}):\n${output}`)),
			);
		});
	} finally {
		await rm(slot, { recursive: true, force: true });
	}
}
