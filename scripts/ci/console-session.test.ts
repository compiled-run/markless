import { expect, test } from 'vitest';
import { consoleSessionProblem } from './console-session.mjs';

test('refuses a browser step on a Mac whose screen has nobody logged in, and says how to recover', () => {
	const problem = consoleSessionProblem('darwin', 0);
	expect(problem).toContain("Nobody is logged in at this Mac's screen");
	expect(problem).toContain('log in at the screen');
});

test('lets the step run when a user is logged in at the screen, off macOS, or with no console', () => {
	expect(consoleSessionProblem('darwin', 501)).toBeNull();
	expect(consoleSessionProblem('linux', 0)).toBeNull();
	expect(consoleSessionProblem('darwin', null)).toBeNull();
});
