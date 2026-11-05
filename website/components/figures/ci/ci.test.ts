import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECKS, drawing } from './checks.ts';

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

	it('draws a pending, passed, failed and hover state, a hit area, a ring and an arrow for every check', () => {
		expect(art.rows).toHaveLength(CHECKS.length);
		for (const row of art.rows) {
			for (const part of [row.pending, row.passed, row.failed, row.hover, row.ring, row.arrow]) expect(part.paths.length).toBeGreaterThan(0);
			expect(row.hit).toMatch(/^M/);
		}
	});
});
