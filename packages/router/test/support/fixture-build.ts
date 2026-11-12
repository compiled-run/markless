import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir, totalmem } from 'node:os';
import { join, resolve } from 'pathe';
import type { markless } from '@markless/bundler/vite';

/** The JSON-serializable part of a fixture's `createBuilder` config. */
export type FixtureBuild = {
	readonly root: string;
	/** The fixture's own Vite config; without it the plugins are `markless()` and `router()`. */
	readonly configFile?: string;
	readonly markless?: Parameters<typeof markless>[0];
	readonly nitro?: Record<string, unknown>;
	readonly build?: Record<string, unknown>;
	/** Kills the build and rejects with a `stalled` error once it runs this long. */
	readonly stallMs?: number;
};

/** A failed fixture build: the build's own message, and each message of an aggregate. */
export type FixtureBuildError = Error & { readonly errors?: readonly Error[] };

const child = resolve(import.meta.dirname, 'fixture-build-child.ts');
// CI attribution measured builds at up to 2.8 GB each; a 16 GB runner holds one at a time.
const BUILD_SLOTS = Math.min(3, Math.max(1, Math.floor(totalmem() / 12 / 2 ** 30)));
const slotsDir = resolve(
	tmpdir(),
	`markless-fixture-builds-${createHash('sha256').update(child).digest('hex').slice(0, 16)}`,
);
const HELD_FOR_FILE = 'file';

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

const heldByThisFile = async (): Promise<boolean> => {
	for (const slot of await readdir(slotsDir).catch(() => [])) {
		const [pid, held] = await Promise.all([
			readFile(join(slotsDir, slot, 'pid'), 'utf8').catch(() => ''),
			readFile(join(slotsDir, slot, 'held'), 'utf8').catch(() => ''),
		]);
		if (Number(pid) === process.pid && held === HELD_FOR_FILE) return true;
	}
	return false;
};

async function acquireSlot(held = ''): Promise<string> {
	await mkdir(slotsDir, { recursive: true });
	for (;;) {
		for (let index = 0; index < BUILD_SLOTS; index++) {
			const slot = join(slotsDir, String(index));
			try {
				await mkdir(slot);
				await writeFile(join(slot, 'pid'), String(process.pid));
				if (held) await writeFile(join(slot, 'held'), held);
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
 * Takes a build slot until the returned release runs, for a test file that builds in its own
 * process: Rolldown keeps a build's memory until the process exits, so the slot covers the file.
 */
export async function holdBuildSlot(): Promise<() => Promise<void>> {
	const slot = await acquireSlot(HELD_FOR_FILE);
	return () => rm(slot, { recursive: true, force: true });
}

const failure = (build: FixtureBuild, report: string, output: string, exit: string) => {
	if (!report) return new Error(`fixture build of ${build.root} failed (${exit}):\n${output}`);
	const { message, errors } = JSON.parse(report) as { message: string; errors?: string[] };
	return Object.assign(new Error(message), {
		...(errors && { errors: errors.map((entry) => new Error(entry)) }),
	}) as FixtureBuildError;
};

/**
 * Runs `createBuilder(...).buildApp()` in a child process that exits once the app is built, so the
 * test worker does not hold the build's memory for the rest of the file. The child inherits the
 * caller's current environment, NODE_ENV included. A failed build rejects with the build's message.
 */
export async function buildFixture(build: FixtureBuild): Promise<void> {
	const config = JSON.stringify(build, (key, value: unknown) => {
		if (typeof value === 'function')
			throw new TypeError(
				`buildFixture options cross a process boundary as JSON; "${key}" is a function`,
			);
		return value;
	});
	const slot = (await heldByThisFile()) ? null : await acquireSlot();
	try {
		await new Promise<void>((done, fail) => {
			const proc = spawn(process.execPath, [child, config], {
				stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
			});
			let output = '';
			let report = '';
			proc.stdout!.on('data', (chunk: Buffer) => (output += chunk));
			proc.stderr!.on('data', (chunk: Buffer) => (output += chunk));
			(proc.stdio[3] as NodeJS.ReadableStream).on('data', (chunk: Buffer) => (report += chunk));
			const stall =
				build.stallMs === undefined
					? undefined
					: setTimeout(() => {
							proc.kill('SIGKILL');
							fail(new Error(`fixture build of ${build.root} stalled`));
						}, build.stallMs);
			proc.once('error', fail);
			proc.once('close', (code, signal) => {
				clearTimeout(stall);
				if (code === 0) done();
				else fail(failure(build, report, output, String(code ?? signal)));
			});
		});
	} finally {
		if (slot) await rm(slot, { recursive: true, force: true });
	}
}
