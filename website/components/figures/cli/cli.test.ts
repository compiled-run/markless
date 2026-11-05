import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as questionnaire from './questionnaire.ts';

const figures = { 'questionnaire': questionnaire };

describe('cli figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'cli.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}

	it('asks the questions packages/cli asks, and the command matches the page', () => {
		const source = readFileSync(new URL('../../../../packages/cli/src/index.ts', import.meta.url), 'utf8');
		for (const { q, options } of questionnaire.QUESTIONS) {
			expect(source).toContain("message: '" + q + "'");
			for (const o of options) expect(source).toContain("label: '" + o + "'");
		}
		expect(questionnaire.LINES.join(' ').replace(/\\\s+/, '')).toBe('npm create markless@latest my-app -- --yes --starter app --no-git');
	});
});
