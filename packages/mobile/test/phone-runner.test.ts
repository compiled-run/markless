import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadProjectGraph, type ProjectGraph } from '../../analyzer/test-support/project-graph.ts';
import { allRungFolders } from '../proofs/ladder.ts';
import { affectedRungs } from '../src/runner/affected.ts';
import { repoRoot } from '../src/runner/bundle.ts';
import { parsePhone, transitionPhone, type PhoneState } from '../src/runner/pool.ts';
import {
	checkoutFacts,
	jobStarted,
	planRefresh,
	transitionRefresh,
	type CheckoutFacts,
	type RefreshState,
} from '../src/runner/refresh.ts';
import { rerunAfterPhoneLoss, transitionChunk, type Chunk } from '../src/runner/store.ts';
import { simctl, SimulatorStuck, simulatorAnswers } from '../src/harness/simctl.ts';

const queued: Chunk = {
	state: 'queued',
	platform: 'ios',
	rungs: ['01-static-text', '03-counter'],
	attempt: 0,
};
const failed = { step: 2, action: 'tap', role: 'flow' as const, message: 'device offline' };

describe('a chunk', () => {
	it('is claimed, then finished with the phone and the seconds it took', () => {
		const running = transitionChunk(queued, { type: 'claim', phone: 'ios:a', at: 1000 });
		expect(running).toMatchObject({ state: 'running', phone: 'ios:a', startedAt: 1000 });
		const done = transitionChunk(running, {
			type: 'finish',
			results: [],
			phoneLost: false,
			at: 4000,
		});
		expect(done).toMatchObject({ state: 'done', phone: 'ios:a', seconds: 3 });
	});

	it('goes back to the queue when the runner stops while it runs', () => {
		const running = transitionChunk(queued, { type: 'claim', phone: 'ios:a', at: 0 });
		expect(transitionChunk(running, { type: 'abandon' })).toEqual(queued);
	});

	it('refuses every other move', () => {
		expect(() =>
			transitionChunk(queued, { type: 'finish', results: [], phoneLost: false, at: 0 }),
		).toThrow('a queued chunk cannot take finish');
		expect(() => transitionChunk(queued, { type: 'abandon' })).toThrow();
		const done = transitionChunk(
			transitionChunk(queued, { type: 'claim', phone: 'p', at: 0 }),
			{
				type: 'finish',
				results: [],
				phoneLost: false,
				at: 0,
			},
		);
		expect(() => transitionChunk(done, { type: 'claim', phone: 'p', at: 0 })).toThrow();
	});

	it('runs its failed rungs once more only when its phone stopped answering, and only on the first attempt', () => {
		const finish = (attempt: number, phoneLost: boolean) =>
			transitionChunk(
				transitionChunk({ ...queued, attempt }, { type: 'claim', phone: 'p', at: 0 }),
				{
					type: 'finish',
					results: [
						{
							name: '01-static-text',
							failure: null,
							installSeconds: 1,
							flowSeconds: 1,
						},
						{ name: '03-counter', failure: failed, installSeconds: 1, flowSeconds: 1 },
					],
					phoneLost,
					at: 0,
				},
			);
		expect(rerunAfterPhoneLoss(finish(0, true))).toEqual(['03-counter']);
		expect(rerunAfterPhoneLoss(finish(0, false))).toEqual([]);
		expect(rerunAfterPhoneLoss(finish(1, true))).toEqual([]);
	});

	it('runs a rung once more when Maestro never reached the phone, though the phone still answers', () => {
		const unreached = {
			name: '03-counter',
			failure: {
				step: -1,
				action: 'unknown',
				role: 'unknown' as const,
				message: 'maestro exited 1',
			},
			installSeconds: 1,
			flowSeconds: 1,
		};
		const done = (attempt: number) =>
			transitionChunk(
				transitionChunk({ ...queued, attempt }, { type: 'claim', phone: 'p', at: 0 }),
				{
					type: 'finish',
					results: [unreached],
					phoneLost: false,
					at: 0,
				},
			);
		expect(rerunAfterPhoneLoss(done(0))).toEqual(['03-counter']);
		expect(rerunAfterPhoneLoss(done(1))).toEqual([]);
	});
});

describe('a simulator that stops answering simctl', () => {
	// A stand-in xcrun: the simulator reads Booted, and `simctl ui … appearance` never returns while STUCK is set, as measured.
	const bin = mkdtempSync(join(tmpdir(), 'markless-xcrun-'));
	writeFileSync(
		join(bin, 'xcrun'),
		`#!/bin/sh
if [ "$2" = list ]; then echo '{"devices":{"ios":[{"udid":"U","name":"n","state":"Booted"}]}}'; exit 0; fi
if [ "$2" = ui ] && [ -n "$STUCK" ]; then exec sleep 30; fi
echo light
`,
	);
	chmodSync(join(bin, 'xcrun'), 0o755);
	const path = process.env.PATH;
	beforeAll(() => {
		process.env.PATH = `${bin}:${path}`;
	});
	afterAll(() => {
		process.env.PATH = path;
		delete process.env.STUCK;
		rmSync(bin, { recursive: true, force: true });
	});
	it('fails the call by name once its time is up', async () => {
		process.env.STUCK = '1';
		const call = simctl(['ui', 'U', 'appearance', 'light'], { timeoutMs: 300 });
		await expect(call).rejects.toBeInstanceOf(SimulatorStuck);
		await expect(call).rejects.toThrow(
			'simctl ui U appearance light did not answer in 0.3 s: the simulator is stuck',
		);
	});

	it('does not answer the health check though it reads Booted, so the runner restarts it', async () => {
		process.env.STUCK = '1';
		expect(await simulatorAnswers('U', 300)).toBe(false);
		delete process.env.STUCK;
		expect(await simulatorAnswers('U', 300)).toBe(true);
	});
});

describe('a phone', () => {
	const booting: PhoneState = { state: 'booting', since: 0 };

	it('boots, takes a chunk, is released, and restarts when it stops answering', () => {
		const ready = transitionPhone(booting, { type: 'booted', device: 'udid' }, 1);
		const busy = transitionPhone(ready, { type: 'take', chunk: 'job/ios-000' }, 2);
		expect(busy).toEqual({
			state: 'busy',
			device: 'udid',
			since: 2,
			chunk: 'job/ios-000',
			driverInstalled: false,
		});
		// After a chunk Maestro's driver is on the phone; a boot clears that.
		expect(transitionPhone(busy, { type: 'release' }, 3)).toEqual({
			state: 'ready',
			device: 'udid',
			since: 3,
			driverInstalled: true,
		});
		const restarting = transitionPhone(busy, { type: 'lost', reason: 'gone' }, 4);
		expect(transitionPhone(restarting, { type: 'booted', device: 'udid2' }, 5)).toMatchObject({
			state: 'ready',
			device: 'udid2',
		});
		expect(
			transitionPhone(restarting, { type: 'give-up', reason: 'three boots' }, 6),
		).toMatchObject({ state: 'broken' });
	});

	it('never takes a chunk unless it is ready', () => {
		expect(() => transitionPhone(booting, { type: 'take', chunk: 'c' })).toThrow(
			'a booting phone cannot take take',
		);
		const broken = transitionPhone(booting, { type: 'give-up', reason: 'x' });
		expect(() => transitionPhone(broken, { type: 'booted', device: 'd' })).toThrow();
	});

	it('reads an emulator as <avd>@<even console port>', () => {
		expect(parsePhone('android', 'markless_runner@5570')).toEqual({
			platform: 'android',
			avd: 'markless_runner',
			port: 5570,
		});
		expect(() => parsePhone('android', 'markless_runner')).toThrow();
		expect(() => parsePhone('android', 'markless_runner@5571')).toThrow();
		expect(() => parsePhone('android', 'markless_runner@5620')).toThrow(
			"console port 5620 is outside adb's range",
		);
		expect(() => parsePhone('android', 'markless_runner@5584')).not.toThrow();
	});
});

describe('the rungs a change affects, from the project graph', () => {
	let graph: Promise<ProjectGraph> | undefined;
	const loaded = () => (graph ??= loadProjectGraph(repoRoot).then((result) => result.graph));
	const select = (...changed: string[]) => affectedRungs(changed, allRungFolders(), loaded);

	it('picks a rung whose folder changed, and the rungs that import a shared module', async () => {
		expect(
			(await select('packages/mobile/proofs/03-counter/App.tsrx')).rungs.map((r) => r.name),
		).toEqual(['03-counter']);
		const shared = await select('packages/mobile/proofs/lib/Stepper.tsrx');
		expect(shared.all).toBeNull();
		expect(shared.rungs).toEqual([
			{
				name: '07b-imported-component',
				because: 'it imports packages/mobile/proofs/lib/Stepper.tsrx',
			},
		]);
	}, 60_000);

	it('picks every rung when the compiler, a host or a manifest changed, and none for prose', async () => {
		expect((await select('packages/compiler/src/index.ts')).all).toBe(
			'the toolchain imports packages/compiler/src/index.ts',
		);
		expect((await select('packages/mobile/src/adapters/ios/Package.swift')).all).toMatch(
			/^the hosts changed/,
		);
		expect((await select('packages/mobile/package.json')).all).not.toBeNull();
		expect(await select('docs/goals/native-targets-api/conformance-2026-11-17.md')).toEqual({
			all: null,
			rungs: [],
		});
	}, 60_000);
});

describe("the runner's checkout", () => {
	// Inside the commit hook git exports GIT_DIR and GIT_INDEX_FILE, which would point these git calls at the real repository.
	const hookEnv = Object.entries(process.env).filter(([key]) => key.startsWith('GIT_'));
	beforeAll(() => {
		for (const [key] of hookEnv) delete process.env[key];
	});
	afterAll(() => {
		for (const [key, value] of hookEnv) process.env[key] = value;
	});
	const behind: CheckoutFacts = {
		head: 'a'.repeat(40),
		upstream: 'b'.repeat(40),
		branch: null,
		dirty: false,
		headInUpstream: true,
	};
	const plan = planRefresh(behind);

	it('moves to origin/main when it is a clean detached or main checkout behind it', () => {
		expect(plan).toEqual({
			kind: 'refresh',
			from: behind.head,
			to: behind.upstream,
			branch: null,
		});
		expect(planRefresh({ ...behind, branch: 'main' })).toMatchObject({
			kind: 'refresh',
			branch: 'main',
		});
		expect(planRefresh({ ...behind, upstream: behind.head })).toEqual({ kind: 'current' });
	});

	it("never moves a checkout that is somebody's work", () => {
		expect(planRefresh({ ...behind, branch: 'cw/runner-change' }).kind).toBe('kept');
		expect(planRefresh({ ...behind, dirty: true }).kind).toBe('kept');
		expect(planRefresh({ ...behind, headInUpstream: false }).kind).toBe('kept');
	});

	it('counts a job as under way once one of its chunks left the queue', () => {
		const claimed = transitionChunk(queued, { type: 'claim', phone: 'ios:a', at: 0 });
		expect(jobStarted([queued, queued])).toBe(false);
		expect(jobStarted([queued, claimed])).toBe(true);
	});

	it('checks, waits while behind, moves, and checks again after a failed move', () => {
		let refresh: RefreshState = { state: 'idle', checkedAt: 0, kept: null };
		refresh = transitionRefresh(refresh, { type: 'check' });
		expect(refresh.state).toBe('checking');
		refresh = transitionRefresh(refresh, { type: 'checked', plan }, 5);
		expect(refresh).toEqual({ state: 'pending', plan });
		refresh = transitionRefresh(refresh, { type: 'move' });
		expect(refresh.state).toBe('moving');
		refresh = transitionRefresh(refresh, { type: 'move-failed' }, 9);
		expect(refresh).toEqual({ state: 'idle', checkedAt: 9, kept: null });

		const checking = transitionRefresh(refresh, { type: 'check' });
		const kept = planRefresh({ ...behind, dirty: true });
		expect(transitionRefresh(checking, { type: 'checked', plan: kept }, 12)).toEqual({
			state: 'idle',
			checkedAt: 12,
			kept: kept.kind === 'kept' ? kept.reason : null,
		});
		expect(transitionRefresh(checking, { type: 'check-failed' }, 13)).toEqual({
			state: 'idle',
			checkedAt: 13,
			kept: null,
		});
	});

	it('refuses every other move', () => {
		const idle: RefreshState = { state: 'idle', checkedAt: 0, kept: null };
		const pending = transitionRefresh(transitionRefresh(idle, { type: 'check' }), {
			type: 'checked',
			plan,
		});
		expect(() => transitionRefresh(idle, { type: 'move' })).toThrow('cannot take move');
		expect(() => transitionRefresh(pending, { type: 'check' })).toThrow('cannot take check');
		expect(() => transitionRefresh(pending, { type: 'move-failed' })).toThrow();
	});

	it('reads a checkout behind origin/main from git, after fetching it', async () => {
		const scratch = mkdtempSync(join(tmpdir(), 'runner-refresh-'));
		// A pre-commit hook exports GIT_DIR and GIT_INDEX_FILE, which would aim git, here and in checkoutFacts, at the real repository.
		const hookGit = Object.entries(process.env).filter(([key]) => key.startsWith('GIT_'));
		for (const [key] of hookGit) delete process.env[key];
		const git = (cwd: string, ...args: string[]) =>
			execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
				cwd,
				encoding: 'utf8',
			}).trim();
		try {
			const upstream = join(scratch, 'upstream');
			const runner = join(scratch, 'runner');
			git(scratch, 'init', '--quiet', '--initial-branch=main', upstream);
			git(upstream, 'commit', '--quiet', '--allow-empty', '-m', 'one');
			git(scratch, 'clone', '--quiet', upstream, runner);
			const first = git(runner, 'rev-parse', 'HEAD');
			git(runner, 'checkout', '--quiet', '--detach');
			git(upstream, 'commit', '--quiet', '--allow-empty', '-m', 'two');
			const second = git(upstream, 'rev-parse', 'HEAD');

			expect(await checkoutFacts(runner)).toEqual({
				head: first,
				upstream: second,
				branch: null,
				dirty: false,
				headInUpstream: true,
			});
			writeFileSync(join(runner, 'note.txt'), 'local work');
			expect(planRefresh(await checkoutFacts(runner)).kind).toBe('kept');
		} finally {
			Object.assign(process.env, Object.fromEntries(hookGit));
			rmSync(scratch, { recursive: true, force: true });
		}
	});
});
