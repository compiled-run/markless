import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRANCH, CHECKS, FINDING, RAIL, STEPS } from './review.ts';

const page = readFileSync(new URL('../../../pages/contributing/first-pr.mdx', import.meta.url), 'utf8');
const toy = readFileSync(new URL('./review-figure.tsrx', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('first pull request step-through', () => {
	it('uses the branch the page creates, and the review bot this repo runs', () => {
		expect(page).toContain('git switch -c ' + BRANCH);
		expect(FINDING.bot).toBe('Macroscope');
		expect(page + toy).not.toMatch(/coderabbit/i);
	});

	it('lists required CI jobs that exist in ci.yml', () => {
		for (const job of CHECKS.slice(0, 3)) expect(workflow).toContain('\n    ' + job + ':\n');
	});

	it('walks six steps, one caption each, from open to merged', () => {
		expect(STEPS).toHaveLength(6);
		expect(RAIL.map((r) => r.key)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(STEPS.at(-1)).toMatch(/main/);
	});

	it('steps with Next, the rail, arrows and swipe, and refuses an early merge', () => {
		for (const hook of ["event.key === 'ArrowRight'", "event.key === 'ArrowLeft'", 'onPointerUp', 'onClick={() => go(dot.key)}', 'onClick={() => next()}', "blocker = step < 1 ? 'checks' : 'finding'", "tagName === 'INPUT'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
