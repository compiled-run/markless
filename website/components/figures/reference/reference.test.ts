import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as packages from './packages.ts';

describe('reference figures', () => {
	it('packages draws the same scene twice', () => {
		expect(JSON.stringify(packages.drawing())).toBe(JSON.stringify(packages.drawing()));
	});

	it('packages is frozen', async () => {
		await expect(frozen('packages.ts', 'reference.test.ts', packages.drawing())).toMatchFileSnapshot('./packages.art.ts');
	});

	it('names the four installed packages and the five that come along', () => {
		const texts = packages.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		for (const row of packages.INSTALLED) expect(texts).toContain(packages.MANIFEST[row]);
		for (const name of packages.INNER) expect(texts).toContain(name);
	});
});
