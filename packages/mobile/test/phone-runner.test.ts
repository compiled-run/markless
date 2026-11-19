import { describe, expect, it } from 'vitest';
import { loadProjectGraph, type ProjectGraph } from '../../analyzer/test-support/project-graph.ts';
import { allRungFolders } from '../proofs/ladder.ts';
import { affectedRungs } from '../src/runner/affected.ts';
import { repoRoot } from '../src/runner/bundle.ts';
import { parsePhone, transitionPhone, type PhoneState } from '../src/runner/pool.ts';
import { rerunAfterPhoneLoss, transitionChunk, type Chunk } from '../src/runner/store.ts';

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
