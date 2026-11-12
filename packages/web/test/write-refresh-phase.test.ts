import { expect, test } from 'vitest';
import {
	assertWriteMove,
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
	[WRITE_WRITING, WRITE_IDLE], // the last write in flight fails and none succeeded
	[WRITE_WRITING, WRITE_OWED], // the only write in flight succeeds
	[WRITE_WRITING_SUCCEEDED, WRITE_WRITING_SUCCEEDED], // more writes are sent or settle
	[WRITE_WRITING_SUCCEEDED, WRITE_OWED], // the last write settles after one succeeded
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
