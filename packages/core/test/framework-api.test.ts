import { expect, test } from 'vitest';
import {
	computed,
	element,
	FrameworkApiRuntimeError,
	shared,
	state,
	storage,
} from '../src/index.ts';

test('framework APIs fail loudly when executed without the TSRX compiler', () => {
	expect(() => state(0)).toThrow(
		'markless state() must be compiled from a .tsrx file before it can run.',
	);
	expect(() => computed(() => 1)).toThrow(
		'markless computed() must be compiled from a .tsrx file before it can run.',
	);
	expect(() => element()).toThrow(
		'markless element() must be compiled from a .tsrx file before it can run.',
	);
	expect(() => shared(() => ({ user: 'Ada' }), { scope: 'page' })).toThrow(
		'markless shared() must be compiled from a .tsrx file before it can run.',
	);
	expect(() => storage('theme', 'light')).toThrow(
		'markless storage() must be compiled from a .tsrx file before it can run.',
	);
});

test('framework APIs expose structured runtime diagnostics when executed directly', () => {
	const error = captureThrown(() => state(0));

	expect(error).toBeInstanceOf(FrameworkApiRuntimeError);
	expect(error).toMatchObject({
		code: 'MARKLESS_FRAMEWORK_API_RUNTIME_CALL',
		severity: 'error',
		phase: 'runtime',
		title: 'Framework API executed without compiler output',
		apiName: 'state',
		docsUrl: 'https://markless.dev/errors/MARKLESS_FRAMEWORK_API_RUNTIME_CALL',
		suggestions: [
			{
				message: expect.stringContaining('.tsrx'),
			},
		],
	});
	expect(error).toMatchObject({
		message: 'markless state() must be compiled from a .tsrx file before it can run.',
		why: expect.stringContaining('state()'),
	});
});

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}
