import { describe, expect, test } from 'vitest';
import type { MarklessDevErrorPayload } from '../src/dev-error/index.ts';
import {
	isInvalidSource,
	transitionRecheckState,
	transitionSourceState,
	type RecheckState,
	type SourceEdit,
	type SourceState,
} from '../src/vite/hmr.ts';

const error = (id: string): MarklessDevErrorPayload => ({
	version: 1,
	id,
	kind: 'compile',
	diagnostics: [],
	details: 'broken',
});
const shown = error('/app/App.tsrx');
const other = error('/app/Other.tsrx');
const edit = (source: string): SourceEdit => ({ source, verdict: Promise.resolve(undefined) });
const previous = edit('previous');
const saved = edit('saved');

const clean: SourceState = { kind: 'clean', edit: previous };
const preflighting: SourceState = { kind: 'preflighting', edit: saved };
const preflightingShown: SourceState = { kind: 'preflighting', edit: saved, shownError: shown };
const invalid: SourceState = { kind: 'invalid', error: shown, edit: previous };

describe('source state transitions', () => {
	test.each<[string, SourceState, Parameters<typeof transitionSourceState>[1], SourceState]>([
		['clean -edit-> preflighting', clean, { type: 'edit', edit: saved }, preflighting],
		['clean -failed-> invalid', clean, { type: 'failed', error: shown }, invalid],
		['clean -passed-> clean', clean, { type: 'passed' }, clean],
		['clean -deleted-> clean', clean, { type: 'deleted' }, clean],
		['clean -cleanup-> clean', clean, { type: 'cleanup' }, clean],
		[
			'preflighting -ok-> clean',
			preflighting,
			{ type: 'edit-passed', edit: saved },
			{ kind: 'clean', edit: saved },
		],
		[
			'preflighting, was invalid -ok-> clean',
			preflightingShown,
			{ type: 'edit-passed', edit: saved },
			{ kind: 'clean', edit: saved },
		],
		[
			'preflighting -error-> invalid',
			preflighting,
			{ type: 'edit-failed', edit: saved, error: shown },
			{ kind: 'invalid', error: shown, edit: saved },
		],
		[
			'preflighting, was invalid -error-> invalid with the new error',
			preflightingShown,
			{ type: 'edit-failed', edit: saved, error: other },
			{ kind: 'invalid', error: other, edit: saved },
		],
		[
			'preflighting -error owned by another file-> clean',
			preflighting,
			{ type: 'edit-failed', edit: saved },
			{ kind: 'clean', edit: saved },
		],
		[
			'preflighting, was invalid -error owned by another file-> invalid as before',
			preflightingShown,
			{ type: 'edit-failed', edit: saved },
			{ kind: 'invalid', error: shown, edit: saved },
		],
		[
			'preflighting -newer edit-> preflighting the newer edit',
			preflightingShown,
			{ type: 'edit', edit: previous },
			{ kind: 'preflighting', edit: previous, shownError: shown },
		],
		[
			'preflighting -failed-> preflighting, invalid',
			preflighting,
			{ type: 'failed', error: shown },
			preflightingShown,
		],
		[
			'preflighting, was invalid -passed-> preflighting',
			preflightingShown,
			{ type: 'passed' },
			preflighting,
		],
		[
			'preflighting, was invalid -deleted-> preflighting',
			preflightingShown,
			{ type: 'deleted' },
			preflighting,
		],
		[
			'preflighting, was invalid -cleanup-> preflighting',
			preflightingShown,
			{ type: 'cleanup' },
			preflighting,
		],
		[
			'invalid -edit-> preflighting, still invalid',
			invalid,
			{ type: 'edit', edit: saved },
			preflightingShown,
		],
		[
			'invalid -failed-> invalid with the new error',
			invalid,
			{ type: 'failed', error: other },
			{ kind: 'invalid', error: other, edit: previous },
		],
		['invalid -recheck ok-> clean', invalid, { type: 'passed' }, clean],
		['invalid -deleted-> clean', invalid, { type: 'deleted' }, clean],
		['invalid -cleanup-> clean', invalid, { type: 'cleanup' }, clean],
	])('%s', (_row, state, event, next) => {
		expect(transitionSourceState(state, event)).toEqual(next);
	});

	test('the handled edit survives every move, so a byte-identical save is recognised', () => {
		let state: SourceState = { kind: 'clean' };
		state = transitionSourceState(state, { type: 'edit', edit: saved });
		state = transitionSourceState(state, { type: 'edit-failed', edit: saved, error: shown });
		state = transitionSourceState(state, { type: 'passed' });
		state = transitionSourceState(state, { type: 'failed', error: other });
		state = transitionSourceState(state, { type: 'cleanup' });
		expect(state.edit).toBe(saved);
	});

	test.each<[string, SourceState]>([
		['clean', clean],
		['invalid', invalid],
		['preflighting a newer edit', { kind: 'preflighting', edit: previous }],
	])('settling an edit that is not in flight throws: %s', (_row, state) => {
		expect(() => transitionSourceState(state, { type: 'edit-passed', edit: saved })).toThrow(
			/not in flight/,
		);
		expect(() =>
			transitionSourceState(state, { type: 'edit-failed', edit: saved, error: shown }),
		).toThrow(/not in flight/);
	});

	test('a file is invalid while its error is shown, edit in flight or not', () => {
		expect(
			[undefined, clean, preflighting, preflightingShown, invalid].map(isInvalidSource),
		).toEqual([false, false, false, true, true]);
	});
});

describe('recheck loop transitions', () => {
	const interval = 1 as unknown as ReturnType<typeof setInterval>;
	const idle: RecheckState = { kind: 'idle' };
	const armed: RecheckState = { kind: 'armed', interval };
	const rechecking: RecheckState = { kind: 'rechecking', interval };
	const recheckingDrained: RecheckState = { kind: 'rechecking' };

	test.each<
		[string, RecheckState, Parameters<typeof transitionRecheckState>[1], boolean, RecheckState]
	>([
		[
			'idle -first file invalid-> armed',
			idle,
			{ type: 'first-invalid', interval },
			true,
			armed,
		],
		['armed -last file valid-> idle', armed, { type: 'none-invalid' }, false, idle],
		['armed -tick-> rechecking', armed, { type: 'tick' }, true, rechecking],
		['rechecking -done, some invalid-> armed', rechecking, { type: 'done' }, true, armed],
		['rechecking -done, none invalid-> idle', recheckingDrained, { type: 'done' }, false, idle],
		[
			'rechecking -last file valid-> rechecking, interval stopped',
			rechecking,
			{ type: 'none-invalid' },
			false,
			recheckingDrained,
		],
		[
			'rechecking, interval stopped -first file invalid-> rechecking',
			recheckingDrained,
			{ type: 'first-invalid', interval },
			true,
			rechecking,
		],
		['idle -cleanup-> idle', idle, { type: 'cleanup' }, false, idle],
		['armed -cleanup-> idle', armed, { type: 'cleanup' }, false, idle],
		[
			'rechecking -cleanup-> rechecking, interval stopped',
			rechecking,
			{ type: 'cleanup' },
			false,
			recheckingDrained,
		],
	])('%s', (_row, state, event, someInvalid, next) => {
		expect(transitionRecheckState(state, event, someInvalid)).toEqual(next);
	});

	test.each<[string, RecheckState, Parameters<typeof transitionRecheckState>[1], boolean]>([
		['tick while rechecking', rechecking, { type: 'tick' }, true],
		['tick while idle', idle, { type: 'tick' }, false],
		['done while armed', armed, { type: 'done' }, true],
		['done while idle', idle, { type: 'done' }, false],
		['first invalid while armed', armed, { type: 'first-invalid', interval }, true],
		['none invalid while idle', idle, { type: 'none-invalid' }, false],
		['armed with no invalid file', idle, { type: 'first-invalid', interval }, false],
		['done to armed with no invalid file', rechecking, { type: 'done' }, false],
		['idle while a file is invalid', armed, { type: 'none-invalid' }, true],
		['cleanup leaving a file invalid', armed, { type: 'cleanup' }, true],
	])('illegal: %s', (_row, state, event, someInvalid) => {
		expect(() => transitionRecheckState(state, event, someInvalid)).toThrow(
			/recheck cannot go/,
		);
	});
});
