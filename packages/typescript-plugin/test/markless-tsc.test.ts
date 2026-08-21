import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { MARKLESS_TSRX_PARSE_ERROR_CODE } from '../src/language.ts';

// markless-tsc is a command line, so it is checked the way a user runs it: as a process,
// on a real project, by the exit code and the text it prints.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const marklessTsc = join(repoRoot, 'packages/typescript-plugin/src/tsc.ts');
const fixtures = join(repoRoot, 'packages/typescript-plugin/test/fixtures/markless-tsc');
const rawTsc = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');

type Run = { readonly status: number; readonly output: string };

function runMarklessTsc(fixture: string): Run {
	return run([marklessTsc, '-p', join(fixtures, fixture, 'tsconfig.json')]);
}

function runRawTsc(fixture: string): Run {
	return run([rawTsc, '--noEmit', '-p', join(fixtures, fixture, 'tsconfig.json')]);
}

function run(argv: readonly string[]): Run {
	const result = spawnSync(process.execPath, argv, { cwd: repoRoot, encoding: 'utf8' });
	return {
		status: result.status ?? -1,
		output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
	};
}

test('a project whose .tsrx typecheck exits 0', () => {
	const run = runMarklessTsc('good');
	expect(run.output).toBe('');
	expect(run.status).toBe(0);
});

test('a type error inside a .tsrx body fails the run, at the authored line and column', () => {
	const run = runMarklessTsc('body-error');
	// The error is on the `const total: number = label;` line of the authored .tsrx, not
	// somewhere in the generated TSX.
	expect(run.output).toContain('body-error/counter.tsrx(9,8): error TS2322');
	expect(run.status).not.toBe(0);
});

test('a wrong prop from a .ts consumer fails the run against the real component signature', () => {
	const run = runMarklessTsc('prop-error');
	expect(run.output).toContain('prop-error/consumer.ts(5,32): error TS2322');
	expect(run.status).not.toBe(0);
});

test('a .tsrx the compiler cannot parse fails the run instead of passing unchecked', () => {
	const run = runMarklessTsc('unparsable');
	expect(run.output).toContain(
		`unparsable/broken.tsrx(6,1): error TS${MARKLESS_TSRX_PARSE_ERROR_CODE}`,
	);
	expect(run.status).not.toBe(0);
});

// The gate this replaces. Each of these projects carries the crutch the repo used to
// carry - a hand-written sidecar or a wildcard `*.tsrx` shim - and raw tsc reports
// nothing, because it never reads a .tsrx. Everything markless-tsc catches above is
// therefore on top of what raw tsc catches, not instead of it.
test('raw tsc is green on the same projects markless-tsc fails', () => {
	expect(runRawTsc('body-error').status).toBe(0);
	expect(runRawTsc('prop-error').status).toBe(0);
});
