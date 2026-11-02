import { describe, expect, it } from 'vitest';
import { relative } from '../ink-logos.ts';
import { type Drawing, decor, themeArt } from './decor.ts';
import { NAV_DECOR, panels } from './sections.ts';

const cards = decor();
const theme = themeArt();

const frozen = (drawing: Drawing): Drawing => ({ ...drawing, wash: relative(drawing.wash), hatch: relative(drawing.hatch), ink: relative(drawing.ink) });

function sprite(): string {
	const symbols = Object.entries(cards).map(([name, drawing]) => {
		const { width, height, wash, hatch, ink } = frozen(drawing);
		return `<symbol id="${name}" viewBox="0 0 ${width} ${height}" overflow="visible"><path style="fill:var(--decor-wash);opacity:var(--decor-wash-opacity);mix-blend-mode:var(--decor-wash-blend)" d="${wash}"/><path fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round" opacity=".75" d="${hatch}"/><path fill="currentColor" d="${ink}"/></symbol>`;
	});
	return `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`;
}

describe('navbar drawings', () => {
	it('draws every card with one wash, hatching and ink', () => {
		for (const drawing of [...Object.values(cards), ...Object.values(theme)]) {
			for (const layer of [drawing.wash, drawing.hatch, drawing.ink]) expect(layer.length).toBeGreaterThan(40);
			expect(drawing.wash.match(/Z/g)?.length, 'one loose wash per drawing').toBe(1);
		}
	});

	it('draws one card per navbar link, and nothing no card shows', () => {
		const shown = panels.flatMap((panel) => panel.cards.map((card) => card.art));
		expect(new Set(shown).size).toBe(shown.length);
		expect(Object.keys(cards).sort()).toEqual([...shown].sort());
	});

	it('keeps the card sprite small', () => {
		expect(sprite().length).toBeLessThan(140_000);
	});

	it('freezes the card drawings into one sprite the navbar links into (run with -u after editing)', async () => {
		await expect(sprite()).toMatchFileSnapshot(`../../../public/${NAV_DECOR}`);
	});

	it('freezes the sun and moon into a module the theme toggle inlines (run with -u after editing)', async () => {
		const module = `// Written by decor.test.ts from decor.ts. Run \`vp test -u\` to refresh.
import type { Drawing } from './decor.ts';

export const art: { readonly sun: Drawing; readonly moon: Drawing } = ${JSON.stringify({ sun: frozen(theme.sun), moon: frozen(theme.moon) }, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./theme-art.art.ts');
	});
});
