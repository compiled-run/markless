import { describe, expect, it } from 'vitest';
import { frozen } from '../ink/freeze.ts';
import * as renders from './renders.ts';

describe('glossary figures', () => {
	it('renders draws the same scene twice', () => {
		expect(JSON.stringify(renders.drawing())).toBe(JSON.stringify(renders.drawing()));
	});

	it('renders is frozen', async () => {
		await expect(frozen('renders.ts', 'glossary.test.ts', renders.drawing())).toMatchFileSnapshot('./renders.art.ts');
	});

	it('draws one plan and four places it renders', () => {
		const texts = renders.drawing().layers.flatMap((l) => l.texts.map((t) => t.text));
		for (const place of renders.PLACES) expect(texts).toContain(place.call);
		expect(texts).toContain(renders.SOURCE[0]);
	});
});
