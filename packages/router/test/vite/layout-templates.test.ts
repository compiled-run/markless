import { describe, expect, test } from 'vitest';
import { layoutTemplates, sampleLayoutPaths } from '../../src/vite/layout-templates.ts';
import {
	encodeLayoutTemplate,
	LAYOUT_CONTENT_OPEN,
	layoutContent,
	splitByLayout,
	type LayoutTemplate,
} from '../../src/vite/runtime/layout-template.ts';

type Shape = {
	readonly nav: string;
	readonly item: string;
	readonly main: string;
	readonly links: readonly string[];
};

// Two unrelated page shapes: the same structure (chrome around content, an active link) with different names and tags.
const SHAPES: readonly Shape[] = [
	{
		nav: 'aside',
		item: 'a',
		main: 'main',
		links: Array.from({ length: 16 }, (_, at) => `/guide/${at}`),
	},
	{
		nav: 'nav',
		item: 'span',
		main: 'article',
		links: Array.from({ length: 20 }, (_, at) => `/x/topic-${at}`),
	},
];

function page(shape: Shape, active: string, body: string, head = 'Site'): string {
	const items = shape.links
		.map(
			(link) =>
				`<li class="entry${link === active ? ' entry--current' : ''}"><${shape.item} href="${link}" data-kind="side-link">${link.split('/').pop()} — a long label so the chrome outweighs a fill boundary</${shape.item}></li>`,
		)
		.join('');
	return `<!doctype html><html><head><title>${active} | ${head}</title><link rel="stylesheet" href="/site.css"></head><body><div data-async-container><header class="masthead"><a href="/">Home of the documentation site with a long header</a><button type="button">Theme toggle with words</button></header><${shape.nav} class="sidebar"><ul>${items}</ul></${shape.nav}><${shape.main}>${body}</${shape.main}><footer class="colophon">Released under a licence, with a long footer line that every page repeats.</footer><script type="application/json" data-routes>${JSON.stringify(shape.links.filter((link) => link !== active))}</script></div></body></html>`;
}

const WORDS = [
	'river',
	'lattice',
	'amber',
	'quorum',
	'falcon',
	'tundra',
	'mosaic',
	'cipher',
	'harbor',
	'orbit',
	'velvet',
	'glacier',
];
// Each page's own prose: words drawn from a seeded sequence, so no two pages share a sentence.
const body = (seed: number) => {
	let state = seed * 7919 + 17;
	const word = () =>
		WORDS[Math.floor(((state = (state * 48271) % 2147483647) / 2147483647) * WORDS.length)]!;
	return Array.from(
		{ length: 6 + (seed % 4) },
		() => `<p>${Array.from({ length: 14 }, word).join(' ')}</p>`,
	).join('');
};

const reassemble = (fills: readonly string[], template: LayoutTemplate) =>
	fills.reduce((whole, fill, index) => whole + (template.segments[index - 1] ?? '') + fill);

describe('layout templates', () => {
	for (const [index, shape] of SHAPES.entries()) {
		test(`pages that share chrome get one template that puts each page back exactly (shape ${index})`, async () => {
			const pages = shape.links.map((link, at) => ({
				path: link,
				text: page(shape, link, body(at)),
			}));
			const { templates } = await layoutTemplates(pages);
			expect(templates).toHaveLength(1);
			const template = templates[0]!;
			for (const { text } of pages) {
				const fills = splitByLayout(text, template)!;
				expect(reassemble(fills, template)).toBe(text);
				const own = fills.join('').length;
				// The chrome went to the template; what is left is the page's content and its active link.
				expect(own).toBeLessThan(text.length / 2);
			}
		});
	}

	test('two groups of pages with different chrome get a template each, and neither swallows the other', async () => {
		const pages = SHAPES.flatMap((shape) =>
			shape.links.map((link, at) => ({ path: link, text: page(shape, link, body(at)) })),
		);
		const { templates } = await layoutTemplates(pages);
		expect(templates).toHaveLength(2);
		for (const { text } of pages) {
			const matched = templates.filter((template) => splitByLayout(text, template));
			expect(matched).toHaveLength(1);
		}
	});

	test('a page whose chrome differs from every template is sent whole', async () => {
		const shape = SHAPES[0]!;
		const pages = shape.links.map((link, at) => ({
			path: link,
			text: page(shape, link, body(at)),
		}));
		const { templates } = await layoutTemplates(pages);
		const stranger = page(SHAPES[1]!, '/x/topic-1', body(1));
		expect(layoutContent(stranger, templates)).toBeUndefined();
	});

	test('a content body names its template and the length of the document it reassembles to', async () => {
		const shape = SHAPES[1]!;
		const pages = shape.links.map((link, at) => ({
			path: link,
			text: page(shape, link, body(at)),
		}));
		const [template] = (await layoutTemplates(pages)).templates;
		const text = pages[2]!.text;
		const content = layoutContent(text, [template!])!;
		expect(
			content.startsWith(`${LAYOUT_CONTENT_OPEN}${template!.hash}:${text.length}-->`),
		).toBe(true);
		expect(content.length).toBeLessThan(text.length / 2);
		expect(encodeLayoutTemplate(template!)).toBe(
			template!.segments.map((segment) => `${segment.length}:${segment}`).join(''),
		);
	});

	test('pages outside the sample, each leaving itself out of a list every other page carries, are held once they refine the template', async () => {
		const shape = SHAPES[0]!;
		const pages = shape.links.map((link, at) => ({
			path: link,
			text: page(shape, link, body(at)),
		}));
		const sample = pages.slice(0, 4);
		const rest = pages.slice(4);
		const sampled = await layoutTemplates(sample);
		expect(rest.filter(({ text }) => layoutContent(text, sampled.templates))).toHaveLength(0);
		const refined = await layoutTemplates(sample, rest);
		expect([refined.pages, refined.held]).toEqual([pages.length, pages.length]);
		for (const { text } of pages) expect(layoutContent(text, refined.templates)).toBeDefined();
	});

	test('pages too different to share a layout get no template', async () => {
		const pages = [
			{
				path: '/a',
				text: `<html><body>${'<p>alpha words here</p>'.repeat(40)}</body></html>`,
			},
			{
				path: '/b',
				text: `<html><body>${'<div>beta text there</div>'.repeat(40)}</body></html>`,
			},
		];
		expect((await layoutTemplates(pages)).templates).toEqual([]);
	});

	test('the build samples every section of the app, not only its first pages', () => {
		const paths = [
			...Array.from(
				{ length: 200 },
				(_, index) => `/docs/page-${String(index).padStart(3, '0')}`,
			),
			'/',
			'/blog/one',
			'/blog/two',
		];
		const sample = sampleLayoutPaths(paths);
		expect(sample.length).toBeLessThanOrEqual(48);
		expect(sample).toContain('/blog/one');
		expect(sample).toContain('/blog/two');
		expect(sample).toContain('/');
		const docs = sample.filter((path) => path.startsWith('/docs/')).sort();
		expect(docs.at(-1)! > '/docs/page-150').toBe(true);
	});
});
