import { describe, expect, it } from 'vitest';
import { art, BAR } from './screen.ts';

const drawn = art();

describe('ink screen art', () => {
	it('inks every part of each sheet and button', () => {
		for (const sheet of [drawn.wide, drawn.narrow]) {
			for (const d of [sheet.paper, sheet.ink, sheet.shadow.wash, sheet.shadow.hatch, sheet.bar.rule, sheet.bar.dots, sheet.bar.url]) expect(d.length).toBeGreaterThan(20);
			expect(BAR).toBeLessThan(sheet.height / 4);
		}
		for (const part of [drawn.button, drawn.buttonAlt]) for (const d of [part.face, part.side, part.wash, part.ink]) expect(d.length).toBeGreaterThan(20);
		expect(drawn.ring.ink.length).toBeGreaterThan(20);
	});

	it('draws the same every time', () => {
		expect(art()).toEqual(drawn);
	});
});

describe('frozen art', () => {
	it('matches the generator (run with -u after changing screen.ts)', async () => {
		const module = `// Written by screen.test.ts from screen.ts. Run \`vp test -u\` to refresh.
import type { art as drawing } from './screen.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(drawn, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./screen.art.ts');
	});
});
