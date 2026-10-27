import { readFileSync } from 'node:fs';
import { renderToString, type SsrRenderable } from '@markless/core';
import { describe, expect, it } from 'vitest';
import Subtitle from './subtitle.tsrx';
import Term from './term.tsrx';
import { GLOSSARY } from './term-glossary.ts';
import { drawing } from './term-ink.ts';
import { splitTerms } from './term-split.ts';

const sketches = drawing();
const source = readFileSync(new URL('./term.tsrx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../pages/index.mdx', import.meta.url), 'utf8');

// The compiled module is an SSR artifact; its editor type is the authored component.
const render = (component: unknown, props: Record<string, unknown>) =>
	renderToString(component as SsrRenderable, { props });

const tag = (html: string, pattern: RegExp) => html.match(pattern)?.[0] ?? '';

describe('Term', () => {
	it('is a focusable button in the text that points at its caption as its description', async () => {
		const html = await render(Term, { word: 'elements' });
		const button = tag(html, /<button[^>]*>elements<\/button>/);
		const tip = tag(html, /<div[^>]*data-term="elements"[^>]*>/);
		const id = tip.match(/\bid="([^"]+)"/)?.[1];
		expect(button).toContain('type="button"');
		expect(id).toBeTruthy();
		expect(button).toContain(`aria-describedby="${id}"`);
		expect(html).toContain(GLOSSARY.elements);
	});

	it('serves the popup hidden, with the drawing hidden from screen readers', async () => {
		const html = await render(Term, { word: 'events' });
		const tip = tag(html, /<div[^>]*data-term="events"[^>]*>/);
		expect(tip).toContain('hidden');
		expect(tip).toContain('role="tooltip"');
		expect(tag(html, /<svg[^>]*>/)).toContain('aria-hidden="true"');
		expect(html).toContain(GLOSSARY.events);
		expect(html).toContain('>onClick</text>');
	});

	it('labels the elements sketch with the tags that draw it', async () => {
		const html = await render(Term, { word: 'elements' });
		for (const label of ['&lt;h1&gt;', '&lt;p&gt;', '&lt;button&gt;']) expect(html).toContain(`>${label}</text>`);
	});

	it('is built on the headless tooltip, so its hover delay and dismissal come from the family', () => {
		expect(source).toContain("import { tooltip } from '@markless/ui'");
		expect(source).toContain('<tooltip.root');
		expect(source).not.toMatch(/popover|onPointerover|onFocus=|state\(/);
	});

	it('underlines the word with a dotted ink line', () => {
		expect(source).toContain('text-decoration: underline dotted var(--ink);');
	});

	it('writes captions with no em dashes or semicolons', () => {
		for (const caption of Object.values(GLOSSARY)) expect(caption).not.toMatch(/[—;]/);
	});

	it('draws with filled ink only: no filters, patterns, hrefs or dy', () => {
		expect(source).not.toMatch(/<(filter|pattern|use)\b|\bhref=|\bdy=/);
		for (const sketch of [sketches.elements, sketches.events]) {
			expect(sketch.ink.length).toBeGreaterThan(500);
			expect(sketch.pink).toMatch(/^M/);
		}
	});
});

describe('Subtitle', () => {
	it('keeps a plain text line as a paragraph', async () => {
		const html = await render(Subtitle, { text: 'Stacked sections.' });
		expect(html).toMatch(/<p class="page-subtitle[^"]*">Stacked sections\.<\/p>/);
	});

	it('turns listed words into terms and leaves the wording as written', async () => {
		const text = 'Write elements and events in JavaScript. Markless is designed to compile them to any device.';
		expect(splitTerms(text, 'elements events').map((piece) => piece.text).join('')).toBe(text);
		expect(splitTerms(text, 'events elements').filter((piece) => piece.term).map((piece) => piece.text)).toEqual(['elements', 'events']);
		const html = await render(Subtitle, { text, terms: 'elements events' });
		expect(html).toContain('role="paragraph"');
		expect(html.match(/aria-describedby=/g)).toHaveLength(2);
		expect(html.replace(/<[^>]*>/g, '')).toContain('Write elements and events in JavaScript.');
	});

	it('explains values and instructions on the reading page', async () => {
		const reading = readFileSync(new URL('../../pages/start/reading-tsrx.mdx', import.meta.url), 'utf8');
		expect(reading).toContain('<Subtitle text="Every .tsrx file is made of two things: values and instructions." terms="values instructions" />');
		for (const word of ['values', 'instructions'] as const) {
			const html = await render(Term, { word });
			expect(html).toContain(GLOSSARY[word]);
			expect(html).toContain('aria-describedby=');
		}
		expect(sketches.values.ink.length).toBeGreaterThan(100);
		expect(sketches.instructions.ink.length).toBeGreaterThan(100);
	});

	it('is what the intro page uses', () => {
		expect(page).toContain(
			'<Subtitle text="Write elements and events in JavaScript. Markless is designed to compile them to any device." terms="elements events" />',
		);
	});
});

describe('frozen art', () => {
	it('freezes the sketches into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by term.test.ts from term-ink.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './term-ink.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sketches, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./term-art.ts');
	});
});
