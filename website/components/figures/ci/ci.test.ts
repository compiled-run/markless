import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECKS, drawing, HOME } from './checks.ts';

const art = drawing();
const workflow = readFileSync(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

describe('ci checks figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by ci.test.ts from checks.ts. Refresh with the figure tests and -u.
import type { drawing } from './checks.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./checks.art.ts');
	});

	it('names real jobs from ci.yml, and marks the required ones', () => {
		for (const check of CHECKS) expect(workflow).toContain('\n    ' + check.job + ':\n');
		expect(CHECKS.filter((check) => check.required).map((check) => check.job)).toEqual(['agent-files', 'typecheck', 'test']);
	});

	it('marks the fast set the same way ci:local and the pre-commit hook do', () => {
		const local = readFileSync(new URL('../../../../scripts/ci/local.mjs', import.meta.url), 'utf8');
		for (const check of CHECKS) expect(local).toMatch(new RegExp("'?" + check.job + "'?: \\{ mode: '" + (check.fast ? 'fast' : 'full') + "'"));
	});

	it('prints the commands each job really runs at home, from ci.yml', () => {
		const flat = (lines: string[]) => lines.join(' ').replaceAll('\\', ' ').replace(/\s+/g, ' ');
		const commands = ['pnpm dlx @intellectronica/ruler@0.3.44 apply', 'pnpm typecheck', 'pnpm --dir website exec vp test run --config vitest.tooling.config.ts', 'pnpm perf:guard', 'pnpm receipts:generate'];
		commands.forEach((command, i) => {
			expect(workflow).toContain(command);
			expect(flat(HOME[i]!.steps)).toContain(command);
		});
		expect(HOME.map((home) => home.pass.at(-1)!.trim().split(/\s+/).slice(0, 2).join(' '))).toEqual(CHECKS.map((check) => 'passed ' + check.job));
		expect(HOME.map((home) => home.fail.at(-1)!.trim().split(/\s+/).slice(0, 2).join(' '))).toEqual(CHECKS.map((check) => 'failed ' + check.job));
		expect(readFileSync(new URL('../../../../packages/analyzer/test-support/receipt-set.ts', import.meta.url), 'utf8')).toContain('has a failed verdict');
		expect(workflow).toContain("Committed agent files are out of sync with .ruler/. Run 'pnpm rules' and commit the result.");
	});

	it('draws a pending, passed, failed and hover state, a hit area, a ring and an arrow for every check', () => {
		expect(art.rows).toHaveLength(CHECKS.length);
		for (const row of art.rows) {
			for (const part of [row.pending, row.passed, row.failed, row.hover, row.ring, row.arrow]) expect(part.paths.length).toBeGreaterThan(0);
			expect(row.hit).toMatch(/^M/);
		}
	});
});
