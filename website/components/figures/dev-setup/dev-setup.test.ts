import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAST, FILE, LINT_FAIL, LINT_WARNING, PANEL, PNPM_DONE, PREPARE, RAIL, STEPS } from './terminal.ts';

const repo = (path: string) => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const pkg = JSON.parse(repo('package.json')) as { scripts: Record<string, string>; packageManager: string };
const hook = repo('.githooks/pre-commit');
const ci = repo('.github/workflows/ci.yml');
const toy = readFileSync(new URL('./terminal-figure.tsrx', import.meta.url), 'utf8');

describe('dev setup first-hour step-through', () => {
	it('prints the prepare script pnpm install really runs, with the pinned pnpm', () => {
		expect(PREPARE).toBe('. prepare$ ' + pkg.scripts.prepare);
		expect(PNPM_DONE).toContain('pnpm v' + pkg.packageManager.replace('pnpm@', ''));
	});

	it("prints the pre-commit hook's own lines, and CI's four fast jobs", () => {
		for (const line of LINT_FAIL) expect(hook).toContain(line);
		expect(hook).toContain('vp lint --deny-warnings');
		expect(hook).toContain('scripts/ci/local.mjs --fast');
		for (const job of FAST) expect(ci).toMatch(new RegExp('^    ' + job + ':$', 'm'));
	});

	it('shows the real first line of the file it changes, and flags the import lint reports on line 2', () => {
		expect(repo(FILE).split('\n')[0]).toBe(PANEL[0]!.text);
		expect(PANEL[1]!.kind).toBe('slip');
		expect(LINT_WARNING).toContain(FILE + ':2:10:');
		expect(LINT_WARNING).toContain("'readFileSync' is imported but never used");
	});

	it('walks seven steps from clone to push, one caption each', () => {
		expect(STEPS).toHaveLength(7);
		expect(RAIL.map((r) => r.key)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(STEPS[4]!.lines.some((l) => l.kind === 'bad')).toBe(true);
		expect(STEPS[5]!.lines.filter((l) => l.text.includes('passed  '))).toHaveLength(4);
	});

	it('steps with Next, the rail, arrows and swipe, and the red line removes the import', () => {
		for (const hook of ["event.key === 'ArrowRight'", "event.key === 'ArrowLeft'", 'onPointerUp', 'onClick={() => go(dot.key)}', 'onClick={() => next()}', 'onClick={() => go(5)}', "tagName === 'INPUT'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
