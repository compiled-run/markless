import { spawn } from 'node:child_process';
import { resolve } from 'pathe';
import type { markless } from '@markless/bundler/vite';
import { noteFixtureBuilds, takeBuildSlot } from './build-slots.ts';

export { holdBuildSlot } from './build-slots.ts';

noteFixtureBuilds();

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
const failure = (build: FixtureBuild, report: string, output: string, exit: string) => {
	if (!report) return new Error(`fixture build of ${build.root} failed (${exit}):\n${output}`);
	const { message, errors } = JSON.parse(report) as { message: string; errors?: string[] };
	return Object.assign(new Error(message), {
		...(errors && { errors: errors.map((entry) => new Error(entry)) }),
	}) as FixtureBuildError;
};

/** Runs `run`, a production build in another process, in a build slot unless this file holds one. */
export async function withBuildSlot<T>(run: () => Promise<T>): Promise<T> {
	const release = await takeBuildSlot();
	try {
		return await run();
	} finally {
		await release();
	}
}

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
	const release = await takeBuildSlot();
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
		await release();
	}
}
