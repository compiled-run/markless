import { expect, test } from 'vitest';
import * as devLog from '../src/dev-log.ts';
import { describeMarklessEventTarget } from '../src/dev-log.ts';
import { createInlineResumerSource } from '../src/inline/resumer.ts';

function resumerSource(executionLog: 'auto' | 'always' | 'never' = 'auto'): string {
	return createInlineResumerSource({
		debug: false,
		executionLog,
		graphSyncPolicy: false,
		sharedGraphPolicy: false,
		syncPolicy: false,
	});
}

// F6.3: the maintained TypeScript fork of the accounting that no page ran.
// Deleted, with this test as the lock that keeps it deleted.
test('dev-log no longer forks the execution-log accounting', () => {
	for (const name of [
		'accountMarklessExecution',
		'describeMarklessExecutionCauses',
		'formatMarklessExecutedSize',
		'formatMarklessModuleId',
		'formatMarklessResumeSummary',
		'shouldActivateMarklessExecutionLog',
	]) {
		expect(Object.keys(devLog)).not.toContain(name);
	}
	expect(devLog.MARKLESS_EXECUTION_LEDGER_GLOBAL).toBe('__marklessExecutionLedger');
});

test('event target description still routes through the shared helper', () => {
	expect(describeMarklessEventTarget({ tagName: 'BUTTON', id: 'play' })).toBe('button#play');
});

test('the inline resumer publishes into the cumulative ledger instead of owning numbers', () => {
	const source = resumerSource();
	expect(source).toContain('__marklessExecutionLedger');
	// The one figure an inline script can back without a size map: its own bytes.
	expect(source).toContain('textContent');
	expect(source).toContain('total.inline');
	expect(source).toContain('data-markless-log-inline-bytes');
	expect(source).toContain('data-markless-log-load-bytes');
});

test('the inline resumer prints the owner-worded ledger line once modules executed', () => {
	const source = resumerSource();
	expect(source).toContain('executed at load');
	expect(source).toContain('total ');
	expect(source).toContain('pending sizes');
});

test('the zero-executed arm keeps its exact sentence and its exact zero mirrors', () => {
	const source = resumerSource();
	expect(source).toContain('markless: resumed — 0.0 KB app executed, ');
	expect(source).toContain('modules preloaded (0 app executed) · 0.0 KB instrument');
	expect(source).toContain('console.log(summary)');
	expect(source).toContain('setAttribute("data-markless-log-summary", summary)');
	expect(source).toContain('setAttribute("data-markless-log-app-bytes", "0")');
	expect(source).toContain('setAttribute("data-markless-log-instrument-bytes", "0")');
	expect(source).toContain('removeAttribute("data-markless-log-app-bytes")');
});

// The logging summary is composed in at emit time, not gated at runtime, so a
// consumer document carries none of its text — not the ledger, not the summary
// wording, not the mirrors. This is the assertion the byte claim rests on.
test('never mode ships no ledger publication text at all', () => {
	const never = resumerSource('never');
	expect(never).toContain('const __MARKLESS_INLINE_EXECUTION_LOG__="never";');
	for (const text of [
		'__marklessExecutionLedger',
		'executed at load',
		'markless: resumed',
		'data-markless-log-summary',
		'data-markless-log-inline-bytes',
		'data-markless-log-load-bytes',
		'marklessLog',
		'modulepreload',
	])
		expect(never, text).not.toContain(text);
	// And the logging modes still carry it, so the gate cannot pass by emitting
	// nothing anywhere.
	for (const mode of ['auto', 'always'] as const)
		expect(resumerSource(mode)).toContain('__marklessExecutionLedger');
});

test('the never-mode resumer is smaller than the logging one by the whole block', () => {
	expect(resumerSource('never').length).toBeLessThan(resumerSource('auto').length - 1000);
});
