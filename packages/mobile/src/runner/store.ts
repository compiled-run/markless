import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ProofPlatform } from '../harness/proof-app.ts';
import type { PhoneSpec } from './pool.ts';
import type { ProofReport } from '../harness/report.ts';

/** The runner's folder, shared by every checkout on the machine: the queue, each job's bundle, results and screenshots. */
export const runnerHome = (): string =>
	process.env.MARKLESS_PHONES_HOME ?? join(homedir(), '.cache', 'markless-phones');

export const jobsDir = () => join(runnerHome(), 'jobs');
export const jobDir = (id: string) => join(jobsDir(), id);
export const daemonFile = () => join(runnerHome(), 'daemon.json');
export const phonesFile = () => join(runnerHome(), 'phones.json');
export const daemonLog = () => join(runnerHome(), 'daemon.log');

/** Readers never see a half-written file: every write goes to a scratch name and is renamed into place. */
export function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const scratch = `${path}.${process.pid}.tmp`;
	writeFileSync(scratch, `${JSON.stringify(value, null, '\t')}\n`);
	renameSync(scratch, path);
}

export function readJson<T>(path: string): T | undefined {
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;
}

export const JOB_VERSION = 'markless.phone-job/0';

/** What a worker submitted: rungs compiled in its checkout, with that checkout's hosts and shells copied beside them. */
export type JobSpec = {
	readonly version: typeof JOB_VERSION;
	readonly id: string;
	readonly createdAt: number;
	/** The checkout the bundle was made in, its commit, and whether it had uncommitted changes. */
	readonly worktree: string;
	readonly head: string;
	readonly dirty: boolean;
	readonly rungs: ReadonlyArray<string>;
	readonly platforms: ReadonlyArray<ProofPlatform>;
	readonly host: 'adapters' | 'stub';
	/** A rerun of failures: each platform runs only the rungs that failed on it, so the job is not a proof by itself. */
	readonly onlyOn?: Readonly<Partial<Record<ProofPlatform, ReadonlyArray<string>>>>;
};

/** The rungs a job runs on one platform, in the order it named them. */
export const rungsOn = (spec: JobSpec, platform: ProofPlatform): ReadonlyArray<string> =>
	spec.onlyOn?.[platform] ?? spec.rungs;

/** Inside `<job>/bundle/`: the mobile package's hosts, shells and conformance vectors at the paths the harness reads. */
export const bundleMobile = (job: string) => join(job, 'bundle', 'mobile');
export const bundleRung = (job: string, rung: string) => join(job, 'bundle', 'rungs', rung);
export const chunkFile = (job: string, chunk: string) => join(job, 'chunks', `${chunk}.json`);
export const chunkResultFile = (job: string, chunk: string) =>
	join(job, 'chunks', `${chunk}.result.json`);
/** Passes a job takes from earlier runs instead of running the rungs again, written by the submit. */
export const reusedFile = (job: string) => join(job, 'reused.json');
export type ReusedPass = { readonly platform: ProofPlatform; readonly result: RungResult };
export const chunkLog = (job: string, chunk: string) => join(job, 'logs', `${chunk}.log`);
export const screenshotsDir = (job: string, rung: string, platform: ProofPlatform) =>
	join(job, 'screenshots', rung, platform);
export const resultDir = (job: string) => join(job, 'result');

export type RungResult = ProofReport['rungs'][number];

/** One phone's share of a job: a few rungs on one platform, small enough that the machine queue can interleave other work. */
export type Chunk =
	| {
			readonly state: 'queued';
			readonly platform: ProofPlatform;
			readonly rungs: ReadonlyArray<string>;
			readonly attempt: number;
	  }
	| {
			readonly state: 'running';
			readonly platform: ProofPlatform;
			readonly rungs: ReadonlyArray<string>;
			readonly attempt: number;
			readonly phone: string;
			readonly startedAt: number;
	  }
	| {
			readonly state: 'done';
			readonly platform: ProofPlatform;
			readonly rungs: ReadonlyArray<string>;
			readonly attempt: number;
			readonly phone: string;
			readonly seconds: number;
			readonly results: ReadonlyArray<RungResult>;
			/** The phone stopped answering during this chunk; its failed rungs run again once on a restarted phone. */
			readonly phoneLost: boolean;
	  };

export type ChunkEvent =
	| { readonly type: 'claim'; readonly phone: string; readonly at: number }
	| {
			readonly type: 'finish';
			readonly results: ReadonlyArray<RungResult>;
			readonly phoneLost: boolean;
			readonly at: number;
	  }
	/** The runner stopped while the chunk ran: nobody owns it, so it waits for a phone again. */
	| { readonly type: 'abandon' };

export function transitionChunk(chunk: Chunk, event: ChunkEvent): Chunk {
	const { platform, rungs, attempt } = chunk;
	if (chunk.state === 'queued' && event.type === 'claim')
		return {
			state: 'running',
			platform,
			rungs,
			attempt,
			phone: event.phone,
			startedAt: event.at,
		};
	if (chunk.state === 'running' && event.type === 'finish')
		return {
			state: 'done',
			platform,
			rungs,
			attempt,
			phone: chunk.phone,
			seconds: (event.at - chunk.startedAt) / 1000,
			results: event.results,
			phoneLost: event.phoneLost,
		};
	if (chunk.state === 'running' && event.type === 'abandon')
		return { state: 'queued', platform, rungs, attempt };
	throw new Error(`a ${chunk.state} chunk cannot take ${event.type}`);
}

/** Maestro exited without recording one command of the flow: it never reached the phone, so the app was not tested. */
export const neverReachedPhone = (result: RungResult): boolean =>
	result.failure !== null && result.failure.step === -1 && result.failure.action === 'unknown';

/**
 * The rungs that get one more attempt, on the first attempt only: every failure of a chunk whose phone stopped answering,
 * and any rung whose flow never reached the phone. Every other failure is final.
 */
export const rerunAfterPhoneLoss = (chunk: Chunk): ReadonlyArray<string> =>
	chunk.state === 'done' && chunk.attempt === 0
		? chunk.results
				.filter(
					(result) => result.failure && (chunk.phoneLost || neverReachedPhone(result)),
				)
				.map((result) => result.name)
		: [];

/** The runner that owns the phones: one per machine, found through this file. */
export type DaemonRecord = {
	readonly pid: number;
	readonly startedAt: number;
	/** The checkout whose runner code is running. */
	readonly code: string;
	readonly pool: ReadonlyArray<PhoneSpec>;
};

/** A finished job: `passed` only when every platform it asked for passed every rung. */
export type Summary = {
	readonly passed: boolean;
	readonly problems: ReadonlyArray<string>;
	readonly seconds: number;
	/** Rungs that ran a second time because their phone stopped answering during the first. */
	readonly rerun: ReadonlyArray<string>;
	/** Rungs that did not run because an earlier job passed with byte-identical inputs: `<rung> on <platform>: reused pass from job <id>`. */
	readonly reused: ReadonlyArray<string>;
};

const alive = (pid: number) => {
	if (pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

export function runningDaemon(): DaemonRecord | undefined {
	const record = readJson<DaemonRecord>(daemonFile());
	return record && alive(record.pid) ? record : undefined;
}
