import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRANCH, FINDINGS } from './review.ts';

const page = readFileSync(new URL('../../../pages/contributing/first-pr.mdx', import.meta.url), 'utf8');
const toy = readFileSync(new URL('./review-figure.tsrx', import.meta.url), 'utf8');

describe('first pull request review figure', () => {
	it('uses the branch and the reviewers the page names', () => {
		expect(page).toContain('git switch -c ' + BRANCH);
		expect(page).toContain('CodeRabbit');
		expect(FINDINGS.map((f) => f.who)).toContain('CodeRabbit');
	});

	it('refuses to merge while a finding is open, and points at it', () => {
		expect(toy).toContain('if (open >= 0) {');
		expect(toy).toContain('blocked = open;');
	});

	it('answers press and keys, speaks each change, and drops animation under reduced motion', () => {
		for (const hook of ["answer(0, 'fix')", "answer(1, 'reply')", 'onClick={() => merge()}', "event.key !== 'Escape'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
