import { describe, expect, it } from 'vitest';
import { art } from './controls.ts';

const drawn = art();

describe('ink controls art', () => {
	it('inks every part of each control', () => {
		for (const d of [drawn.toggle.face, drawn.toggle.wash, drawn.toggle.ink, drawn.toggle.knob.face, drawn.toggle.knob.ink, drawn.pick.ink, drawn.pick.caret]) expect(d.length).toBeGreaterThan(20);
		for (const sheet of [drawn.slip.wide, drawn.slip.narrow]) for (const d of [sheet.paper, sheet.ink, sheet.shadow.hatch]) expect(d.length).toBeGreaterThan(20);
	});

	it('draws the same every time', () => {
		expect(art()).toEqual(drawn);
	});
});

describe('frozen art', () => {
	it('matches the generator (run with -u after changing controls.ts)', async () => {
		const module = `// Written by controls.test.ts from controls.ts. Refresh with -u.
import type { art as drawing } from './controls.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(drawn, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./controls.art.ts');
	});
});
