import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { relative } from '../ink-logos.ts';
import { cardCss, drawing, noteIcons } from './card-ink.ts';

const GLOBAL_CSS = new URL('../../../styles/global.css', import.meta.url);
const START = '/* ink-card art: written by components/docs/ink-card/card-ink.test.ts from card-ink.ts; refresh with `vp test -u`. */\n';
const END = '/* end ink-card art */';

describe('ink card', () => {
	const art = drawing();

	it('inks every side with a main stroke and a fainter pass', () => {
		for (const side of [art.top, art.bottom, art.left, art.right]) {
			expect(side.main.length).toBeGreaterThan(200);
			expect(side.trace.length).toBeGreaterThan(40);
		}
	});

	it('is frozen into global.css as masks only, drawn in black so tokens colour it (run with -u after editing)', async () => {
		const css = readFileSync(GLOBAL_CSS, 'utf8');
		const start = css.indexOf(START);
		const end = css.indexOf(END);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const block = cardCss(art);
		expect(block).not.toMatch(/%3C(filter|pattern|use|image)\b|href=/);
		expect(block.length).toBeLessThan(40_000);
		await expect(css.slice(0, start + START.length) + block + css.slice(end)).toMatchFileSnapshot(GLOBAL_CSS.pathname);
	});

	it('freezes the note icons into a module the callout inlines (run with -u after editing)', async () => {
		const icons = Object.fromEntries(
			Object.entries(noteIcons()).map(([kind, icon]) => [kind, { ...icon, layers: icon.layers.map((layer) => ({ ...layer, d: relative(layer.d) })) }]),
		);
		for (const icon of Object.values(icons)) for (const kind of ['wash', 'ink']) expect(icon.layers.some((layer) => layer.kind === kind)).toBe(true);
		await expect(`// Written by card-ink.test.ts from card-ink.ts. Run \`vp test -u\` to refresh.
import type { Drawing } from '../navbar/decor.ts';
import type { NoteKind } from './card-ink.ts';

export const icons: Readonly<Record<NoteKind, Drawing>> = ${JSON.stringify(icons, null, '\t')};
`).toMatchFileSnapshot('./note-icons.art.ts');
	});
});
