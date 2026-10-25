import { expect, test } from 'vitest';
import {
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_ISLANDS_ATTRIBUTE,
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_SHARED_PREFIX,
	PROTOCOL_OWN_ATTRIBUTE,
	PROTOCOL_STUB_ATTRIBUTE,
} from '@markless/web/fns/keep-parts';
import { mirrorKeptPartRules } from '../../src/vite/nitro-fragment-requests.ts';
import { keptPartsForFragment, keptSetOf } from '../../src/vite/runtime/kept-stubs.ts';

const shared = (hash: string) => `${PROTOCOL_KEEP_SHARED_PREFIX}${hash}`;
const keep = (hash: string) => `${PROTOCOL_KEEP_ATTRIBUTE}="${hash}"`;

test('a fragment address names its shared kept parts in its first segment, or none', () => {
	expect([...keptSetOf(`${shared('a1')}${shared('b2')}`)!]).toEqual([shared('a1'), shared('b2')]);
	expect(keptSetOf('docs')).toBeUndefined();
	expect(keptSetOf(`${shared('a1')}x!`)).toBeUndefined();
});

test('a kept part the page holds comes as its root tag and its own elements, everything else as rendered', () => {
	const html =
		`<main><header class="top" ${keep(shared('h1'))}><nav><a href="/a">A</a><script>if (a < b) "</div>";</script></nav>` +
		`<!-- </header> --><div class="body" ${PROTOCOL_OWN_ATTRIBUTE}><p>page</p>` +
		`<aside ${keep(shared('s1'))}><b>inner</b></aside></div><img src="x"><footer>f</footer></header>` +
		`<section ${keep(shared('other'))}><i>not held</i></section><p>after</p></main>`;
	expect(keptPartsForFragment(html, new Set([shared('h1'), shared('s1')]))).toBe(
			`<main><header ${PROTOCOL_STUB_ATTRIBUTE} class="top" ${keep(shared('h1'))}>` +
			`<div class="body" ${PROTOCOL_OWN_ATTRIBUTE}><p>page</p>` +
			`<aside ${PROTOCOL_STUB_ATTRIBUTE} ${keep(shared('s1'))}></aside></div></header>` +
			`<section ${keep(shared('other'))}><i>not held</i></section><p>after</p></main>`,
	);
});

test('a page that holds none of the parts gets the fragment as rendered', () => {
	const html = `<div ${keep(shared('h1'))}><span>x</span></div>`;
	expect(keptPartsForFragment(html, undefined)).toBe(html);
	expect(keptPartsForFragment(html, new Set([shared('zz')]))).toBe(html);
	// A part kept only while byte for byte equal is never named in an address.
	expect(keptPartsForFragment(`<div ${keep('plain1')}><span>x</span></div>`, new Set(['plain1']))).toBe(
		`<div ${keep('plain1')}><span>x</span></div>`,
	);
});

test("a kept part's event refs number this page's events, so every fragment lists them with its islands", () => {
	const islands = (list: unknown[]) =>
		`${PROTOCOL_ISLANDS_ATTRIBUTE}="${JSON.stringify(list).replace(/"/g, '&quot;')}"`;
	const html =
		`<nav ${keep(shared('n1'))} ${islands([[1, 'aria-current', 'page']])}><a href="/a">A</a>` +
		`<div ${PROTOCOL_OWN_ATTRIBUTE}><button ${PROTOCOL_EVENT_HOST_ATTRIBUTE}="click:9">page</button></div>` +
		`<ul ${PROTOCOL_EVENT_HOST_ATTRIBUTE}="visible:4"><li>x</li></ul></nav>`;
	const listed = [
		[1, 'aria-current', 'page'],
		[3, PROTOCOL_EVENT_HOST_ATTRIBUTE, 'visible:4'],
	];
	expect(keptPartsForFragment(html, undefined)).toBe(
		html.replace(islands([[1, 'aria-current', 'page']]), islands(listed)),
	);
	expect(keptPartsForFragment(html, new Set([shared('n1')]))).toBe(
		`<nav ${PROTOCOL_STUB_ATTRIBUTE} ${keep(shared('n1'))} ${islands(listed)}>` +
			`<div ${PROTOCOL_OWN_ATTRIBUTE}><button ${PROTOCOL_EVENT_HOST_ATTRIBUTE}="click:9">page</button></div></nav>`,
	);
});

test('every fragment rule gets a twin for the address that names kept parts, never prerendered, never over an own rule', () => {
	const rules: Record<string, Record<string, unknown>> = {
		'/docs': { prerender: true, isr: 60 },
		'/_markless/fragment/docs': { prerender: true, isr: { expiration: 60 } },
		'/_markless/fragment/': { isr: false },
		'/_markless/fragment/*/blog': { isr: 5 },
		'/_markless/fragment/blog': { isr: 60 },
	};
	mirrorKeptPartRules(rules);
	expect(rules).toEqual({
		'/docs': { prerender: true, isr: 60 },
		'/_markless/fragment/docs': { prerender: true, isr: { expiration: 60 } },
		'/_markless/fragment/*/docs': { isr: { expiration: 60 } },
		'/_markless/fragment/': { isr: false },
		'/_markless/fragment/*/': { isr: false },
		'/_markless/fragment/*/blog': { isr: 5 },
		'/_markless/fragment/blog': { isr: 60 },
	});
});
