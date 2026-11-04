import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as path_url from './path-url.ts';
import * as page_shape from './page-shape.ts';

const figures = { 'path-url': path_url, 'page-shape': page_shape };

describe('docs-guide figures', () => {
	for (const [name, figure] of Object.entries(figures)) {
		it(name + ' draws the same scene twice', () => {
			expect(JSON.stringify(figure.drawing())).toBe(JSON.stringify(figure.drawing()));
		});

		it(name + ' is frozen', async () => {
			await expect(frozen(name + '.ts', 'docs-guide.test.ts', figure.drawing())).toMatchFileSnapshot('./' + name + '.art.ts');
		});
	}
});
