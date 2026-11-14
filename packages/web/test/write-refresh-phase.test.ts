import { expect, test } from 'vitest';
import {
	assertRoundMove,
	assertWriteMove,
	ROUND_HOLDING,
	ROUND_SENDING,
	ROUND_SENDING_SAVED,
	registerWriteRefresh,
	type RoundPhase,
	WRITE_IDLE,
	WRITE_OWED,
	WRITE_WRITING,
	WRITE_WRITING_SUCCEEDED,
	type WritePhase,
} from '../src/resume-return-reask.ts';
import { dispatchSpans, runAsDispatchOwn, type DispatchSpan } from '../src/event-current-target.ts';
import { IN_PLACE_LOCATION_HEADER } from '../src/fns/in-place-headers.ts';

const phases = [
	WRITE_IDLE,
	WRITE_WRITING,
	WRITE_WRITING_SUCCEEDED,
	WRITE_OWED,
] as const;
const allowed: ReadonlyArray<readonly [WritePhase, WritePhase]> = [
	[WRITE_IDLE, WRITE_WRITING], // the first write is sent
	[WRITE_WRITING, WRITE_WRITING], // another write is sent, or one fails while others are in flight
	[WRITE_WRITING, WRITE_WRITING_SUCCEEDED], // a write succeeds
	[WRITE_WRITING, WRITE_IDLE], // the last write in flight fails and none succeeded, or one sent the page elsewhere
	[WRITE_WRITING, WRITE_OWED], // the only write in flight succeeds
	[WRITE_WRITING_SUCCEEDED, WRITE_WRITING_SUCCEEDED], // more writes are sent or settle
	[WRITE_WRITING_SUCCEEDED, WRITE_OWED], // the last write settles after one succeeded
	[WRITE_WRITING_SUCCEEDED, WRITE_IDLE], // a write's answer sent the page elsewhere: the round ends at once
	[WRITE_OWED, WRITE_WRITING_SUCCEEDED], // a new write is sent while the refresh waits for its handlers
	[WRITE_OWED, WRITE_IDLE], // the handlers ended, so the refresh runs
];

for (const from of phases)
	for (const to of phases) {
		const ok = allowed.some(([a, b]) => a === from && b === to);
		test(`the write watch ${ok ? 'moves' : 'never moves'} from ${from} to ${to}`, () => {
			if (ok) expect(() => assertWriteMove(from, to)).not.toThrow();
			else expect(() => assertWriteMove(from, to)).toThrow(/no move/);
		});
	}

const roundPhases = [ROUND_SENDING, ROUND_SENDING_SAVED, ROUND_HOLDING] as const;
// A dispatch's own round, with how many of its saves are still out after the move.
const roundMoves: ReadonlyArray<readonly [RoundPhase, RoundPhase, 'out' | 'none']> = [
	[ROUND_SENDING, ROUND_SENDING, 'out'], // it sends another save, or one fails while another is out
	[ROUND_SENDING, ROUND_SENDING_SAVED, 'out'], // one save succeeds while another is out
	[ROUND_SENDING, ROUND_HOLDING, 'none'], // its last save succeeds
	[ROUND_SENDING_SAVED, ROUND_SENDING_SAVED, 'out'], // more saves are sent or settle
	[ROUND_SENDING_SAVED, ROUND_HOLDING, 'none'], // its last save settles after one succeeded
	[ROUND_HOLDING, ROUND_SENDING_SAVED, 'out'], // a later run of the same dispatch sends a save
];

for (const from of roundPhases)
	for (const to of roundPhases)
		for (const out of ['out', 'none'] as const) {
			const ok = roundMoves.some(([a, b, c]) => a === from && b === to && c === out);
			test(`a round ${ok ? 'moves' : 'never moves'} from ${from} to ${to} with ${out === 'out' ? 'a save' : 'no save'} out`, () => {
				const run = () => assertRoundMove(from, to, out === 'out' ? 1 : 0);
				if (ok) expect(run).not.toThrow();
				else expect(run).toThrow(/no round move/);
			});
		}

// A fetch whose answers the test hands out one by one, and a control that records its aria-busy.
// The write watch wraps fetch once per module, so every rig shares the one fetch it wrapped.
const answers: Array<(answer: Response) => void> = [];
const answered = ((() => new Promise<Response>((answer) => answers.push(answer))) as unknown) as typeof fetch;
let rigged = false;
function saveRig() {
	answers.length = 0;
	globalThis.location ??= new URL('http://write-watch.test/page') as unknown as Location;
	if (!rigged) globalThis.fetch = answered;
	rigged = true;
	const control = () => {
		const attributes = new Map<string, string>();
		return {
			attributes,
			setAttribute: (name: string, value: string) => void attributes.set(name, value),
			removeAttribute: (name: string) => void attributes.delete(name),
		};
	};
	const send = (span: DispatchSpan) => {
		dispatchSpans().add(span);
		void runAsDispatchOwn(span, () => fetch('/save', { method: 'POST' }));
		span.open = false;
		dispatchSpans().delete(span);
		span.closed?.();
	};
	return { answers, control, send };
}
const turns = async () => {
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
};

test('a save sent after another save left the page ends its busy mark once it answers, though an older save answered first', async () => {
	const { answers, control, send } = saveRig();
	const release = registerWriteRefresh({}, new Map());
	const [older, leaving, later] = [control(), control(), control()];
	send({ open: true, control: older as unknown as Element });
	send({ open: true, control: leaving as unknown as Element });
	answers[1]!(new Response('{}', { headers: { [IN_PLACE_LOCATION_HEADER]: '/elsewhere' } }));
	await turns();
	send({ open: true, control: later as unknown as Element });
	expect(later.attributes.get('aria-busy')).toBe('true');
	answers[0]!(new Response('{}'));
	await turns();
	answers[2]!(new Response('{}'));
	await turns();
	expect([older.attributes.has('aria-busy'), leaving.attributes.has('aria-busy'), later.attributes.has('aria-busy')]).toEqual([false, false, false]);
	release();
});

test('a reload whose screen update throws still clears the sending control, and the failure is reported once, by the pass', async () => {
	const { answers, control, send } = saveRig();
	const node = { graphNodeId: 'shelf', version: 1, snapshot: { status: 'fulfilled' } };
	const subscriptions: Array<{ readonly run: () => unknown }> = [];
	let reports = 0;
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown) => void unhandled.push(reason);
	process.on('unhandledRejection', onUnhandled);
	const plane = {
		nodes: new Map([[node.graphNodeId, node]]),
		withInputs: () => [node],
		markEntry() {},
		endEntry() {},
		refreshAfterWrite(_versions: unknown, started: () => void) {
			node.snapshot = { status: 'pending' };
			queueMicrotask(started);
			return Promise.resolve();
		},
	};
	const graph = {
		asyncPlane: () => plane,
		subscribe: (subscription: { readonly run: () => unknown }) => {
			subscriptions.push(subscription);
			return () => {};
		},
		// The pass that lands the reloaded value rejects; whoever flushed reports it, which this catch stands in for.
		pendingFlush: () => {
			const pass = Promise.reject(new Error('a text update threw'));
			pass.catch(() => reports++);
			return pass;
		},
	};
	const release = registerWriteRefresh(graph as never, new Map([['b', { asyncReads: [{ graphNodeId: node.graphNodeId }] }]]));
	try {
		const button = control();
		const span: DispatchSpan = { open: true, control: button as unknown as Element };
		send(span);
		expect(button.attributes.get('aria-busy')).toBe('true');
		answers[0]!(new Response('{}'));
		await turns();
		expect(subscriptions).toHaveLength(1);
		node.snapshot = { status: 'fulfilled' };
		subscriptions[0]!.run();
		await turns();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(button.attributes.has('aria-busy')).toBe(false);
		await expect(span.refreshed).resolves.toBeUndefined();
		expect(reports).toBe(1);
		expect(unhandled).toEqual([]);
	} finally {
		process.off('unhandledRejection', onUnhandled);
		release();
	}
});
