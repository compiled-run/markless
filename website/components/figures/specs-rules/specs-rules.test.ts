import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as specs_folder from './specs-folder.ts';
import * as ruler_outputs from './ruler-outputs.ts';

const figures = { 'specs-folder': specs_folder, 'ruler-outputs': ruler_outputs };

describe('specs-rules figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'specs-rules.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}
});
