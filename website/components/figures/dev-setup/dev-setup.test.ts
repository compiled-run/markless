import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BARE, COMMIT, INSTALL, LINT_FAIL } from './terminal.ts';

const repo = (path: string) => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');
const pkg = JSON.parse(repo('package.json')) as { scripts: Record<string, string>; packageManager: string };
const hook = repo('.githooks/pre-commit');
const ci = repo('.github/workflows/ci.yml');
const toy = readFileSync(new URL('./terminal-figure.tsrx', import.meta.url), 'utf8');

describe('dev setup terminal figure', () => {
	it('prints the prepare script pnpm install really runs, with the pinned pnpm', () => {
		expect(INSTALL[0]).toBe('. prepare$ ' + pkg.scripts.prepare);
		expect(INSTALL.at(-1)).toContain('pnpm v' + pkg.packageManager.replace('pnpm@', ''));
	});

	it("prints the pre-commit hook's own lines and CI's four fast jobs", () => {
		for (const line of LINT_FAIL) expect(hook).toContain(line);
		expect(hook).toContain('vp lint --deny-warnings');
		expect(hook).toContain('scripts/ci/local.mjs --fast');
		for (const job of COMMIT.filter((l) => l.includes('passed')).map((l) => l.trim().split(/\s+/)[1]!)) expect(ci).toMatch(new RegExp('^    ' + job + ':$', 'm'));
		expect(BARE.at(-1)).toBe(COMMIT.at(-1));
	});

	it('answers press and keys, speaks each change, and drops animation under reduced motion', () => {
		for (const hook of ['onClick={() => install()}', 'onClick={() => commit()}', "event.key !== 'Escape'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
