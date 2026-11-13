import { expect, test } from 'vitest';
import {
	assertRoundMove,
	assertWriteMove,
	ROUND_HOLDING,
	ROUND_SENDING,
	ROUND_SENDING_SAVED,
	type RoundPhase,
	WRITE_IDLE,
	WRITE_OWED,
	WRITE_WRITING,
	WRITE_WRITING_SUCCEEDED,
	type WritePhase,
} from '../src/resume-return-reask.ts';

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
