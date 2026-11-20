// Keeps the runner's own checkout on origin/main: a runner started from a plain main checkout moves it forward between jobs.
import { resolve } from 'node:path';
import { exec } from '../harness/exec.ts';
import type { Chunk } from './store.ts';

export const UPSTREAM = { remote: 'origin', branch: 'main' } as const;
const upstreamRef = `${UPSTREAM.remote}/${UPSTREAM.branch}`;
/** The checkout whose runner code is running. */
export const runnerCheckout = resolve(import.meta.dirname, '..', '..', '..', '..');

/** What git says about the runner's checkout after a fetch of origin/main. */
export type CheckoutFacts = {
	readonly head: string;
	readonly upstream: string;
	/** The checked-out branch, or null on a detached HEAD. */
	readonly branch: string | null;
	readonly dirty: boolean;
	/** HEAD is an ancestor of origin/main, so moving to it drops no commit. */
	readonly headInUpstream: boolean;
};

export type RefreshPlan =
	| { readonly kind: 'current' }
	/** `branch`: the checkout is on main (moved with it) rather than detached. */
	| {
			readonly kind: 'refresh';
			readonly from: string;
			readonly to: string;
			readonly branch: string | null;
	  }
	/** A checkout that is somebody's work: the runner never moves it. */
	| { readonly kind: 'kept'; readonly reason: string };

type Refresh = Extract<RefreshPlan, { kind: 'refresh' }>;

export function planRefresh(facts: CheckoutFacts): RefreshPlan {
	if (facts.head === facts.upstream) return { kind: 'current' };
	if (facts.branch !== null && facts.branch !== UPSTREAM.branch)
		return { kind: 'kept', reason: `the checkout is on branch ${facts.branch}` };
	if (facts.dirty) return { kind: 'kept', reason: 'the checkout has uncommitted changes' };
	if (!facts.headInUpstream)
		return {
			kind: 'kept',
			reason: `${facts.head.slice(0, 9)} has commits ${upstreamRef} does not`,
		};
	return { kind: 'refresh', from: facts.head, to: facts.upstream, branch: facts.branch };
}

/** A job is under way once any of its chunks left the queue; the runner restarts only when none is. */
export const jobStarted = (chunks: ReadonlyArray<Chunk>): boolean =>
	chunks.some((chunk) => chunk.state !== 'queued');

/** The refresh's life in the runner; only `transitionRefresh` moves it. */
export type RefreshState =
	/** `kept`: why the last check left the checkout alone, logged once per reason. */
	| { readonly state: 'idle'; readonly checkedAt: number; readonly kept: string | null }
	| { readonly state: 'checking'; readonly kept: string | null }
	/** origin/main moved: no new job starts, and the runner moves once no job is under way. */
	| { readonly state: 'pending'; readonly plan: Refresh }
	| { readonly state: 'moving'; readonly plan: Refresh };

export type RefreshEvent =
	| { readonly type: 'check' }
	| { readonly type: 'checked'; readonly plan: RefreshPlan }
	| { readonly type: 'check-failed' }
	| { readonly type: 'move' }
	| { readonly type: 'move-failed' };

export function transitionRefresh(
	refresh: RefreshState,
	event: RefreshEvent,
	at = Date.now(),
): RefreshState {
	switch (event.type) {
		case 'check':
			if (refresh.state === 'idle') return { state: 'checking', kept: refresh.kept };
			break;
		case 'checked':
			if (refresh.state === 'checking')
				return event.plan.kind === 'refresh'
					? { state: 'pending', plan: event.plan }
					: {
							state: 'idle',
							checkedAt: at,
							kept: event.plan.kind === 'kept' ? event.plan.reason : null,
						};
			break;
		case 'check-failed':
			if (refresh.state === 'checking')
				return { state: 'idle', checkedAt: at, kept: refresh.kept };
			break;
		case 'move':
			if (refresh.state === 'pending') return { state: 'moving', plan: refresh.plan };
			break;
		case 'move-failed':
			if (refresh.state === 'moving') return { state: 'idle', checkedAt: at, kept: null };
			break;
	}
	throw new Error(`a ${refresh.state} refresh cannot take ${event.type}`);
}

const git = async (cwd: string, args: string[]) => (await exec('git', args, { cwd })).stdout.trim();

export async function checkoutFacts(cwd: string): Promise<CheckoutFacts> {
	await exec('git', ['fetch', '--quiet', UPSTREAM.remote, UPSTREAM.branch], {
		cwd,
		timeoutMs: 120_000,
	});
	const head = await git(cwd, ['rev-parse', 'HEAD']);
	const upstream = await git(cwd, ['rev-parse', upstreamRef]);
	const branch =
		(
			await exec('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
				cwd,
				allowFailure: true,
			})
		).stdout.trim() || null;
	const dirty = (await git(cwd, ['status', '--porcelain'])).length > 0;
	const ancestor = await exec('git', ['merge-base', '--is-ancestor', head, upstream], {
		cwd,
		allowFailure: true,
	});
	return { head, upstream, branch, dirty, headInUpstream: ancestor.code === 0 };
}

/** Moves the checkout to `to` and installs; on a failed install it goes back to `from`, so the runner keeps working code. */
export async function moveCheckout(cwd: string, plan: Refresh): Promise<void> {
	const moveTo = (commit: string) =>
		plan.branch === null
			? git(cwd, ['checkout', '--quiet', '--detach', commit])
			: git(cwd, ['reset', '--quiet', '--keep', commit]);
	await moveTo(plan.to);
	try {
		await exec('pnpm', ['install', '--frozen-lockfile'], { cwd });
	} catch (error) {
		await moveTo(plan.from);
		await exec('pnpm', ['install', '--frozen-lockfile'], { cwd, allowFailure: true });
		throw error;
	}
}
