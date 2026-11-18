import { expect, test } from 'vitest';
import type { NavSection } from '../nav.ts';
import { docsSearch, htmlPartsOf, pageFacts, searchIndex, type PageFacts } from './docs-search.ts';

test('a page reads as its h1 and its text cut at every heading with an id, without code, scripts or the outline rail', () => {
	const facts = pageFacts([
		'<h1>State is a <em>variable</em></h1><markless-outline><nav><a href="#a">Skip me</a></nav><script>no()</script></markless-outline>',
		'<p>Intro &amp; more.</p><pre><code>const hidden = 1;</code></pre>',
		'<h2 id="follow-the-wire">Follow the <code>wire</code></h2><p>It is a <code>let</code>.</p><ul><li>One</li><li>Two</li></ul>',
		'<h3 id="deeper">Deeper</h3><svg><text>drawn</text></svg><p>Last&#39;s words</p>',
	]);
	expect(facts).toEqual<PageFacts>({
		title: 'State is a variable',
		parts: [
			['', '', 'Intro & more.'],
			['follow-the-wire', 'Follow the wire', 'It is a let. One Two'],
			['deeper', 'Deeper', "Last's words"],
		],
	});
});

test('the HTML is read from either emit shape the router writes for an .mdx route', () => {
	const parts = `const marklessMdxParts = ${JSON.stringify([
		{ kind: 'html', html: '<h1>A</h1>' },
		{ kind: 'component', componentIndex: 0 },
		{ kind: 'html', html: '<p>B</p>' },
	])};`;
	expect(htmlPartsOf(`x\n${parts}\ny`)).toEqual(['<h1>A</h1>', '<p>B</p>']);
	expect(htmlPartsOf(`function f() { return { html: ${JSON.stringify('<h1>Solo</h1>')} }; }`)).toEqual(['<h1>Solo</h1>']);
	expect(htmlPartsOf('export default 1;')).toBeUndefined();
});

const sections: NavSection[] = [
	{
		title: 'Core',
		entries: [
			{ title: 'State', href: '/concepts/state', description: 'state()' },
			{ title: 'Errors', href: '/errors', description: 'Every error code.' },
		],
	},
];

test('the index lists sidebar pages in order; a .tsrx page falls back to its sidebar description, and an .mdx page with no facts stops the build', () => {
	const facts = new Map<string, PageFacts>([['/concepts/state', { title: 'State is a variable', parts: [['', '', 'Body']] }]]);
	expect(searchIndex(facts, (href) => href !== '/errors', sections)).toEqual({
		pages: [
			{ href: '/concepts/state', title: 'State is a variable', section: 'Core', parts: [['', '', 'Body']] },
			{ href: '/errors', title: 'Errors', section: 'Core', parts: [['', '', 'Every error code.']] },
		],
	});
	expect(() => searchIndex(new Map(), () => true, sections)).toThrow(/no MDX facts for \/concepts\/state, \/errors/);
});

test('only the client build emits the index file, and it refuses to emit one missing an .mdx page', () => {
	const [, collect] = docsSearch();
	const generateBundle = collect!.generateBundle as (this: unknown) => void;
	const emitted = (consumer: string) => {
		const files: string[] = [];
		try {
			generateBundle.call({ environment: { config: { consumer } }, emitFile: (file: { fileName: string }) => files.push(file.fileName) });
		} catch (error) {
			return String(error);
		}
		return files;
	};
	expect(emitted('server')).toEqual([]);
	expect(emitted('client')).toMatch(/no MDX facts/);
});
