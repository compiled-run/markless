import type { ProofPlatform } from '../harness/proof-app.ts';
import { jobStarted } from './refresh.ts';
import { isRemote, type PhoneSpec, type PhoneState } from './pool.ts';
import type { Chunk } from './store.ts';

/** A job with at most this many chunks left on a platform goes before longer ones: a 1-rung job no longer waits an hour behind a 115-rung one. */
export const SHORT_JOB_CHUNKS = 2;

export type QueuedJob = {
	readonly id: string;
	readonly chunks: ReadonlyArray<{
		readonly name: string;
		readonly chunk: Chunk;
	}>;
};

/**
 * The chunk a free phone of `platform` takes: the oldest short job's first, else the oldest job's. `jobs` come oldest
 * first. A long job's last chunks count as short, so a job near its end finishes soon.
 */
export function pickChunk(
	jobs: ReadonlyArray<QueuedJob>,
	platform: ProofPlatform,
	startsNewJobs: boolean,
): { readonly job: string; readonly name: string; readonly chunk: Chunk } | undefined {
	let long: { job: string; name: string; chunk: Chunk } | undefined;
	for (const job of jobs) {
		if (!startsNewJobs && !jobStarted(job.chunks.map(({ chunk }) => chunk))) continue;
		const waiting = job.chunks.filter(
			({ chunk }) => chunk.state === 'queued' && chunk.platform === platform,
		);
		const first = waiting[0];
		if (!first) continue;
		const pick = { job: job.id, name: first.name, chunk: first.chunk };
		if (waiting.length <= SHORT_JOB_CHUNKS) return pick;
		long ??= pick;
	}
	return long;
}

/** This machine's own phone of a platform stands by while a remote phone of that platform is up, so the machine keeps its capacity for what only it can run. */
export const standsBy = (
	spec: PhoneSpec,
	pool: ReadonlyArray<{ readonly spec: PhoneSpec; readonly state: PhoneState }>,
): boolean =>
	!isRemote(spec) &&
	pool.some(
		(phone) =>
			isRemote(phone.spec) &&
			phone.spec.platform === spec.platform &&
			(phone.state.state === 'ready' || phone.state.state === 'busy'),
	);
