import { describe, expect, it } from 'vitest';
import { relative } from '../ink-logos.ts';
import { type Drawing, decor, edges, type Layer, type LayerKind, type Motion, themeArt } from './decor.ts';
import { NAV_DECOR, panels } from './sections.ts';

const cards = decor();
const theme = themeArt();
const frames = edges();

const frozen = (drawing: Drawing): Drawing => ({
	...drawing,
	layers: drawing.layers.map((layer) => ({ ...layer, d: relative(layer.d) })),
});

const PAINT: Record<Exclude<LayerKind, 'over-wash'>, string> = {
	paper: 'style="fill:var(--decor-paper)"',
	wash: 'style="fill:var(--decor-wash);opacity:var(--decor-wash-opacity);mix-blend-mode:var(--decor-wash-blend)"',
	hatch: 'fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round" opacity=".75"',
	ink: 'fill="currentColor"',
};

/** The hatching and ink over a wash, linked again in the on-wash ink and cut to the wash; hidden unless the card sets `--decor-on-wash-display`. */
function overWash(name: string, layer: Layer): string {
	const clip = `${name}-c${layer.uses![0]}`;
	const uses = layer.uses!.map((id) => `<use href="#${name}-${id}"/>`).join('');
	return `<clipPath id="${clip}"><path d="${layer.d}"/></clipPath><g clip-path="url(#${clip})" style="display:var(--decor-on-wash-display,none);color:var(--decor-on-wash)">${uses}</g>`;
}

const paint = (name: string, layer: Layer) =>
	layer.kind === 'over-wash' ? overWash(name, layer) : `<path${layer.id ? ` id="${name}-${layer.id}"` : ''} ${PAINT[layer.kind]} d="${layer.d}"/>`;

function motionStyle(motion: Motion, box: readonly number[]): string {
	const delay = motion.delay ? ` ${motion.delay}ms` : '';
	// The hover spring comes from the card, which carries the navbar's spring variables.
	const move = `transform ${motion.easing ? `320ms ${motion.easing}` : 'var(--spring-hover-ms) var(--spring-hover)'}${delay}`;
	return [
		`transform:${motion.transform}`,
		`transform-origin:${motion.origin[0] - box[0]!}px ${motion.origin[1] - box[1]!}px`,
		...(motion.opacity ? [`opacity:${motion.opacity}`, `transition:${move},opacity 120ms`] : [`transition:${move}`]),
	].join(';');
}

function sprite(): string {
	const symbols = Object.entries(cards).map(([name, drawing]) => {
		const { box, layers } = frozen(drawing);
		let body = '';
		for (let k = 0; k < layers.length; ) {
			const motion = layers[k]!.motion;
			let group = '';
			for (; k < layers.length && layers[k]!.motion === motion; k++) group += paint(name, layers[k]!);
			// Inline, because a stylesheet cannot reach into a <use> clone; the card sets --hover and the clone inherits it.
			body += motion ? `<g style="${motionStyle(motion, box)}">${group}</g>` : group;
		}
		return `<symbol id="${name}" viewBox="${box.join(' ')}" overflow="visible">${body}</symbol>`;
	});
	// An edge stretches to its card or panel, which keeps the size it was drawn for.
	const edgeSymbols = Object.entries(frames).map(([name, drawing]) => {
		const { width, height, layers } = frozen(drawing);
		return `<symbol id="edge-${name}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" overflow="visible">${layers.map((layer) => paint(`edge-${name}`, layer)).join('')}</symbol>`;
	});
	return `<svg xmlns="http://www.w3.org/2000/svg">\n${[...symbols, ...edgeSymbols].join('\n')}\n</svg>\n`;
}

const module = (name: string, type: string, value: unknown) => `// Written by decor.test.ts from decor.ts. Run \`vp test -u\` to refresh.
import type { Drawing } from './decor.ts';

export const ${name}: ${type} = ${JSON.stringify(value, null, '\t')};
`;

describe('navbar drawings', () => {
	it('draws every card with a wash, hatching and ink', () => {
		for (const drawing of [...Object.values(cards), ...Object.values(theme)]) {
			for (const kind of ['wash', 'hatch', 'ink'] as const)
				expect(drawing.layers.some((layer) => layer.kind === kind && layer.d.length > 40)).toBe(true);
		}
	});

	// Paper is what lets a front object hide what it rests on: a pencil on a page covers the page's rules.
	it('paints objects back to front, each one hiding the ink behind it', () => {
		for (const [name, drawing] of Object.entries(cards)) {
			const kinds = drawing.layers.map((layer) => layer.kind);
			expect(kinds.lastIndexOf('paper'), `${name} lays a later object over an earlier one's ink`).toBeGreaterThan(kinds.indexOf('ink'));
		}
	});

	it('draws one card per navbar link, and nothing no card shows', () => {
		const shown = panels.flatMap((panel) => panel.cards.map((card) => card.art));
		expect(new Set(shown).size).toBe(shown.length);
		expect(Object.keys(cards).sort()).toEqual([...shown].sort());
	});

	it('keeps the card sprite small', () => {
		expect(sprite().length).toBeLessThan(205_000);
	});

	it('freezes the card drawings into one sprite the navbar links into (run with -u after editing)', async () => {
		await expect(sprite()).toMatchFileSnapshot(`../../../public/${NAV_DECOR}`);
	});

	it('freezes the sun and moon into a module the theme toggle inlines (run with -u after editing)', async () => {
		await expect(module('art', '{ readonly sun: Drawing; readonly moon: Drawing; readonly magnifier: Drawing }', { sun: frozen(theme.sun), moon: frozen(theme.moon), magnifier: frozen(theme.magnifier) })).toMatchFileSnapshot('./theme-art.art.ts');
	});

});
